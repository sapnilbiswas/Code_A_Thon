const mongoose = require('mongoose');

const savingsGoalSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    title: {
        type: String,
        required: true
    },
    targetAmount: {
        type: Number,
        required: true
    },
    currentAmount: {
        type: Number,
        default: 0
    },
    targetDate: {
        type: Date
    },
    milestones: [
        {
            percent: { type: Number, required: true },
            reached: { type: Boolean, default: false },
            reachedAt: { type: Date }
        }
    ]
}, { timestamps: true });

module.exports = mongoose.model('SavingsGoal', savingsGoalSchema);
