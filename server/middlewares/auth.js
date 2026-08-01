// server/middlewares/auth.js
const jwt = require('jsonwebtoken');

// Middleware 1 : Vérifier si l'utilisateur est authentifié
function verifyToken(req, res, next) {
    // Récupérer le token depuis le header Authorization
    const authHeader = req.headers['authorization'];
    
    // Le format attendu : "Bearer <token>"
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ 
            error: 'Accès refusé. Aucun token fourni.' 
        });
    }

    try {
        // Vérifier et décoder le token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Attacher les infos utilisateur à la requête
        req.user = decoded;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expiré' });
        }
        return res.status(403).json({ error: 'Token invalide' });
    }
}

// Middleware 2 : Vérifier si l'utilisateur est admin
function verifyAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ 
            error: 'Accès refusé. Droits administrateur requis.' 
        });
    }
    next();
}

// Middleware 3 : Vérifier si c'est l'utilisateur concerné ou un admin
function verifyOwnerOrAdmin(req, res, next) {
    const requestedUserId = parseInt(req.params.userId);
    
    if (req.user.id === requestedUserId || req.user.role === 'admin') {
        next();
    } else {
        return res.status(403).json({ 
            error: 'Accès refusé. Vous ne pouvez pas accéder à ces données.' 
        });
    }
}

module.exports = { verifyToken, verifyAdmin, verifyOwnerOrAdmin };