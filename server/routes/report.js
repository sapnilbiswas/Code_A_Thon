const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const { isLoggedIn } = require('../middleware/auth');

// Protect all report routes
router.use(isLoggedIn);

// Helper to get start and end dates of the current month
function getCurrentMonthRange() {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    end.setSeconds(end.getSeconds() - 1);

    return { start, end };
}

// --- Renders Monthly Report Dashboard ---
router.get('/', async (req, res) => {
    try {
        const userId = req.user._id;
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();
        const { start: monthStart, end: monthEnd } = getCurrentMonthRange();

        // 1. Fetch user's transactions for the current month
        const monthlyTransactions = await Transaction.find({
            user: userId,
            date: { $gte: monthStart, $lte: monthEnd }
        }).sort({ date: -1 });

        // Calculate basic KPI totals
        let totalIncome = 0;
        let totalExpense = 0;
        monthlyTransactions.forEach(t => {
            if (t.type === 'income') {
                totalIncome += t.amount;
            } else {
                totalExpense += t.amount;
            }
        });

        const netSavings = totalIncome - totalExpense;
        const processedVolume = totalIncome + totalExpense;

        // 2. Fetch budgets and calculate spent values
        const budgets = await Budget.find({ user: userId, periodMonth: currentMonth, periodYear: currentYear });
        
        const spentMap = {};
        monthlyTransactions.forEach(t => {
            if (t.type === 'expense') {
                spentMap[t.category] = (spentMap[t.category] || 0) + t.amount;
            }
        });

        const budgetSummaries = budgets.map(b => {
            const spent = spentMap[b.category] || 0;
            const percentUsed = b.limitAmount > 0 ? Math.round((spent / b.limitAmount) * 100) : 0;
            return {
                category: b.category,
                limitAmount: b.limitAmount,
                spent,
                percentUsed,
                isOver: spent > b.limitAmount
            };
        });

        // 3. Fetch flagged security transactions (anomalies)
        const securityAlerts = await Transaction.find({
            user: userId,
            isFlagged: true
        }).sort({ date: -1 });

        // 3.5 Fetch Savings Goals
        const SavingsGoal = require('../models/SavingsGoal');
        const savingsGoals = await SavingsGoal.find({ user: userId });
        let totalSavedAmount = 0;
        savingsGoals.forEach(g => { totalSavedAmount += g.currentAmount; });

        // 4. Retrieve financial health score from logged in user
        const healthScore = req.user.overallHealthScore !== undefined ? req.user.overallHealthScore : 100;

        res.render('report', {
            currentMonthName: now.toLocaleString('default', { month: 'long' }),
            currentYear,
            totalIncome,
            totalExpense,
            netSavings,
            processedVolume,
            budgetSummaries,
            securityAlerts,
            savingsGoals,
            totalSavedAmount,
            healthScore,
            monthlyTransactions
        });
    } catch (e) {
        console.error("Error generating monthly report:", e);
        res.redirect('/dashboard');
    }
});

module.exports = router;
