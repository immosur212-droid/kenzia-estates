const multer = require('multer');
const path = require('path');
require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit'); // ← Assurez-vous que cette ligne existe
const fs = require('fs');                // ← IMPORTANT !

const app = express();
const PORT = process.env.PORT || 3000;


// Middleware
// CORS dynamique
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
// Servir les fichiers statiques (frontend)
app.use(express.static(path.join(__dirname, 'public')));

// ✨ AJOUTEZ CE CODE ICI ✨
// Configuration du rate limiter pour la connexion
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 tentatives maximum
    message: { error: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' }
});
// Créer le dossier uploads/properties
const uploadDir = path.join(__dirname, 'uploads', 'properties');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configuration du stockage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'property-' + uniqueSuffix + ext);
    }
});

// Filtre pour accepter uniquement les images
const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
        cb(null, true);
    } else {
        cb(new Error('Seules les images sont acceptées (JPG, PNG, GIF, WEBP)'));
    }
};

// Créer l'instance upload
const upload = multer({
    storage: storage,
    limits: { 
        fileSize: 5 * 1024 * 1024  // 5 MB max
    },
    fileFilter: fileFilter
});

// Servir les images uploadées
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Configuration PostgreSQL (Render fournit DATABASE_URL)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// server/server.js
require('dotenv').config();

// Afficher les paramètres de connexion (pour déboguer)
console.log('🔧 Paramètres de connexion:');
console.log('  Host:', process.env.DB_HOST || 'localhost');
console.log('  Port:', process.env.DB_PORT || 5432);
console.log('  Database:', process.env.DB_NAME || 'KENZIA_ESTATE');
console.log('  User:', process.env.DB_USER || 'postgres');
console.log('  Password:', process.env.DB_PASSWORD ? '***' : 'NON DÉFINI');

// Tester la connexion
pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ Erreur de connexion à PostgreSQL:', err.message);
        console.log('\n💡 Vérifiez que:');
        console.log('  1. PostgreSQL est démarré');
        console.log('  2. La base KENZIA_ESTATE existe');
        console.log('  3. Le fichier .env est correctement configuré');
    } else {
        console.log('✅ Connecté à la base KENZIA_ESTATE');
        release();
    }
});

// Route de test
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'online',
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString()
    });
});

// ============================================
// ROUTES API - PROPERTIES
// ============================================

// Récupérer toutes les propriétés
app.get('/api/properties', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM properties ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Récupérer une propriété par ID
app.get('/api/properties/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('SELECT * FROM properties WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Propriété non trouvée' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Ajouter une propriété
app.post('/api/properties', async (req, res) => {
    try {
        const {
            title, city, neighborhood, type, transaction,
            price, price_label, surface, bedrooms, bathrooms,
            image_url, description, is_new, is_luxury, lat, lng
        } = req.body;

        const result = await pool.query(
            `INSERT INTO properties 
            (title, city, neighborhood, type, transaction, price, price_label, 
             surface, bedrooms, bathrooms, image_url, description, is_new, is_luxury, lat, lng)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            RETURNING *`,
            [title, city, neighborhood, type, transaction, price, price_label,
             surface, bedrooms, bathrooms, image_url, description, is_new, is_luxury, lat, lng]
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Modifier une propriété
app.put('/api/properties/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            title, city, neighborhood, type, transaction,
            price, price_label, surface, bedrooms, bathrooms,
            image_url, description, is_new, is_luxury
        } = req.body;

        const result = await pool.query(
            `UPDATE properties 
            SET title=$1, city=$2, neighborhood=$3, type=$4, transaction=$5,
                price=$6, price_label=$7, surface=$8, bedrooms=$9, bathrooms=$10,
                image_url=$11, description=$12, is_new=$13, is_luxury=$14,
                updated_at=CURRENT_TIMESTAMP
            WHERE id=$15
            RETURNING *`,
            [title, city, neighborhood, type, transaction, price, price_label,
             surface, bedrooms, bathrooms, image_url, description, is_new, is_luxury, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Propriété non trouvée' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Supprimer une propriété
app.delete('/api/properties/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM properties WHERE id = $1 RETURNING *', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Propriété non trouvée' });
        }

        res.json({ message: 'Propriété supprimée' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ============================================
// ROUTES API - CONTACT
// ============================================

app.post('/api/contact', async (req, res) => {
    try {
        const { full_name, email, phone, subject, message } = req.body;

        const result = await pool.query(
            `INSERT INTO contact_messages (full_name, email, phone, subject, message)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *`,
            [full_name, email, phone, subject, message]
        );

        res.status(201).json({ message: 'Message envoyé avec succès' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ============================================
// ROUTES API - USERS (simplifié)
// ============================================

app.post('/api/users/register', async (req, res) => {
    try {
        const { full_name, email, phone, password } = req.body;

        // Validation
        if (!password || password.length < 6) {
            return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères' });
        }

        // Vérifier si l'email existe déjà
        const existing = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Email déjà utilisé' });
        }

        // Hasher le mot de passe avec bcrypt
        const saltRounds = 10; // Nombre de tours de salage (10 est recommandé)
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Insérer l'utilisateur avec le mot de passe hashé
        const result = await pool.query(
            `INSERT INTO users (full_name, email, phone, password_hash, role)
            VALUES ($1, $2, $3, $4, 'user')
            RETURNING id, full_name, email, role`,
            [full_name, email, phone, passwordHash]
        );

        res.status(201).json({
            message: 'Utilisateur créé avec succès',
            user: result.rows[0]
        });
    } catch (err) {
        console.error('Erreur register:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});
const { verifyToken, verifyAdmin, verifyOwnerOrAdmin } = require('./middlewares/auth');

// Route Login (génère un JWT)
app.post('/api/users/login', loginLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;

        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
        }

        const user = result.rows[0];

        const isPasswordValid = await bcrypt.compare(password, user.password_hash);

        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
        }

        // ✨ GÉNÉRATION DU JWT
        const token = jwt.sign(
            {
                id: user.id,
                email: user.email,
                role: user.role,
                full_name: user.full_name
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        res.json({
            message: 'Connexion réussie',
            token: token, // ✨ Le token à stocker côté client
            user: {
                id: user.id,
                full_name: user.full_name,
                email: user.email,
                role: user.role
            }
        });
    } catch (err) {
        console.error('Erreur login:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});
// Middleware de gestion des erreurs multer
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'Fichier trop volumineux (max 5 MB)' });
        }
        return res.status(400).json({ error: 'Erreur upload : ' + err.message });
    } else if (err) {
        return res.status(400).json({ error: err.message });
    }
    next();
});
// ============================================
// ROUTES ADMIN - GESTION DES UTILISATEURS
// ============================================

// 🔒 Route ADMIN : Voir tous les utilisateurs
app.get('/api/admin/users', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, full_name, email, phone, role, created_at 
             FROM users 
             ORDER BY created_at DESC`
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Erreur chargement utilisateurs:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// 🔒 Route ADMIN : Supprimer un utilisateur
app.delete('/api/admin/users/:id', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Empêcher un admin de se supprimer lui-même
        if (parseInt(id) === req.user.id) {
            return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
        }

        const result = await pool.query(
            'DELETE FROM users WHERE id = $1 RETURNING id, full_name, email, role',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Utilisateur non trouvé' });
        }

        res.json({ message: 'Utilisateur supprimé', user: result.rows[0] });
    } catch (err) {
        console.error('Erreur suppression utilisateur:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// 🔒 Route ADMIN : Changer le rôle d'un utilisateur
app.put('/api/admin/users/:id/role', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.body;

        // Valider le rôle
        if (!['user', 'admin'].includes(role)) {
            return res.status(400).json({ error: 'Rôle invalide. Utilisez "user" ou "admin"' });
        }

        const result = await pool.query(
            'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, full_name, email, role',
            [role, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Utilisateur non trouvé' });
        }

        res.json({ message: 'Rôle mis à jour', user: result.rows[0] });
    } catch (err) {
        console.error('Erreur changement rôle:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// 🔒 Route ADMIN : Compter les utilisateurs par rôle
app.get('/api/admin/users/stats', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT 
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE role = 'admin') as admins,
                COUNT(*) FILTER (WHERE role = 'user') as users
             FROM users`
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Erreur stats utilisateurs:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ============================================
// ROUTES UTILISATEUR - FAVORIS
// ============================================

// 🔒 Vérifier si une propriété est en favori
app.get('/api/users/favorites/:propertyId', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { propertyId } = req.params;

        const result = await pool.query(
            'SELECT * FROM favorites WHERE user_id = $1 AND property_id = $2',
            [userId, propertyId]
        );

        res.json({ isFavorite: result.rows.length > 0 });
    } catch (err) {
        console.error('Erreur vérification favori:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// 🔒 Ajouter aux favoris
app.post('/api/users/favorites/:propertyId', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { propertyId } = req.params;

        const result = await pool.query(
            `INSERT INTO favorites (user_id, property_id) 
             VALUES ($1, $2) 
             ON CONFLICT (user_id, property_id) DO NOTHING 
             RETURNING *`,
            [userId, propertyId]
        );

        res.json({ 
            message: result.rows.length > 0 ? 'Added to favorites' : 'Already in favorites',
            isFavorite: true 
        });
    } catch (err) {
        console.error('Erreur ajout favori:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// 🔒 Retirer des favoris
app.delete('/api/users/favorites/:propertyId', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { propertyId } = req.params;

        const result = await pool.query(
            'DELETE FROM favorites WHERE user_id = $1 AND property_id = $2 RETURNING *',
            [userId, propertyId]
        );

        res.json({ 
            message: result.rows.length > 0 ? 'Removed from favorites' : 'Not in favorites',
            isFavorite: false 
        });
    } catch (err) {
        console.error('Erreur suppression favori:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Servir index.html pour toutes les autres routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// DÉMARRAGE DU SERVEUR
// ============================================

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
});

// ============================================
// ROUTES ADMIN PROTÉGÉES
// ============================================

// Créer un utilisateur ADMIN (à utiliser une seule fois pour créer le premier admin)
app.post('/api/users/create-admin', async (req, res) => {
    try {
        const { full_name, email, phone, password, admin_secret } = req.body;

        // Vérifier une clé secrète pour créer un admin
        if (admin_secret !== 'KENZIA_ADMIN_2026_SECRET') {
            return res.status(403).json({ error: 'Clé secrète invalide' });
        }

        const existing = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Email déjà utilisé' });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const result = await pool.query(
            `INSERT INTO users (full_name, email, phone, password_hash, role)
            VALUES ($1, $2, $3, $4, 'admin')
            RETURNING id, full_name, email, role`,
            [full_name, email, phone, passwordHash]
        );

        res.status(201).json({ message: 'Admin créé', user: result.rows[0] });
    } catch (err) {
        console.error('Erreur create-admin:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});
// ============================================
// ROUTES ADMIN - MESSAGES
// ============================================

// 🔒 Route ADMIN : Voir tous les messages
app.get('/api/admin/messages', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM contact_messages ORDER BY created_at DESC'
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// 🔒 Route ADMIN : Marquer un message comme lu
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
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// 🔒 Route ADMIN : Supprimer un message
app.delete('/api/admin/messages/:id', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query(
            'DELETE FROM contact_messages WHERE id = $1 RETURNING *',
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Message non trouvé' });
        }
        
        res.json({ message: 'Message supprimé avec succès' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// 🔒 Route ADMIN : Ajouter une propriété
// 🔒 Route ADMIN : Ajouter une propriété (avec upload d'images)
app.post('/api/admin/properties', 
    verifyToken, 
    verifyAdmin, 
    upload.array('images', 5),  // Accepte jusqu'à 5 images
    async (req, res) => {
        try {
            const {
                title, city, neighborhood, type, transaction,
                price, surface, bedrooms, bathrooms,
                description, is_new, is_luxury, lat, lng
            } = req.body;

            // Générer le price_label
            const price_label = parseInt(price).toLocaleString('en-US') + ' MAD';

            // Récupérer les URLs des images uploadées
            let image_urls = [];
            if (req.files && req.files.length > 0) {
                image_urls = req.files.map(file => {
                    return `http://localhost:${process.env.PORT || 3000}/uploads/properties/${file.filename}`;
                });
            }

            // Image principale = première image
            const image_url = image_urls[0] || null;

            // Toutes les images (JSON)
            const images_json = JSON.stringify(image_urls);

            const result = await pool.query(
                `INSERT INTO properties 
                (title, city, neighborhood, type, transaction, price, price_label, 
                 surface, bedrooms, bathrooms, image_url, images, description, is_new, is_luxury, lat, lng)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
                RETURNING *`,
                [title, city, neighborhood, type, transaction, price, price_label,
                 surface, bedrooms, bathrooms, image_url, images_json, description, 
                 is_new === 'true', is_luxury === 'true', lat, lng]
            );

            res.status(201).json(result.rows[0]);
        } catch (err) {
            console.error('Erreur ajout propriété:', err);
            res.status(500).json({ error: 'Erreur serveur : ' + err.message });
        }
    }
);

// 🔒 Route ADMIN : Modifier une propriété (avec upload d'images)
app.put('/api/admin/properties/:id', 
    verifyToken, 
    verifyAdmin, 
    upload.array('images', 5),
    async (req, res) => {
        try {
            const { id } = req.params;
            const {
                title, city, neighborhood, type, transaction,
                price, surface, bedrooms, bathrooms,
                description, is_new, is_luxury, lat, lng,
                existing_images // Images existantes à garder
            } = req.body;

            // Générer le price_label
            const price_label = parseInt(price).toLocaleString('en-US') + ' MAD';

            // Gérer les images
            let image_urls = [];
            
            // Ajouter les images existantes (si fournies)
            if (existing_images) {
                try {
                    const existing = JSON.parse(existing_images);
                    image_urls = Array.isArray(existing) ? existing : [existing];
                } catch (e) {
                    image_urls = [existing_images];
                }
            }

            // Ajouter les nouvelles images uploadées
            if (req.files && req.files.length > 0) {
                const newImages = req.files.map(file => {
                    return `http://localhost:${process.env.PORT || 3000}/uploads/properties/${file.filename}`;
                });
                image_urls = [...image_urls, ...newImages];
            }

            // Image principale = première image
            const image_url = image_urls[0] || null;
            const images_json = JSON.stringify(image_urls);

            const result = await pool.query(
                `UPDATE properties 
                SET title=$1, city=$2, neighborhood=$3, type=$4, transaction=$5,
                    price=$6, price_label=$7, surface=$8, bedrooms=$9, bathrooms=$10,
                    image_url=$11, images=$12, description=$13, is_new=$14, is_luxury=$15,
                    lat=$16, lng=$17, updated_at=CURRENT_TIMESTAMP
                WHERE id=$18
                RETURNING *`,
                [title, city, neighborhood, type, transaction, price, price_label,
                 surface, bedrooms, bathrooms, image_url, images_json, description, 
                 is_new === 'true', is_luxury === 'true', lat, lng, id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Propriété non trouvée' });
            }

            res.json(result.rows[0]);
        } catch (err) {
            console.error('Erreur modification propriété:', err);
            res.status(500).json({ error: 'Erreur serveur : ' + err.message });
        }
    }
);

// 🔒 Route ADMIN : Supprimer une propriété
app.delete('/api/admin/properties/:id', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM properties WHERE id = $1 RETURNING *', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Propriété non trouvée' });
        }

        res.json({ message: 'Propriété supprimée' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// 🔒 Route ADMIN : Voir tous les utilisateurs
app.get('/api/admin/users', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, full_name, email, phone, role, created_at FROM users ORDER BY created_at DESC'
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// 🔒 Route ADMIN : Voir tous les messages de contact
app.get('/api/admin/messages', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM contact_messages ORDER BY created_at DESC'
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// 🔒 Route ADMIN : Supprimer un utilisateur
app.delete('/api/admin/users/:id', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Empêcher un admin de se supprimer lui-même
        if (parseInt(id) === req.user.id) {
            return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
        }

        const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Utilisateur non trouvé' });
        }

        res.json({ message: 'Utilisateur supprimé' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// 🔓 Route UTILISATEUR : Voir son propre profil (authentifié)
app.get('/api/users/profile', verifyToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, full_name, email, phone, role, created_at FROM users WHERE id = $1',
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Utilisateur non trouvé' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// 🔒 Route : Vérifier si le token est valide
app.get('/api/auth/verify', verifyToken, (req, res) => {
    res.json({
        valid: true,
        user: req.user
    });
    // ============================================
// CONFIGURATION UPLOAD IMAGES
// ============================================

// Créer le dossier uploads/properties s'il n'existe pas
const fs = require('fs');
const uploadDir = path.join(__dirname, 'uploads', 'properties');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configuration du stockage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Nom unique : timestamp + nom original
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'property-' + uniqueSuffix + ext);
    }
});

// Filtre : accepter uniquement les images
const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
        cb(null, true);
    } else {
        cb(new Error('Seules les images sont acceptées (JPG, PNG, GIF, WEBP)'));
    }
};

// Configuration de multer
const upload = multer({
    storage: storage,
    limits: { 
        fileSize: 5 * 1024 * 1024  // 5 MB max
    },
    fileFilter: fileFilter
});

// Servir les fichiers statiques du dossier uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
});