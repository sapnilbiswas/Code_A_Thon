const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const { isLoggedIn } = require('../middleware/auth');

// Protect all dashboard and budget routes
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

// --- Dashboard ---
router.get('/dashboard', async (req, res) => {
    try {
        const userId = req.user._id;
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();
        const { start: monthStart, end: monthEnd } = getCurrentMonthRange();

        // 1. Fetch user's transactions
        const transactions = await Transaction.find({ user: userId });
        const flaggedCount = transactions.filter(t => t.isFlagged).length;

        // 2. Processed Volume (Sum of all transaction amounts)
        const processedVolumeSum = transactions.reduce((sum, t) => sum + t.amount, 0);
        const processedVolume = `$${processedVolumeSum.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

        // 3. Prevented Losses (Sum of flagged expense transactions)
        const preventedLossesSum = transactions
            .filter(t => t.isFlagged && t.type === 'expense')
            .reduce((sum, t) => sum + t.amount, 0);
        const preventedLosses = preventedLossesSum > 0 
            ? `$${preventedLossesSum.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
            : '$0';

        // 4. Budgets and Health Score Calculation
        const budgets = await Budget.find({ user: userId, periodMonth: currentMonth, periodYear: currentYear });
        
        // Calculate spending per category for current month
        const [monthlyExpenses, monthlyIncomeTxns] = await Promise.all([
            Transaction.find({ user: userId, type: 'expense', date: { $gte: monthStart, $lte: monthEnd } }),
            Transaction.find({ user: userId, type: 'income', date: { $gte: monthStart, $lte: monthEnd } })
        ]);

        const monthlyIncomeTotal = monthlyIncomeTxns.reduce((s, t) => s + t.amount, 0);
        const monthlyExpenseTotal = monthlyExpenses.reduce((s, t) => s + t.amount, 0);
        const monthlySavings = monthlyIncomeTotal - monthlyExpenseTotal;
        const savingsRate = monthlyIncomeTotal > 0 ? Math.round((monthlySavings / monthlyIncomeTotal) * 100) : 0;

        const spentMap = {};
        monthlyExpenses.forEach(t => {
            spentMap[t.category] = (spentMap[t.category] || 0) + t.amount;
        });

        // Points subtraction for overall health score
        let penalty = 0;
        budgets.forEach(b => {
            const spent = spentMap[b.category] || 0;
            if (spent > b.limitAmount) {
                penalty += 15; // 15 points deduction for over-budget category
            }
        });
        penalty += flaggedCount * 10; // 10 points deduction per flagged transaction

        const overallHealthScore = Math.max(0, Math.min(100, 100 - penalty));

        // Update health score in User model
        await User.findByIdAndUpdate(userId, { overallHealthScore });
        req.user.overallHealthScore = overallHealthScore; // Update session value

        // 4.5. AI Forecasting Projection Engine
        const activeDays = Math.max(1, Math.round((now - monthStart) / (1000 * 60 * 60 * 24)));
        const projectedExpense = Math.round((monthlyExpenseTotal / activeDays) * 30);
        const totalBudgetLimit = budgets.reduce((sum, b) => sum + b.limitAmount, 0);

        // 5. Gather totals object for template
        const totals = {
            processedVolume,
            flaggedCount,
            preventedLosses
        };

        // 6. Gather weekly transaction chart data
        const weeklyData = [
            { processed: 0, prevented: 0 },
            { processed: 0, prevented: 0 },
            { processed: 0, prevented: 0 },
            { processed: 0, prevented: 0 }
        ];

        // Filter transactions for the current month
        const currentMonthTransactions = transactions.filter(t => {
            const date = new Date(t.date);
            return date >= monthStart && date <= monthEnd;
        });

        currentMonthTransactions.forEach(t => {
            const date = new Date(t.date);
            const day = date.getDate();
            let weekIdx = 0;
            if (day <= 7) weekIdx = 0;
            else if (day <= 14) weekIdx = 1;
            else if (day <= 21) weekIdx = 2;
            else weekIdx = 3;

            weeklyData[weekIdx].processed += t.amount;
            if (t.isFlagged && t.type === 'expense') {
                weeklyData[weekIdx].prevented += t.amount;
            }
        });

        let maxVal = 0;
        weeklyData.forEach(w => {
            if (w.processed > maxVal) maxVal = w.processed;
            if (w.prevented > maxVal) maxVal = w.prevented;
        });

        const weeklyChartData = weeklyData.map(w => {
            const pHeight = maxVal > 0 ? Math.round((w.processed / maxVal) * 90) : 0;
            const prevHeight = maxVal > 0 ? Math.round((w.prevented / maxVal) * 90) : 0;

            const formatLabel = (val) => {
                if (val === 0) return '0';
                if (val >= 1000) return `${(val / 1000).toFixed(1)}k`;
                return `$${val}`;
            };

            return {
                processedHeight: pHeight,
                preventedHeight: prevHeight,
                processedLabel: formatLabel(w.processed),
                preventedLabel: formatLabel(w.prevented)
            };
        });

        // 7. Gather Risk Vectors
        const flaggedTxns = transactions.filter(t => t.isFlagged);
        const riskVectors = {
            accountTakeoverPercent: 0,
            paymentFraudPercent: 0,
            identitySpoofingPercent: 0,
            otherThreatsPercent: 0
        };

        if (flaggedTxns.length > 0) {
            let accountTakeover = 0;
            let paymentFraud = 0;
            let identitySpoofing = 0;
            let otherThreats = 0;

            flaggedTxns.forEach(t => {
                const text = ((t.flagReasons || []).join(' ') + ' ' + (t.category || '')).toLowerCase();
                if (text.includes('takeover') || text.includes('credentials') || text.includes('compromise') || text.includes('login') || text.includes('auth')) {
                    accountTakeover++;
                } else if (text.includes('payment') || text.includes('card') || text.includes('velocity') || text.includes('amount') || text.includes('limit') || text.includes('entertainment') || text.includes('groceries')) {
                    paymentFraud++;
                } else if (text.includes('spoofing') || text.includes('identity') || text.includes('location') || text.includes('ip') || text.includes('mismatch')) {
                    identitySpoofing++;
                } else {
                    otherThreats++;
                }
            });

            const totalFlagged = flaggedTxns.length;
            riskVectors.accountTakeoverPercent = Math.round((accountTakeover / totalFlagged) * 100);
            riskVectors.paymentFraudPercent = Math.round((paymentFraud / totalFlagged) * 100);
            riskVectors.identitySpoofingPercent = Math.round((identitySpoofing / totalFlagged) * 100);
            riskVectors.otherThreatsPercent = 100 - (riskVectors.accountTakeoverPercent + riskVectors.paymentFraudPercent + riskVectors.identitySpoofingPercent);

            if (riskVectors.otherThreatsPercent < 0) riskVectors.otherThreatsPercent = 0;
        }

        res.render('dashboard', { 
            totals, 
            overallHealthScore, 
            weeklyChartData, 
            riskVectors, 
            monthlyIncomeTotal, 
            monthlyExpenseTotal, 
            monthlySavings, 
            savingsRate,
            projectedExpense,
            totalBudgetLimit
        });
    } catch (e) {
        console.error("Error rendering dashboard:", e);
        res.status(500).send("Error rendering dashboard");
    }
});

module.exports = router;
