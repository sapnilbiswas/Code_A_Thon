const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const { isLoggedIn } = require('../middleware/auth');

// Protect all transaction routes
router.use(isLoggedIn);

// --- List Transactions ---
router.get('/', async (req, res) => {
    try {
        const transactions = await Transaction.find({ user: req.user._id }).sort({ date: -1 });
        const error = req.query.error || null;
        const remaining = req.query.remaining ? parseFloat(req.query.remaining) : null;
        const income = req.query.income ? parseFloat(req.query.income) : null;
        res.render('transactions', { transactions, error, remaining, income });
    } catch (e) {
        console.error("Error fetching transactions:", e);
        res.redirect('/dashboard');
    }
});

// --- Budget Info (JSON API: Get current month's budget and income info for client-side checks ---
router.get('/budget-info', async (req, res) => {
    try {
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        const [budgets, expenses, incomes] = await Promise.all([
            Budget.find({ user: req.user._id, periodMonth: currentMonth, periodYear: currentYear }),
            Transaction.find({ user: req.user._id, type: 'expense', date: { $gte: monthStart, $lte: monthEnd } }),
            Transaction.find({ user: req.user._id, type: 'income', date: { $gte: monthStart, $lte: monthEnd } })
        ]);

        let globalBudget = 0;
        budgets.forEach(b => {
            globalBudget += b.limitAmount; // Sum all in case there are legacy category budgets
        });

        let totalExpenses = 0;
        expenses.forEach(e => {
            totalExpenses += e.amount;
        });

        let totalIncome = 0;
        incomes.forEach(i => {
            totalIncome += i.amount;
        });

        res.json({
            globalBudget,
            totalExpenses,
            totalIncome
        });
    } catch (e) {
        console.error("Error fetching budget info:", e);
        res.status(500).json({ error: "Server error" });
    }
});

// --- Create Transaction ---
router.post('/', async (req, res) => {
    try {
        const { description, amount, type, category } = req.body;
        const parsedAmount = parseFloat(amount);

        // Server-side balance check: expenses must not exceed monthly income
        if (type === 'expense') {
            const now = new Date();
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

            const [incomeTxns, expenseTxns] = await Promise.all([
                Transaction.find({ user: req.user._id, type: 'income', date: { $gte: monthStart, $lte: monthEnd } }),
                Transaction.find({ user: req.user._id, type: 'expense', date: { $gte: monthStart, $lte: monthEnd } })
            ]);

            const totalIncome = incomeTxns.reduce((s, t) => s + t.amount, 0);
            const totalExpenses = expenseTxns.reduce((s, t) => s + t.amount, 0);

            if (totalIncome > 0 && totalExpenses + parsedAmount > totalIncome) {
                const remaining = Math.max(0, totalIncome - totalExpenses);
                return res.redirect(`/transactions?error=insufficient_balance&remaining=${remaining.toFixed(2)}&income=${totalIncome.toFixed(2)}`);
            }
        }

        const txn = new Transaction({
            user: req.user._id,
            description,
            amount: parsedAmount,
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
