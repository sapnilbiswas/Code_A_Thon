const mongoose = require('mongoose');

const budgetSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    category: {
        type: String,
        required: true
    },
    limitAmount: {
        type: Number,
        required: true
    },
    periodMonth: {
        type: Number,
        required: true // 1-12
    },
    periodYear: {
        type: Number,
        required: true // e.g., 2026
    },
    alertThreshold: {
        type: Number,
        default: 80 // Percentage (alert at 80% usage)
    }
}, { timestamps: true });

module.exports = mongoose.model('Budget', budgetSchema);
