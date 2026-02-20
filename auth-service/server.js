require('dotenv').config();
const dns = require('node:dns/promises'); // Add this line!
dns.setServers(['8.8.8.8', '1.1.1.1']);
const app = require('./src/app');
const mongoose = require('mongoose');

const PORT = process.env.PORT || 5001;

// Start the server
app.listen(PORT, () => {
    console.log(`🚀 Auth Service is running on port ${PORT}`);
});

// Connect to Database
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('📦 Connected to MongoDB!'))
    .catch((err) => console.error('MongoDB connection error:', err));