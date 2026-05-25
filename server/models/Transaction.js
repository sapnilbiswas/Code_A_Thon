const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    type: {
        type: String,
        enum: ['income', 'expense'],
        required: true
    },
    category: {
        type: String,
        required: true
    },
    description: {
        type: String
    },
    date: {
        type: Date,
        default: Date.now
    },
    // ML Fraud Detection fields
    isFlagged: {
        type: Boolean,
        default: false
    },
    fraudScore: {
        type: Number, // 0 to 1
        default: null
    },
    flagReasons: {
        type: [String],
        default: []
    }
}, { timestamps: true });

module.exports = mongoose.model('Transaction', transactionSchema);
