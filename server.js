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
// 1. DÉTECTION AUTOMATIQUE DES CHEMINS (BULLETPROOF)
// ============================================
// Si le dossier 'public' est à côté de server.js, on reste ici.
// Sinon, on remonte d'un cran (cas où server.js est dans un dossier 'server/')
const hasPublicHere = fs.existsSync(path.join(__dirname, 'public'));
const baseDir = hasPublicHere ? __dirname : path.join(__dirname, '..');

const publicDir = path.join(baseDir, 'public');
const uploadDir = path.join(baseDir, 'uploads', 'properties');

console.log('🔍 baseDir détecté:', baseDir);
console.log('📁 publicDir:', publicDir);
console.log('📁 uploadDir:', uploadDir);

// ============================================
// 2. MIDDLEWARES
// ============================================
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Servir les fichiers statiques
app.use(express.static(publicDir));
app.use('/uploads', express.static(path.join(baseDir, 'uploads')));

// Log des requêtes pour débogage
app.use((req, res, next) => {
    console.log(`📥 Requête reçue: ${req.method} ${req.path}`);
    next();
});

// Rate Limiter
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' }
});

// Configuration Multer
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
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        if (allowedTypes.test(path.extname(file.originalname).toLowerCase()) && allowedTypes.test(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Seules les images sont acceptées'));
        }
    }
});

app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Fichier trop volumineux (max 5 MB)' : err.message });
    } else if (err) {
        return res.status(400).json({ error: err.message });
    }
    next();
});

// ============================================
// 3. BASE DE DONNÉES
// ============================================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

pool.connect((err, client, release) => {
    if (err) console.error('❌ Erreur BDD:', err.message);
    else {
        console.log('✅ Connecté à la base de données');
        release();
    }
});

let verifyToken = (req, res, next) => next();
let verifyAdmin = (req, res, next) => next();
try {
    const auth = require('./middlewares/auth');
    verifyToken = auth.verifyToken;
    verifyAdmin = auth.verifyAdmin;
} catch (e) {
    console.log('⚠️ Middlewares auth non trouvés, mode dégradé.');
}

// ============================================
// 4. ROUTES API (Doivent être AVANT le catch-all)
// ============================================
app.get('/api/health', (req, res) => {
    console.log('✅ Route /api/health appelée avec succès !');
    res.json({ status: 'online', environment: process.env.NODE_ENV || 'development' });
});

app.get('/api/properties', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM properties ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ... (Gardez vos autres routes /api/... ici) ...

app.post('/api/users/login', loginLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) return res.status(401).json({ error: 'Identifiants incorrects' });
        const user = result.rows[0];
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordValid) return res.status(401).json({ error: 'Identifiants incorrects' });
        const token = jwt.sign({ id: user.id, email: user.email, role: user.role, full_name: user.full_name }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ message: 'Connexion réussie', token, user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role } });
    } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});
// ============================================
// ROUTES ADMIN - PROPRIÉTÉS
// ============================================

// Récupérer toutes les propriétés (Admin)
app.get('/api/admin/properties', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM properties ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        console.error('Erreur chargement propriétés:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Créer une propriété (Admin)
app.post('/api/admin/properties', verifyToken, verifyAdmin, upload.array('images', 5), async (req, res) => {
    try {
        const {
            title, city, neighborhood, type, transaction,
            price, surface, bedrooms, bathrooms,
            description, is_new, is_luxury, lat, lng
        } = req.body;

        const price_label = parseInt(price).toLocaleString('en-US') + ' MAD';
        
        let image_urls = [];
        if (req.files && req.files.length > 0) {
            image_urls = req.files.map(file => `/uploads/properties/${file.filename}`);
        }

        const result = await pool.query(
            `INSERT INTO properties 
            (title, city, neighborhood, type, transaction, price, price_label,
             surface, bedrooms, bathrooms, image_url, images, description, is_new, is_luxury, lat, lng)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            RETURNING *`,
            [title, city, neighborhood, type, transaction, price, price_label,
             surface, bedrooms, bathrooms, image_urls[0] || null, JSON.stringify(image_urls), 
             description, is_new === 'true', is_luxury === 'true', lat, lng]
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Erreur création propriété:', err);
        res.status(500).json({ error: 'Erreur serveur: ' + err.message });
    }
});

// Modifier une propriété (Admin)
app.put('/api/admin/properties/:id', verifyToken, verifyAdmin, upload.array('images', 5), async (req, res) => {
    try {
        const { id } = req.params;
        const {
            title, city, neighborhood, type, transaction,
            price, surface, bedrooms, bathrooms,
            description, is_new, is_luxury, lat, lng,
            existing_images
        } = req.body;

        const price_label = parseInt(price).toLocaleString('en-US') + ' MAD';
        
        let image_urls = [];
        if (existing_images) {
            try {
                image_urls = JSON.parse(existing_images);
            } catch (e) {
                image_urls = [existing_images];
            }
        }
        
        if (req.files && req.files.length > 0) {
            const newImages = req.files.map(file => `/uploads/properties/${file.filename}`);
            image_urls = [...image_urls, ...newImages];
        }

        const result = await pool.query(
            `UPDATE properties 
            SET title=$1, city=$2, neighborhood=$3, type=$4, transaction=$5,
                price=$6, price_label=$7, surface=$8, bedrooms=$9, bathrooms=$10,
                image_url=$11, images=$12, description=$13, is_new=$14, is_luxury=$15,
                lat=$16, lng=$17, updated_at=CURRENT_TIMESTAMP
            WHERE id=$18
            RETURNING *`,
            [title, city, neighborhood, type, transaction, price, price_label,
             surface, bedrooms, bathrooms, image_urls[0] || null, JSON.stringify(image_urls),
             description, is_new === 'true', is_luxury === 'true', lat, lng, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Propriété non trouvée' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Erreur modification propriété:', err);
        res.status(500).json({ error: 'Erreur serveur: ' + err.message });
    }
});

// Supprimer une propriété (Admin)
app.delete('/api/admin/properties/:id', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM properties WHERE id = $1 RETURNING *', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Propriété non trouvée' });
        }

        res.json({ message: 'Propriété supprimée' });
    } catch (err) {
        console.error('Erreur suppression propriété:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ============================================
// ROUTES ADMIN - MESSAGES
// ============================================

// Récupérer tous les messages (Admin)
app.get('/api/admin/messages', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM contact_messages ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        console.error('Erreur chargement messages:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Marquer un message comme lu (Admin)
app.put('/api/admin/messages/:id/read', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            'UPDATE contact_messages SET is_read = TRUE WHERE id = $1 RETURNING *',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Message non trouvé' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Erreur mise à jour message:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Supprimer un message (Admin)
app.delete('/api/admin/messages/:id', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM contact_messages WHERE id = $1 RETURNING *', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Message non trouvé' });
        }

        res.json({ message: 'Message supprimé' });
    } catch (err) {
        console.error('Erreur suppression message:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ============================================
// 5. ROUTE CATCH-ALL (FRONTEND) - TOUT À LA FIN
// ============================================
app.use((req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
        return next();
    }
    const indexPath = path.join(publicDir, 'index.html');
    res.sendFile(indexPath, (err) => {
        if (err) {
            console.error('❌ Erreur envoi index.html:', err);
            res.status(404).send('Fichier non trouvé. Vérifiez le dossier public/');
        }
    });
});

// ============================================
// 6. DÉMARRAGE
// ============================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
