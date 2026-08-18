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
const cloudinary = require('cloudinary').v2;

const app = express();
const PORT = process.env.PORT || 10000;

// ============================================
// 1. DÉTECTION AUTOMATIQUE DES CHEMINS
// ============================================
const hasPublicHere = fs.existsSync(path.join(__dirname, 'public'));
const baseDir = hasPublicHere ? __dirname : path.join(__dirname, '..');

const publicDir = path.join(baseDir, 'public');
const uploadDir = path.join(baseDir, 'uploads', 'properties');

console.log('🔍 baseDir détecté:', baseDir);
console.log('📁 publicDir:', publicDir);

// ============================================
// 2. CONFIGURATION CLOUDINARY
// ============================================
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// ============================================
// 3. MIDDLEWARES
// ============================================
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(express.static(publicDir));
app.use('/uploads', express.static(path.join(baseDir, 'uploads')));

app.use((req, res, next) => {
    console.log(`📥 Requête: ${req.method} ${req.path}`);
    next();
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' }
});

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        if (allowedTypes.test(file.mimetype)) {
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
// 4. BASE DE DONNÉES
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

// ============================================
// MIDDLEWARES D'AUTHENTIFICATION (Intégrés)
// ============================================
const verifyToken = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Token manquant. Veuillez vous connecter.' });
        }
        
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // ✅ C'EST ICI QUE req.user EST DÉFINI !
        req.user = {
            id: decoded.id,
            email: decoded.email,
            role: decoded.role,
            full_name: decoded.full_name
        };
        
        next();
    } catch (err) {
        console.error('❌ Erreur verifyToken:', err.message);
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Session expirée. Veuillez vous reconnecter.' });
        }
        return res.status(401).json({ error: 'Token invalide.' });
    }
};

const verifyAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Accès réservé aux administrateurs.' });
    }
    next();
};

// ============================================
// 5. ROUTES PUBLIQUES
// ============================================
app.get('/api/health', (req, res) => {
    res.json({ status: 'online', environment: process.env.NODE_ENV || 'development' });
});

// Récupérer les propriétés (filtrées selon le rôle)
app.get('/api/properties', async (req, res) => {
    try {
        let query = 'SELECT * FROM properties';
        let params = [];
        
        // Si l'utilisateur est connecté et n'est PAS admin, ne montrer que ses biens
        if (req.headers.authorization) {
            try {
                const token = req.headers.authorization.split(' ')[1];
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                
                if (decoded.role !== 'admin') {
                    query += ' WHERE user_id = $1';
                    params.push(decoded.id);
                }
            } catch (e) {
                // Token invalide, on ignore et on montre tout (ou rien selon votre choix)
            }
        }
        
        query += ' ORDER BY created_at DESC';
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Erreur chargement propriétés:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ✅ ROUTE IMPORTANTE : Récupérer un bien par ID
app.get('/api/properties/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log('📥 Recherche du bien ID:', id);
        
        const result = await pool.query('SELECT * FROM properties WHERE id = $1', [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Property not found' });
        }
        
        console.log('✅ Bien trouvé:', result.rows[0].title);
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Erreur chargement propriété par ID:', err);
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
        console.error('Erreur contact:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ============================================
// 6. ROUTES UTILISATEURS
// ============================================
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
        if (result.rows.length === 0) return res.status(401).json({ error: 'Identifiants incorrects' });
        
        const user = result.rows[0];
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordValid) return res.status(401).json({ error: 'Identifiants incorrects' });
        
        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role, full_name: user.full_name },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        res.json({ message: 'Connexion réussie', token, user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role } });
    } catch (err) {
        console.error('Erreur login:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ============================================
// 7. ROUTES ADMIN - PROPRIÉTÉS
// ============================================
// Admin : voir tous les biens (y compris ceux des users)
app.get('/api/admin/properties', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.*, u.full_name as owner_name 
            FROM properties p 
            LEFT JOIN users u ON p.user_id = u.id 
            ORDER BY p.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Erreur:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Créer une propriété (accessible aux users ET admins)
app.post('/api/properties', verifyToken, upload.array('images', 5), async (req, res) => {
    try {
        const { title, city, neighborhood, type, transaction, price, surface, bedrooms, bathrooms, description, is_new, is_luxury, lat, lng } = req.body;
        const userId = req.user.id; // Récupéré depuis le token
        
        const priceNum = parseFloat(price);
        if (isNaN(priceNum) || priceNum < 0) {
            return res.status(400).json({ error: 'Prix invalide' });
        }
        const price_label = priceNum.toLocaleString('en-US') + ' MAD';
        
        let image_urls = [];
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                const b64 = Buffer.from(file.buffer).toString('base64');
                const dataURI = 'data:' + file.mimetype + ';base64,' + b64;
                const result = await cloudinary.uploader.upload(dataURI, {
                    folder: 'kenzia-estates/properties',
                    transformation: [{ width: 1200, crop: 'limit' }, { quality: 'auto:good' }]
                });
                image_urls.push(result.secure_url);
            }
        }

        const image_url = image_urls[0] || null;
        const images_json = JSON.stringify(image_urls);

        const result = await pool.query(
            `INSERT INTO properties 
            (title, city, neighborhood, type, transaction, price, price_label, surface, bedrooms, bathrooms, image_url, images, description, is_new, is_luxury, lat, lng, user_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
            RETURNING *`,
            [title, city, neighborhood, type, transaction, priceNum, price_label, surface, bedrooms, bathrooms, image_url, images_json, description, is_new === 'true', is_luxury === 'true', lat, lng, userId]
        );

        console.log('✅ Propriété créée par user ID:', userId);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Erreur création propriété:', err);
        res.status(500).json({ error: 'Erreur serveur: ' + err.message });
    }
});

// Modifier une propriété (user ne peut modifier que ses biens)
app.put('/api/properties/:id', verifyToken, upload.array('images', 5), async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const isAdmin = req.user.role === 'admin';
        
        // Vérifier que le bien existe et appartient à l'utilisateur (ou admin)
        const checkResult = await pool.query('SELECT * FROM properties WHERE id = $1', [id]);
        if (checkResult.rows.length === 0) {
            return res.status(404).json({ error: 'Propriété non trouvée' });
        }
        
        if (!isAdmin && checkResult.rows[0].user_id !== userId) {
            return res.status(403).json({ error: 'Vous ne pouvez modifier que vos propres biens' });
        }
        
        const { title, city, neighborhood, type, transaction, price, surface, bedrooms, bathrooms, description, is_new, is_luxury, lat, lng, existing_images } = req.body;
        const priceNum = parseFloat(price);
        const price_label = priceNum.toLocaleString('en-US') + ' MAD';
        
        let image_urls = [];
        if (existing_images) {
            try { image_urls = JSON.parse(existing_images); } catch (e) { image_urls = [existing_images]; }
        }
        
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                const b64 = Buffer.from(file.buffer).toString('base64');
                const dataURI = 'data:' + file.mimetype + ';base64,' + b64;
                const result = await cloudinary.uploader.upload(dataURI, {
                    folder: 'kenzia-estates/properties',
                    transformation: [{ width: 1200, crop: 'limit' }, { quality: 'auto:good' }]
                });
                image_urls.push(result.secure_url);
            }
        }

        const result = await pool.query(
            `UPDATE properties 
            SET title=$1, city=$2, neighborhood=$3, type=$4, transaction=$5, price=$6, price_label=$7, 
                surface=$8, bedrooms=$9, bathrooms=$10, image_url=$11, images=$12, description=$13, 
                is_new=$14, is_luxury=$15, lat=$16, lng=$17, updated_at=CURRENT_TIMESTAMP 
            WHERE id=$18 RETURNING *`,
            [title, city, neighborhood, type, transaction, priceNum, price_label, surface, bedrooms, bathrooms, image_urls[0] || null, JSON.stringify(image_urls), description, is_new === 'true', is_luxury === 'true', lat, lng, id]
        );

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Erreur modification:', err);
        res.status(500).json({ error: 'Erreur serveur: ' + err.message });
    }
});

// Supprimer une propriété (user ne peut supprimer que ses biens)
app.delete('/api/properties/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const isAdmin = req.user.role === 'admin';
        
        // Vérifier que le bien appartient à l'utilisateur (ou admin)
        const checkResult = await pool.query('SELECT user_id FROM properties WHERE id = $1', [id]);
        if (checkResult.rows.length === 0) {
            return res.status(404).json({ error: 'Propriété non trouvée' });
        }
        
        if (!isAdmin && checkResult.rows[0].user_id !== userId) {
            return res.status(403).json({ error: 'Vous ne pouvez supprimer que vos propres biens' });
        }
        
        const result = await pool.query('DELETE FROM properties WHERE id = $1 RETURNING *', [id]);
        res.json({ message: 'Propriété supprimée' });
    } catch (err) {
        console.error('Erreur suppression:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ============================================
// 8. ROUTES ADMIN - MESSAGES
// ============================================
app.get('/api/admin/messages', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM contact_messages ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        console.error('Erreur chargement messages:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.put('/api/admin/messages/:id/read', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('UPDATE contact_messages SET is_read = TRUE WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Message non trouvé' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Erreur mise à jour message:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.delete('/api/admin/messages/:id', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM contact_messages WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Message non trouvé' });
        res.json({ message: 'Message supprimé' });
    } catch (err) {
        console.error('Erreur suppression message:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ============================================
// 9. ROUTES ADMIN - UTILISATEURS
// ============================================
app.get('/api/admin/users', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, full_name, email, phone, role, created_at FROM users ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        console.error('Erreur chargement utilisateurs:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.delete('/api/admin/users/:id', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        if (parseInt(id) === req.user.id) return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
        const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Utilisateur non trouvé' });
        res.json({ message: 'Utilisateur supprimé' });
    } catch (err) {
        console.error('Erreur suppression utilisateur:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.put('/api/admin/users/:id/role', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.body;
        if (!['user', 'admin'].includes(role)) return res.status(400).json({ error: 'Rôle invalide' });
        const result = await pool.query('UPDATE users SET role = $1 WHERE id = $2 RETURNING id, full_name, email, role', [role, id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Utilisateur non trouvé' });
        res.json({ message: 'Rôle mis à jour', user: result.rows[0] });
    } catch (err) {
        console.error('Erreur changement rôle:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/admin/users/stats', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const result = await pool.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE role = 'admin') as admins, COUNT(*) FILTER (WHERE role = 'user') as users FROM users`);
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Erreur stats utilisateurs:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ============================================
// 10. ROUTES UTILISATEUR - FAVORIS
// ============================================
app.get('/api/users/favorites/:propertyId', verifyToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM favorites WHERE user_id = $1 AND property_id = $2', [req.user.id, req.params.propertyId]);
        res.json({ isFavorite: result.rows.length > 0 });
    } catch (err) {
        console.error('Erreur vérification favori:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/users/favorites/:propertyId', verifyToken, async (req, res) => {
    try {
        await pool.query('INSERT INTO favorites (user_id, property_id) VALUES ($1, $2) ON CONFLICT (user_id, property_id) DO NOTHING', [req.user.id, req.params.propertyId]);
        res.json({ isFavorite: true });
    } catch (err) {
        console.error('Erreur ajout favori:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.delete('/api/users/favorites/:propertyId', verifyToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM favorites WHERE user_id = $1 AND property_id = $2', [req.user.id, req.params.propertyId]);
        res.json({ isFavorite: false });
    } catch (err) {
        console.error('Erreur suppression favori:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});
// ============================================
// ROUTES ADMIN - BLOG (Gestion des articles)
// ============================================

// 1. Récupérer tous les articles (Admin)
app.get('/api/admin/blog', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT b.*, u.full_name as author_name 
            FROM blog_posts b 
            LEFT JOIN users u ON b.author_id = u.id 
            ORDER BY b.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Erreur chargement articles:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// 2. Créer un article (Admin)
app.post('/api/admin/blog', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { title, slug, excerpt, content, image_url, status } = req.body;
        const authorId = req.user.id;

        // Génération automatique du slug si non fourni (ex: "Mon Titre" -> "mon-titre")
        const finalSlug = slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

        const result = await pool.query(
            `INSERT INTO blog_posts (title, slug, excerpt, content, image_url, author_id, status) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [title, finalSlug, excerpt, content, image_url, authorId, status || 'draft']
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Erreur création article:', err);
        res.status(500).json({ error: 'Erreur serveur: ' + err.message });
    }
});

// 3. Modifier un article (Admin)
app.put('/api/admin/blog/:id', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { title, slug, excerpt, content, image_url, status } = req.body;

        const result = await pool.query(
            `UPDATE blog_posts 
             SET title=$1, slug=$2, excerpt=$3, content=$4, image_url=$5, status=$6, updated_at=CURRENT_TIMESTAMP 
             WHERE id=$7 RETURNING *`,
            [title, slug, excerpt, content, image_url, status, id]
        );

        if (result.rows.length === 0) return res.status(404).json({ error: 'Article non trouvé' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Erreur modification article:', err);
        res.status(500).json({ error: 'Erreur serveur: ' + err.message });
    }
});

// 4. Supprimer un article (Admin)
app.delete('/api/admin/blog/:id', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM blog_posts WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Article non trouvé' });
        res.json({ message: 'Article supprimé' });
    } catch (err) {
        console.error('Erreur suppression article:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ============================================
// ROUTES PUBLIQUES - BLOG (Pour les visiteurs)
// ============================================

// 5. Récupérer les articles publiés (Public)
app.get('/api/blog', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, title, slug, excerpt, image_url, author_id, created_at, views 
            FROM blog_posts 
            WHERE status = 'published' 
            ORDER BY created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Erreur chargement blog public:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// 6. Récupérer un article spécifique par son slug (Public)
app.get('/api/blog/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        // On incrémente les vues à chaque lecture
        await pool.query('UPDATE blog_posts SET views = views + 1 WHERE slug = $1', [slug]);
        
        const result = await pool.query(`
            SELECT b.*, u.full_name as author_name 
            FROM blog_posts b 
            LEFT JOIN users u ON b.author_id = u.id 
            WHERE b.slug = $1 AND b.status = 'published'
        `, [slug]);

        if (result.rows.length === 0) return res.status(404).json({ error: 'Article non trouvé' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Erreur chargement article public:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});
// ============================================
// 11. ROUTE CATCH-ALL (FRONTEND) - TOUT À LA FIN
// ============================================
app.use((req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
        return next();
    }
    const indexPath = path.join(publicDir, 'index.html');
    res.sendFile(indexPath, (err) => {
        if (err) {
            console.error(' Erreur envoi index.html:', err);
            res.status(404).send('Fichier non trouvé');
        }
    });
});

// ============================================
// 12. DÉMARRAGE
// ============================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
