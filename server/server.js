require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;

// ============================================
// 1. MIDDLEWARES
// ============================================
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Servir les fichiers statiques (frontend)
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rate Limiter pour le login
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    message: { error: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' }
});

// Configuration Multer (Upload d'images)
const uploadDir = path.join(__dirname, 'uploads', 'properties');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'property-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        if (allowedTypes.test(path.extname(file.originalname).toLowerCase()) && allowedTypes.test(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Seules les images sont acceptées (JPG, PNG, GIF, WEBP)'));
        }
    }
});

// Middleware de gestion des erreurs Multer
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Fichier trop volumineux (max 5 MB)' : err.message });
    } else if (err) {
        return res.status(400).json({ error: err.message });
    }
    next();
});

// ============================================
// 2. CONFIGURATION BASE DE DONNÉES
// ============================================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test de connexion (Logs corrigés)
pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ Erreur de connexion à PostgreSQL:', err.message);
    } else {
        console.log('✅ Connecté à la base de données avec succès');
        release();
    }
});

// Import des middlewares d'authentification (assurez-vous que ce fichier existe)
let verifyToken, verifyAdmin;
try {
    const auth = require('./middlewares/auth');
    verifyToken = auth.verifyToken;
    verifyAdmin = auth.verifyAdmin;
} catch (e) {
    console.log('⚠️ Middlewares auth non trouvés, certaines routes admin peuvent échouer.');
    // Fallback simple pour éviter le crash si le fichier manque
    verifyToken = (req, res, next) => next();
    verifyAdmin = (req, res, next) => next();
}

// ============================================
// 3. ROUTES PUBLIQUES
// ============================================
app.get('/api/health', (req, res) => {
    res.json({ status: 'online', environment: process.env.NODE_ENV || 'development' });
});

app.get('/api/properties', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM properties ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/properties/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM properties WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Propriété non trouvée' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/contact', async (req, res) => {
    try {
        const { full_name, email, phone, subject, message } = req.body;
        await pool.query(
            `INSERT INTO contact_messages (full_name, email, phone, subject, message) VALUES ($1, $2, $3, $4, $5)`,
            [full_name, email, phone, subject, message]
        );
        res.status(201).json({ message: 'Message envoyé avec succès' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/users/register', async (req, res) => {
    try {
        const { full_name, email, phone, password } = req.body;
        if (!password || password.length < 6) return res.status(400).json({ error: 'Mot de passe trop court' });

        const existing = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (existing.rows.length > 0) return res.status(400).json({ error: 'Email déjà utilisé' });

        const passwordHash = await bcrypt.hash(password, 10);
        const result = await pool.query(
            `INSERT INTO users (full_name, email, phone, password_hash, role) VALUES ($1, $2, $3, $4, 'user') RETURNING id, full_name, email, role`,
            [full_name, email, phone, passwordHash]
        );
        res.status(201).json({ message: 'Utilisateur créé', user: result.rows[0] });
    } catch (err) {
        console.error('Erreur register:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/users/login', loginLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });

        const user = result.rows[0];
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordValid) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role, full_name: user.full_name },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );
        res.json({ message: 'Connexion réussie', token, user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role } });
    } catch (err) {
        console.error('Erreur login:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ============================================
// 4. ROUTES ADMIN PROTÉGÉES
// ============================================
app.post('/api/admin/properties', verifyToken, verifyAdmin, upload.array('images', 5), async (req, res) => {
    try {
        const { title, city, neighborhood, type, transaction, price, surface, bedrooms, bathrooms, description, is_new, is_luxury, lat, lng } = req.body;
        const price_label = parseInt(price).toLocaleString('en-US') + ' MAD';
        
        let image_urls = req.files ? req.files.map(f => `/uploads/properties/${f.filename}`) : [];
        const image_url = image_urls[0] || null;

        const result = await pool.query(
            `INSERT INTO properties (title, city, neighborhood, type, transaction, price, price_label, surface, bedrooms, bathrooms, image_url, images, description, is_new, is_luxury, lat, lng)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING *`,
            [title, city, neighborhood, type, transaction, price, price_label, surface, bedrooms, bathrooms, image_url, JSON.stringify(image_urls), description, is_new === 'true', is_luxury === 'true', lat, lng]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Erreur ajout propriété:', err);
        res.status(500).json({ error: 'Erreur serveur: ' + err.message });
    }
});

app.put('/api/admin/properties/:id', verifyToken, verifyAdmin, upload.array('images', 5), async (req, res) => {
    try {
        const { id } = req.params;
        const { title, city, neighborhood, type, transaction, price, surface, bedrooms, bathrooms, description, is_new, is_luxury, lat, lng, existing_images } = req.body;
        const price_label = parseInt(price).toLocaleString('en-US') + ' MAD';
        
        let image_urls = [];
        if (existing_images) {
            try { image_urls = JSON.parse(existing_images); } catch (e) { image_urls = [existing_images]; }
        }
        if (req.files) {
            image_urls = [...image_urls, ...req.files.map(f => `/uploads/properties/${f.filename}`)];
        }

        const result = await pool.query(
            `UPDATE properties SET title=$1, city=$2, neighborhood=$3, type=$4, transaction=$5, price=$6, price_label=$7, surface=$8, bedrooms=$9, bathrooms=$10, image_url=$11, images=$12, description=$13, is_new=$14, is_luxury=$15, lat=$16, lng=$17, updated_at=CURRENT_TIMESTAMP WHERE id=$18 RETURNING *`,
            [title, city, neighborhood, type, transaction, price, price_label, surface, bedrooms, bathrooms, image_urls[0], JSON.stringify(image_urls), description, is_new === 'true', is_luxury === 'true', lat, lng, id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Propriété non trouvée' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Erreur modif propriété:', err);
        res.status(500).json({ error: 'Erreur serveur: ' + err.message });
    }
});

app.delete('/api/admin/properties/:id', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM properties WHERE id = $1 RETURNING *', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Propriété non trouvée' });
        res.json({ message: 'Propriété supprimée' });
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/admin/users', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, full_name, email, phone, role, created_at FROM users ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.delete('/api/admin/users/:id', verifyToken, verifyAdmin, async (req, res) => {
    try {
        if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
        const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Utilisateur non trouvé' });
        res.json({ message: 'Utilisateur supprimé' });
    } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.put('/api/admin/users/:id/role', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { role } = req.body;
        if (!['user', 'admin'].includes(role)) return res.status(400).json({ error: 'Rôle invalide' });
        const result = await pool.query('UPDATE users SET role = $1 WHERE id = $2 RETURNING id, full_name, email, role', [role, req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Utilisateur non trouvé' });
        res.json({ message: 'Rôle mis à jour', user: result.rows[0] });
    } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.get('/api/admin/users/stats', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const result = await pool.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE role = 'admin') as admins, COUNT(*) FILTER (WHERE role = 'user') as users FROM users`);
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.get('/api/admin/messages', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM contact_messages ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.put('/api/admin/messages/:id/read', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const result = await pool.query('UPDATE contact_messages SET is_read = TRUE WHERE id = $1 RETURNING *', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Message non trouvé' });
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.delete('/api/admin/messages/:id', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM contact_messages WHERE id = $1 RETURNING *', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Message non trouvé' });
        res.json({ message: 'Message supprimé' });
    } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.get('/api/users/favorites/:propertyId', verifyToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM favorites WHERE user_id = $1 AND property_id = $2', [req.user.id, req.params.propertyId]);
        res.json({ isFavorite: result.rows.length > 0 });
    } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.post('/api/users/favorites/:propertyId', verifyToken, async (req, res) => {
    try {
        await pool.query('INSERT INTO favorites (user_id, property_id) VALUES ($1, $2) ON CONFLICT (user_id, property_id) DO NOTHING', [req.user.id, req.params.propertyId]);
        res.json({ isFavorite: true });
    } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.delete('/api/users/favorites/:propertyId', verifyToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM favorites WHERE user_id = $1 AND property_id = $2', [req.user.id, req.params.propertyId]);
        res.json({ isFavorite: false });
    } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ============================================
// 5. ROUTE CATCH-ALL (FRONTEND) - DOIT ÊTRE À LA FIN !
// ============================================
// IMPORTANT: Utiliser app.use() SANS chemin pour éviter le bug path-to-regexp
app.use((req, res, next) => {
    // Ne servir index.html que si ce n'est pas une route API
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
        return next();
    }
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});


// ============================================
// 6. DÉMARRAGE DU SERVEUR
// ============================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
