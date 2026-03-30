const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const MALE_BLOCKS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R', 'S', 'T'];
const FEMALE_BLOCKS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'RJT'];
const STUDENT_ROLES = ['student', 'patient'];

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'pharmacist', 'student', 'patient'], default: 'student' },
    gender: {
        type: String,
        enum: ['male', 'female'],
        required: function () { return STUDENT_ROLES.includes(this.role); },
        lowercase: true,
        trim: true
    },
    block: {
        type: String,
        required: function () { return STUDENT_ROLES.includes(this.role); },
        uppercase: true,
        trim: true,
        validate: {
            validator: function (value) {
                if (!STUDENT_ROLES.includes(this.role)) return true;
                const allowedBlocks = this.gender === 'female' ? FEMALE_BLOCKS : MALE_BLOCKS;
                return allowedBlocks.includes(value);
            },
            message: 'Selected block is not allowed for this gender'
        }
    },
    roomNo: {
        type: String,
        required: function () { return STUDENT_ROLES.includes(this.role); },
        trim: true,
        maxlength: 20
    }
}, { timestamps: true, optimisticConcurrency: true });

// Modern Pre-Save Hook (No 'next' needed!)
userSchema.pre('save', async function() {
    // If password isn't being modified, just stop and return
    if (!this.isModified('password')) return; 
    
    // Hash the password automatically
    const salt = await bcrypt.genSalt(10); 
    this.password = await bcrypt.hash(this.password, salt); 
});

module.exports = mongoose.model('User', userSchema);
