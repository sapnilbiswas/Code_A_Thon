const express = require('express');
const router = express.Router();
const SavingsGoal = require('../models/SavingsGoal');
const { isLoggedIn } = require('../middleware/auth');

// Protect all savings routes
router.use(isLoggedIn);

// --- Get Savings Goals List ---
router.get('/', async (req, res) => {
    try {
        const goals = await SavingsGoal.find({ user: req.user._id }).sort({ createdAt: -1 });
        res.render('savings', { goals });
    } catch (e) {
        console.error("Error fetching savings goals:", e);
        res.redirect('/dashboard');
    }
});

// --- Create Savings Goal ---
router.post('/', async (req, res) => {
    try {
        const { title, targetAmount, targetDate } = req.body;
        
        // Define default milestones
        const defaultMilestones = [
            { percent: 25, reached: false },
            { percent: 50, reached: false },
            { percent: 75, reached: false },
            { percent: 100, reached: false }
        ];

        const goal = new SavingsGoal({
            user: req.user._id,
            title,
            targetAmount: parseFloat(targetAmount),
            targetDate: targetDate ? new Date(targetDate) : undefined,
            milestones: defaultMilestones
        });

        await goal.save();
        req.session.success = `Savings goal "${title}" created successfully!`;
        res.redirect('/savings');
    } catch (e) {
        console.error("Error creating savings goal:", e);
        req.session.error = "Failed to create savings goal.";
        res.redirect('/savings');
    }
});

// --- Deposit Money to Savings Goal ---
router.post('/:id/deposit', async (req, res) => {
    try {
        const { amount } = req.body;
        const depositAmount = parseFloat(amount);

        if (isNaN(depositAmount) || depositAmount <= 0) {
            req.session.error = "Please enter a valid deposit amount.";
            return res.redirect('/savings');
        }

        const goal = await SavingsGoal.findOne({ _id: req.params.id, user: req.user._id });
        if (!goal) {
            req.session.error = "Savings goal not found.";
            return res.redirect('/savings');
        }

        // Add deposit
        goal.currentAmount += depositAmount;
        const newPercent = (goal.currentAmount / goal.targetAmount) * 100;

        // Check milestones
        let unlockedMilestones = [];
        goal.milestones.forEach(m => {
            if (!m.reached && newPercent >= m.percent) {
                m.reached = true;
                m.reachedAt = new Date();
                unlockedMilestones.push(m.percent);
            }
        });

        await goal.save();

        let successMsg = `Deposited $${depositAmount.toLocaleString()} to "${goal.title}"!`;
        if (unlockedMilestones.length > 0) {
            const milestoneText = unlockedMilestones.map(p => `${p}%`).join(', ');
            successMsg += ` 🎉 Milestone Unlocked: Reached ${milestoneText} of your target!`;
        }

        req.session.success = successMsg;
        res.redirect('/savings');
    } catch (e) {
        console.error("Error depositing to savings goal:", e);
        req.session.error = "Failed to process deposit.";
        res.redirect('/savings');
    }
});

// --- Delete Savings Goal ---
router.delete('/:id', async (req, res) => {
    try {
        await SavingsGoal.findOneAndDelete({ _id: req.params.id, user: req.user._id });
        req.session.success = "Savings goal deleted.";
        res.redirect('/savings');
    } catch (e) {
        console.error("Error deleting savings goal:", e);
        req.session.error = "Failed to delete savings goal.";
        res.redirect('/savings');
    }
});

module.exports = router;
