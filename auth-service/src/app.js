const express = require('express');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors()); 
app.use(express.json()); 

// Import your routes
const authRoutes = require('./routes/authRoutes');

// Use your routes
app.use('/api/auth', authRoutes);

// Test route
app.get('/health', (req, res) => {
    res.status(200).json({ message: 'Auth Service is running perfectly!' });
});

module.exports = app;