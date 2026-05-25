const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const SavingsGoal = require('../models/SavingsGoal');
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

        // 0. Date Range Logic
        const rangeType = req.query.range || '30days';
        let startDate, endDate;
        let selectedRangeLabel = 'Last 30 Days';
        let savingsLabel = '30-Day Savings';
        let incomeLabel = '30-Day Income';
        let expensesLabel = '30-Day Expenses';

        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(now);
        todayEnd.setHours(23, 59, 59, 999);

        if (rangeType === 'today') {
            startDate = todayStart;
            endDate = todayEnd;
            selectedRangeLabel = 'Today';
            savingsLabel = "Today's Savings";
            incomeLabel = "Today's Income";
            expensesLabel = "Today's Expenses";
        } else if (rangeType === 'yesterday') {
            const yesterdayStart = new Date(todayStart);
            yesterdayStart.setDate(yesterdayStart.getDate() - 1);
            const yesterdayEnd = new Date(todayEnd);
            yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);
            startDate = yesterdayStart;
            endDate = yesterdayEnd;
            selectedRangeLabel = 'Yesterday';
            savingsLabel = "Yesterday's Savings";
            incomeLabel = "Yesterday's Income";
            expensesLabel = "Yesterday's Expenses";
        } else if (rangeType === '7days') {
            const sevenDaysAgo = new Date(todayStart);
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
            startDate = sevenDaysAgo;
            endDate = todayEnd;
            selectedRangeLabel = 'Last 7 Days';
            savingsLabel = '7-Day Savings';
            incomeLabel = '7-Day Income';
            expensesLabel = '7-Day Expenses';
        } else if (rangeType === 'prevYear') {
            const lastYear = now.getFullYear() - 1;
            startDate = new Date(lastYear, 0, 1, 0, 0, 0, 0);
            endDate = new Date(lastYear, 11, 31, 23, 59, 59, 999);
            selectedRangeLabel = `Previous Year (${lastYear})`;
            savingsLabel = 'Annual Savings';
            incomeLabel = 'Annual Income';
            expensesLabel = 'Annual Expenses';
        } else if (rangeType === 'lastYear') {
            const lastYearStart = new Date(todayStart);
            lastYearStart.setFullYear(lastYearStart.getFullYear() - 1);
            startDate = lastYearStart;
            endDate = todayEnd;
            selectedRangeLabel = 'Last Year';
            savingsLabel = 'Annual Savings';
            incomeLabel = 'Annual Income';
            expensesLabel = 'Annual Expenses';
        } else {
            // Default 30days
            const thirtyDaysAgo = new Date(todayStart);
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
            startDate = thirtyDaysAgo;
            endDate = todayEnd;
            selectedRangeLabel = 'Last 30 Days';
            savingsLabel = '30-Day Savings';
            incomeLabel = '30-Day Income';
            expensesLabel = '30-Day Expenses';
        }

        // 1. Fetch user's transactions in the date range
        const transactions = await Transaction.find({
            user: userId,
            date: { $gte: startDate, $lte: endDate }
        });
        const flaggedCount = transactions.filter(t => t.isFlagged).length;

        // 2. Processed Volume (Sum of all transaction amounts in range)
        const processedVolumeSum = transactions.reduce((sum, t) => sum + t.amount, 0);
        const processedVolume = `$${processedVolumeSum.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

        // 3. Prevented Losses (Sum of flagged expense transactions in range)
        const preventedLossesSum = transactions
            .filter(t => t.isFlagged && t.type === 'expense')
            .reduce((sum, t) => sum + t.amount, 0);
        const preventedLosses = preventedLossesSum > 0 
            ? `$${preventedLossesSum.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
            : '$0';

        // 4. Budgets and Health Score Calculation
        // Find budgets corresponding to the end of the range
        let budgets = await Budget.find({
            user: userId,
            periodMonth: endDate.getMonth() + 1,
            periodYear: endDate.getFullYear()
        });

        if (budgets.length === 0) {
            // Fallback to current month/year budgets
            budgets = await Budget.find({
                user: userId,
                periodMonth: now.getMonth() + 1,
                periodYear: now.getFullYear()
            });
        }
        if (budgets.length === 0) {
            // Fallback to any budgets
            const allBudgets = await Budget.find({ user: userId });
            const uniqueBudgets = {};
            allBudgets.forEach(b => {
                uniqueBudgets[b.category] = b;
            });
            budgets = Object.values(uniqueBudgets);
        }

        // Calculate spending per category for range
        const rangeExpenses = transactions.filter(t => t.type === 'expense');
        const rangeIncomeTxns = transactions.filter(t => t.type === 'income');

        const monthlyIncomeTotal = rangeIncomeTxns.reduce((s, t) => s + t.amount, 0);
        const monthlyExpenseTotal = rangeExpenses.reduce((s, t) => s + t.amount, 0);
        const monthlySavings = monthlyIncomeTotal - monthlyExpenseTotal;
        const savingsRate = monthlyIncomeTotal > 0 ? Math.round((monthlySavings / monthlyIncomeTotal) * 100) : 0;

        const durationMs = endDate - startDate;
        const durationDays = Math.max(1, Math.round(durationMs / (1000 * 60 * 60 * 24)));

        const spentMap = {};
        rangeExpenses.forEach(t => {
            spentMap[t.category] = (spentMap[t.category] || 0) + t.amount;
        });

        // Fetch Savings Goals to factor into health score
        const savingsGoals = await SavingsGoal.find({ user: userId });

        // Phase 10: Gamified Financial Health Score (0-1000)
        let penalty = 0;
        let bonus = 0;
        
        budgets.forEach(b => {
            const spent = spentMap[b.category] || 0;
            // Scale budget limit to the duration of the range
            const scaledLimit = b.limitAmount * (durationDays / 30);
            if (spent > scaledLimit) {
                penalty += 100; // 100 points deduction for over-budget category
            } else if (scaledLimit > 0 && spent < scaledLimit * 0.8) {
                bonus += 50; // Bonus for being well under budget
            }
        });
        
        penalty += flaggedCount * 150; // Heavy penalty for flagged transactions

        // Factor in savings goals
        savingsGoals.forEach(g => {
            if (g.currentAmount >= g.targetAmount) {
                bonus += 100; // Goal reached
            } else if (g.currentAmount > 0) {
                bonus += 50; // Making progress
            }
        });

        // Base score of 700 (like a good credit score)
        const overallHealthScore = Math.max(0, Math.min(1000, 700 - penalty + bonus));

        // Update health score in User model
        await User.findByIdAndUpdate(userId, { overallHealthScore });
        req.user.overallHealthScore = overallHealthScore; // Update session value

        // 4.5. AI Forecasting Projection Engine (project to 30 days)
        const dailyVelocity = monthlyExpenseTotal / durationDays;
        const projectedExpense = Math.round(dailyVelocity * 30);
        const totalBudgetLimit = budgets.reduce((sum, b) => sum + b.limitAmount, 0);

        // 5. Gather totals object for template
        const totals = {
            processedVolume,
            flaggedCount,
            preventedLosses
        };

        // 6. Gather transaction chart data split into 4 intervals
        const chartData = [
            { processed: 0, prevented: 0 },
            { processed: 0, prevented: 0 },
            { processed: 0, prevented: 0 },
            { processed: 0, prevented: 0 }
        ];

        transactions.forEach(t => {
            const date = new Date(t.date);
            let intervalIdx = 0;
            if (durationMs > 0) {
                const fraction = (date - startDate) / durationMs;
                intervalIdx = Math.floor(fraction * 4);
                if (intervalIdx > 3) intervalIdx = 3;
                if (intervalIdx < 0) intervalIdx = 0;
            }
            chartData[intervalIdx].processed += t.amount;
            if (t.isFlagged && t.type === 'expense') {
                chartData[intervalIdx].prevented += t.amount;
            }
        });

        let maxVal = 0;
        chartData.forEach(w => {
            if (w.processed > maxVal) maxVal = w.processed;
            if (w.prevented > maxVal) maxVal = w.prevented;
        });

        // Determine a nice upper bound
        let niceMax = 100;
        if (maxVal > 0) {
            if (maxVal <= 100) niceMax = 100;
            else if (maxVal <= 500) niceMax = 500;
            else if (maxVal <= 1000) niceMax = 1000;
            else if (maxVal <= 5000) niceMax = 5000;
            else if (maxVal <= 10000) niceMax = 10000;
            else niceMax = Math.ceil(maxVal / 5000) * 5000;
        }

        const weeklyChartData = chartData.map(w => {
            const pHeight = niceMax > 0 ? Math.round((w.processed / niceMax) * 90) : 0;
            const prevHeight = niceMax > 0 ? Math.round((w.prevented / niceMax) * 90) : 0;

            const formatLabel = (val) => {
                if (val === 0) return '0';
                if (val >= 1000) return `$${(val / 1000).toFixed(1)}k`;
                return `$${val}`;
            };

            return {
                processedHeight: pHeight,
                preventedHeight: prevHeight,
                processedLabel: formatLabel(w.processed),
                preventedLabel: formatLabel(w.prevented)
            };
        });

        const yAxisLabels = [
            niceMax,
            Math.round(niceMax * 0.8),
            Math.round(niceMax * 0.6),
            Math.round(niceMax * 0.4),
            Math.round(niceMax * 0.2),
            0
        ].map(val => {
            if (val === 0) return '0';
            if (val >= 1000) return `${(val / 1000).toFixed(0)}k`;
            return `$${val}`;
        });

        let chartLabels = [];
        if (rangeType === 'today' || rangeType === 'yesterday') {
            chartLabels = ['Night', 'Morning', 'Afternoon', 'Evening'];
        } else if (rangeType === '7days') {
            const days = [];
            for (let i = 0; i < 7; i++) {
                const d = new Date(startDate);
                d.setDate(d.getDate() + i);
                days.push(d);
            }
            chartLabels = [
                `${days[0].getMonth()+1}/${days[0].getDate()} - ${days[1].getDate()}`,
                `${days[2].getMonth()+1}/${days[2].getDate()} - ${days[3].getDate()}`,
                `${days[4].getMonth()+1}/${days[4].getDate()} - ${days[5].getDate()}`,
                `${days[6].getMonth()+1}/${days[6].getDate()}`
            ];
        } else if (rangeType === 'prevYear' || rangeType === 'lastYear') {
            chartLabels = ['Q1', 'Q2', 'Q3', 'Q4'];
        } else {
            // Default 30days
            chartLabels = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
        }

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

        // Phase 11: Zombie Subscription Detector
        const zombieSubscriptions = await Transaction.aggregate([
            { 
                $match: { 
                    user: userId, 
                    type: 'expense',
                    description: { $not: /atm|withdrawal|transfer|neft|imps|sent to|paid to/i }
                } 
            },
            { $group: { 
                _id: { description: "$description", amount: "$amount" }, 
                count: { $sum: 1 },
                lastDate: { $max: "$date" }
            }},
            { $match: { count: { $gt: 1 } } },
            { $sort: { "_id.amount": -1 } },
            { $limit: 4 }
        ]);
        
        let totalAnnualSubscriptionCost = 0;
        zombieSubscriptions.forEach(sub => {
            totalAnnualSubscriptionCost += (sub._id.amount * 12);
        });

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
            totalBudgetLimit,
            selectedRangeLabel,
            savingsLabel,
            incomeLabel,
            expensesLabel,
            chartLabels,
            yAxisLabels,
            rangeType,
            zombieSubscriptions,
            totalAnnualSubscriptionCost
        });
    } catch (e) {
        console.error("Error rendering dashboard:", e);
        res.status(500).send("Error rendering dashboard");
    }
});

module.exports = router;
