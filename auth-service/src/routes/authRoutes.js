const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Map the URLs to the controller functions
router.post('/register', authController.register);
router.post('/login', authController.login);

module.exports = router;