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
// ROUTE TEMPORAIRE : CRÉER LES TABLES + ADMIN
// ============================================
// ⚠️ À SUPPRIMER après utilisation !
app.get('/api/reset-admin-password', async (req, res) => {
    try {
        // 1. Créer la table users si elle n'existe pas
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                full_name VARCHAR(100) NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                phone VARCHAR(20),
                password_hash VARCHAR(255) NOT NULL,
                role VARCHAR(20) DEFAULT 'user',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        // 2. Créer la table properties si elle n'existe pas
        await pool.query(`
            CREATE TABLE IF NOT EXISTS properties (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                city VARCHAR(50) NOT NULL,
                neighborhood VARCHAR(100),
                type VARCHAR(50) NOT NULL,
                transaction VARCHAR(20) NOT NULL,
                price INTEGER,
                price_label VARCHAR(50),
                surface INTEGER,
                bedrooms INTEGER,
                bathrooms INTEGER,
                image_url TEXT,
                images TEXT,
                description TEXT,
                is_new BOOLEAN DEFAULT false,
                is_luxury BOOLEAN DEFAULT false,
                lat DECIMAL(10, 8),
                lng DECIMAL(11, 8),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        // 3. Créer la table contact_messages si elle n'existe pas
        await pool.query(`
            CREATE TABLE IF NOT EXISTS contact_messages (
                id SERIAL PRIMARY KEY,
                full_name VARCHAR(100),
                email VARCHAR(100),
                phone VARCHAR(20),
                subject VARCHAR(100),
                message TEXT,
                is_read BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        // 4. Créer la table favorites si elle n'existe pas
        await pool.query(`
            CREATE TABLE IF NOT EXISTS favorites (
                id SERIAL PRIMARY KEY,
                user_id INT REFERENCES users(id) ON DELETE CASCADE,
                property_id INT REFERENCES properties(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, property_id)
            );
        `);
        
        // 5. Créer ou mettre à jour le compte admin
        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash('Admin123!', 10);
        
        const result = await pool.query(
            `INSERT INTO users (full_name, email, password_hash, role)
             VALUES ('Admin Kenzia', 'admin@kenziaestates.ma', $1, 'admin')
             ON CONFLICT (email) 
             DO UPDATE SET password_hash = $1
             RETURNING email, role`,
            [hashedPassword]
        );
        
        res.json({
            message: '✅ Tables créées et admin initialisé !',
            tables: ['users', 'properties', 'contact_messages', 'favorites'],
            admin: {
                email: result.rows[0].email,
                password: 'Admin123!',
                role: result.rows[0].role
            },
            warning: '⚠️ SUPPRIMEZ CETTE ROUTE IMMÉDIATEMENT APRÈS USAGE !'
        });
    } catch (err) {
        console.error('Erreur:', err);
        res.status(500).json({ error: 'Erreur serveur: ' + err.message });
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
