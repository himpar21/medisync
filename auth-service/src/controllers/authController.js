const User = require('../models/User');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const MALE_BLOCKS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R', 'S', 'T'];
const FEMALE_BLOCKS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'RJT'];

const getAllowedBlocks = (gender) => {
    if (gender === 'male') return MALE_BLOCKS;
    if (gender === 'female') return FEMALE_BLOCKS;
    return null;
};

// 1. REGISTER API
exports.register = async (req, res) => {
    try {
        const { name, email, password, role, gender, block, roomNo } = req.body;
        const normalizedRole = String(role || 'patient').trim().toLowerCase();
        const normalizedGender = String(gender || '').trim().toLowerCase();
        const normalizedBlock = String(block || '').trim().toUpperCase();
        const normalizedRoomNo = String(roomNo || '').trim();

        if (!['patient', 'admin'].includes(normalizedRole)) {
            return res.status(400).json({ message: 'Invalid role. Allowed: patient, admin' });
        }

        if (normalizedRole === 'patient') {
            if (!normalizedGender || !normalizedBlock || !normalizedRoomNo) {
                return res.status(400).json({
                    message: 'gender, block and roomNo are required for patients'
                });
            }

            const allowedBlocks = getAllowedBlocks(normalizedGender);
            if (!allowedBlocks) {
                return res.status(400).json({
                    message: 'Invalid gender. Allowed values: male, female'
                });
            }

            if (!allowedBlocks.includes(normalizedBlock)) {
                return res.status(400).json({
                    message: `Invalid block for ${normalizedGender}. Allowed: ${allowedBlocks.join(', ')}`
                });
            }
        }

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Create new user (Password is automatically hashed by our User.js model!)
        const newUser = new User({
            name,
            email,
            password,
            role: normalizedRole,
            gender: normalizedRole === 'patient' ? normalizedGender : undefined,
            block: normalizedRole === 'patient' ? normalizedBlock : undefined,
            roomNo: normalizedRole === 'patient' ? normalizedRoomNo : undefined
        });
        await newUser.save();

        res.status(201).json({ message: 'User registered successfully!' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// 2. LOGIN API
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find the user
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check if password matches
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }
        
        // Generate the JWT Token (The digital ID badge)
        const token = jwt.sign(
            { userId: user._id, role: user.role }, 
            process.env.JWT_SECRET, 
            { expiresIn: '1d' } // Token expires in 1 day
        );

        res.status(200).json({ 
            message: 'Login successful', 
            token, 
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                gender: user.gender,
                block: user.block,
                roomNo: user.roomNo
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};
