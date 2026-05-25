const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const { isLoggedIn } = require('../middleware/auth');

// Protect all transaction routes
router.use(isLoggedIn);

// --- List Transactions ---
router.get('/', async (req, res) => {
    try {
        const transactions = await Transaction.find({ user: req.user._id }).sort({ date: -1 });
        res.render('transactions', { transactions });
    } catch (e) {
        console.error("Error fetching transactions:", e);
        res.redirect('/dashboard');
    }
});

// --- Create Transaction ---
router.post('/', async (req, res) => {
    try {
        const { description, amount, type, category } = req.body;
        
        // Construct the transaction document
        const txn = new Transaction({
            user: req.user._id,
            description,
            amount: parseFloat(amount),
            type,
            category,
            date: req.body.date ? new Date(req.body.date) : new Date()
        });

        await txn.save();

        // Queue background fraud detection job (Phase 5/6 async path)
        const agenda = req.app.get('agenda');
        if (agenda) {
            await agenda.now('detect-fraud', { transactionId: txn._id });
        }

        res.redirect('/transactions');
    } catch (e) {
        console.error("Error creating transaction:", e);
        res.redirect('/transactions');
    }
});

// --- Delete Transaction ---
router.delete('/:id', async (req, res) => {
    try {
        await Transaction.findOneAndDelete({ _id: req.params.id, user: req.user._id });
        res.redirect('/transactions');
    } catch (e) {
        console.error("Error deleting transaction:", e);
        res.redirect('/transactions');
    }
});

module.exports = router;
