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
// 1. CHEMINS (Adapté si server.js est à la racine)
// ============================================
const publicDir = path.join(__dirname, 'public');
const uploadDir = path.join(__dirname, 'uploads', 'properties');

console.log('📁 Chemin public:', publicDir);
console.log('📁 Chemin uploads:', uploadDir);

// ============================================
// 2. MIDDLEWARES
// ============================================
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Servir les fichiers statiques
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use((req, res, next) => {
    console.log(`📥 Requête: ${req.method} ${req.path}`);
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
    const auth = require('./middlewares/auth'); // Adaptez si ce dossier est ailleurs
    verifyToken = auth.verifyToken;
    verifyAdmin = auth.verifyAdmin;
} catch (e) {
    console.log('⚠️ Middlewares auth non trouvés, mode dégradé.');
}

// ============================================
// 4. ROUTES API
// ============================================
app.get('/api/health', (req, res) => {
    res.json({ status: 'online', environment: process.env.NODE_ENV || 'development' });
});

app.get('/api/properties', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM properties ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.get('/api/properties/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM properties WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Non trouvé' });
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.post('/api/contact', async (req, res) => {
    try {
        const { full_name, email, phone, subject, message } = req.body;
        await pool.query(`INSERT INTO contact_messages (full_name, email, phone, subject, message) VALUES ($1, $2, $3, $4, $5)`, [full_name, email, phone, subject, message]);
        res.status(201).json({ message: 'Message envoyé' });
    } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.post('/api/users/register', async (req, res) => {
    try {
        const { full_name, email, phone, password } = req.body;
        if (!password || password.length < 6) return res.status(400).json({ error: 'Mot de passe trop court' });
        const existing = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (existing.rows.length > 0) return res.status(400).json({ error: 'Email déjà utilisé' });
        const passwordHash = await bcrypt.hash(password, 10);
        const result = await pool.query(`INSERT INTO users (full_name, email, phone, password_hash, role) VALUES ($1, $2, $3, $4, 'user') RETURNING id, full_name, email, role`, [full_name, email, phone, passwordHash]);
        res.status(201).json({ message: 'Utilisateur créé', user: result.rows[0] });
    } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.post('/api/users/login', loginLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) return res.status(401).json({ error: 'Identifiants incorrects' });
        const user = result.rows[0];
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordValid) return res.status(401).json({ error: 'Identifiants incorrects' });
        const token = jwt.sign({ id: user.id, email: user.email, role: user.role, full_name: user.full_name }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
        res.json({ message: 'Connexion réussie', token, user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role } });
    } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ... (Ajoutez ici vos autres routes admin / favorites si nécessaire, ou gardez celles que vous aviez) ...
app.get('/api/admin/users', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, full_name, email, role FROM users ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ============================================
// 5. ROUTE CATCH-ALL (FRONTEND)
// ============================================
app.use((req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
        return next();
    }
    res.sendFile(path.join(publicDir, 'index.html'), (err) => {
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
