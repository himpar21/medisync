const express = require('express');
const proxy = require('express-http-proxy');
const router = express.Router();

// Forward to Auth Service (Port 5001)
router.use('/', proxy('http://127.0.0.1:5001', {
    proxyReqPathResolver: (req) => {
        return `/api/auth${req.url}`; // Ensures correct pathing
    }
}));

module.exports = router;