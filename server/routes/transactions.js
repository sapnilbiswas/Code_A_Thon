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
        const budget = req.query.budget ? parseFloat(req.query.budget) : null;
        res.render('transactions', { transactions, error, remaining, income, budget });
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

            const currentMonth = now.getMonth() + 1;
            const currentYear = now.getFullYear();

            const [incomeTxns, expenseTxns, budgets] = await Promise.all([
                Transaction.find({ user: req.user._id, type: 'income', date: { $gte: monthStart, $lte: monthEnd } }),
                Transaction.find({ user: req.user._id, type: 'expense', date: { $gte: monthStart, $lte: monthEnd } }),
                Budget.find({ user: req.user._id, periodMonth: currentMonth, periodYear: currentYear })
            ]);

            const totalIncome = incomeTxns.reduce((s, t) => s + t.amount, 0);
            const totalExpenses = expenseTxns.reduce((s, t) => s + t.amount, 0);
            const globalBudget = budgets.reduce((s, b) => s + b.limitAmount, 0);

            if (totalIncome === 0) {
                return res.redirect(`/transactions?error=zero_income`);
            }

            if (globalBudget === 0) {
                return res.redirect(`/transactions?error=zero_budget`);
            }

            if (totalExpenses + parsedAmount > globalBudget) {
                return res.redirect(`/transactions?error=budget_exceeded&budget=${globalBudget.toFixed(2)}`);
            }

            if (totalExpenses + parsedAmount > totalIncome) {
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

// --- Batch Upload Transactions (CSV) ---
router.post('/upload', async (req, res) => {
    try {
        const { transactions } = req.body;
        if (!transactions || !Array.isArray(transactions)) {
            return res.status(400).json({ success: false, error: "Invalid transactions array" });
        }

        const agenda = req.app.get('agenda');
        const savedTxns = [];

        for (const t of transactions) {
            const amount = parseFloat(t.amount);
            if (isNaN(amount) || amount <= 0) continue;

            const txn = new Transaction({
                user: req.user._id,
                description: t.description || 'Batch Upload',
                amount,
                type: t.type === 'income' ? 'income' : 'expense',
                category: t.category || 'Other',
                date: t.date ? new Date(t.date) : new Date()
            });

            await txn.save();
            savedTxns.push(txn);

            // Dispatch background fraud detection job
            if (agenda) {
                await agenda.now('detect-fraud', { transactionId: txn._id });
            }
        }

        res.json({ success: true, count: savedTxns.length });
    } catch (e) {
        console.error("Error batch uploading transactions:", e);
        res.status(500).json({ success: false, error: "Server error during batch upload" });
    }
});

// --- Parse Statement / Receipt via Gemini AI ---
router.post('/parse-file', async (req, res) => {
    try {
        const { text, base64, mimeType } = req.body;
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ success: false, error: "Gemini API key is not configured on the server" });
        }

        let parts = [];
        if (base64 && mimeType) {
            parts.push({
                inlineData: {
                    mimeType: mimeType,
                    data: base64
                }
            });
            parts.push({
                text: "Analyze the uploaded bank statement or receipt image/file and extract all transactions as a JSON list. For each transaction, provide:\n1. date (format as YYYY-MM-DD, e.g. '2026-05-25')\n2. description (clean, concise merchant/payer name, e.g. 'Amazon Web Services' instead of long statement code)\n3. amount (positive decimal number)\n4. category (must be one of: 'Groceries', 'Rent', 'Entertainment', 'Transfer', 'Salary', 'Other')\n5. type (must be one of: 'expense', 'income')"
            });
        } else if (text) {
            parts.push({
                text: `Analyze the following bank statement or receipt text and extract all transactions as a JSON list. For each transaction, provide:\n1. date (format as YYYY-MM-DD, e.g. '2026-05-25')\n2. description (clean, concise merchant/payer name)\n3. amount (positive decimal number)\n4. category (must be one of: 'Groceries', 'Rent', 'Entertainment', 'Transfer', 'Salary', 'Other')\n5. type (must be one of: 'expense', 'income')\n\nDocument content:\n${text}`
            });
        } else {
            return res.status(400).json({ success: false, error: "No text or file data provided" });
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts }],
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "ARRAY",
                        items: {
                            type: "OBJECT",
                            properties: {
                                date: { type: "STRING" },
                                description: { type: "STRING" },
                                amount: { type: "NUMBER" },
                                category: { type: "STRING", enum: ["Groceries", "Rent", "Entertainment", "Transfer", "Salary", "Other"] },
                                type: { type: "STRING", enum: ["expense", "income"] }
                            },
                            required: ["date", "description", "amount", "category", "type"]
                        }
                    }
                }
            })
        });

        const data = await response.json();
        if (data.error) {
            console.error("Gemini API error response:", data.error);
            return res.status(500).json({ success: false, error: data.error.message || "Gemini API error" });
        }

        const jsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!jsonText) {
            console.error("No JSON text inside candidates:", JSON.stringify(data));
            return res.status(500).json({ success: false, error: "Failed to parse data with Gemini AI (empty output)" });
        }

        const transactions = JSON.parse(jsonText);
        res.json({ success: true, transactions });
    } catch (e) {
        console.error("Error calling Gemini API:", e);
        res.status(500).json({ success: false, error: e.message || "Server error during Gemini parsing" });
    }
});

module.exports = router;

