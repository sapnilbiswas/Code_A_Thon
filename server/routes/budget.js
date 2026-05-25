const express = require('express');
const router = express.Router();
const Budget = require('../models/Budget');
const Transaction = require('../models/Transaction');
const SavingsGoal = require('../models/SavingsGoal');
const { isLoggedIn } = require('../middleware/auth');

// Protect all budget routes
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

// Helper: unlock milestones for a goal based on its current percent
function updateMilestones(goal) {
    const newPercent = goal.targetAmount > 0 ? (goal.currentAmount / goal.targetAmount) * 100 : 0;
    goal.milestones.forEach(m => {
        if (!m.reached && newPercent >= m.percent) {
            m.reached = true;
            m.reachedAt = new Date();
        }
        // Roll back milestones if percent dropped below them
        if (m.reached && newPercent < m.percent) {
            m.reached = false;
            m.reachedAt = undefined;
        }
    });
}

// --- GET budgets page ---
router.get('/', async (req, res) => {
    try {
        const userId = req.user._id;
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();
        const { start: monthStart, end: monthEnd } = getCurrentMonthRange();

        const budgets = await Budget.find({ user: userId, periodMonth: currentMonth, periodYear: currentYear });

        const [monthlyExpenses, monthlyIncomeTxns] = await Promise.all([
            Transaction.find({ user: userId, type: 'expense', date: { $gte: monthStart, $lte: monthEnd } }),
            Transaction.find({ user: userId, type: 'income', date: { $gte: monthStart, $lte: monthEnd } })
        ]);

        const categorySpent = {};
        let spentTotal = 0;
        monthlyExpenses.forEach(t => {
            categorySpent[t.category] = (categorySpent[t.category] || 0) + t.amount;
            spentTotal += t.amount;
        });

        const limitTotal = budgets.reduce((sum, b) => sum + b.limitAmount, 0);
        const monthlyIncome = monthlyIncomeTxns.reduce((s, t) => s + t.amount, 0);

        const error = req.query.error || null;
        const errorIncome = req.query.income ? parseFloat(req.query.income) : null;
        const errorAttempted = req.query.attempted ? parseFloat(req.query.attempted) : null;

        res.render('budgets', {
            budgets,
            categorySpent,
            spentTotal,
            limitTotal,
            monthlyIncome,
            error,
            errorIncome,
            errorAttempted
        });
    } catch (e) {
        console.error("Error loading budgets:", e);
        res.status(500).send("Error loading budgets");
    }
});

// --- POST reset all budgets for current month ---
router.post('/reset', async (req, res) => {
    try {
        const now = new Date();
        await Budget.deleteMany({
            user: req.user._id,
            periodMonth: now.getMonth() + 1,
            periodYear: now.getFullYear()
        });
        res.redirect('/budgets');
    } catch (e) {
        console.error("Error resetting budgets:", e);
        res.redirect('/budgets');
    }
});

// --- POST create/update budget limit ---
router.post('/', async (req, res) => {
    try {
        const { limitAmount, alertThreshold } = req.body;
        const category = 'Global'; // Hardcoded global budget
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        // Validate: total budget must not exceed monthly income
        const monthlyIncomeTxns = await Transaction.find({
            user: req.user._id, type: 'income', date: { $gte: monthStart, $lte: monthEnd }
        });
        const totalIncome = monthlyIncomeTxns.reduce((s, t) => s + t.amount, 0);
        const newBudgetLimit = parseFloat(limitAmount);

        if (totalIncome === 0) {
            return res.redirect(`/budgets?error=zero_income`);
        }

        if (newBudgetLimit > totalIncome) {
            return res.redirect(`/budgets?error=exceeds_income&income=${totalIncome.toFixed(2)}&attempted=${newBudgetLimit.toFixed(2)}`);
        }

        // Get old budget to calculate the change
        const existingBudget = await Budget.findOne({
            user: req.user._id, category, periodMonth: currentMonth, periodYear: currentYear
        });
        const oldBudgetLimit = existingBudget ? existingBudget.limitAmount : 0;

        // Save the new budget
        await Budget.findOneAndUpdate(
            { user: req.user._id, category, periodMonth: currentMonth, periodYear: currentYear },
            {
                limitAmount: newBudgetLimit,
                alertThreshold: alertThreshold ? parseInt(alertThreshold) : 80
            },
            { upsert: true, new: true }
        );

        // ─── AUTO SAVINGS LOGIC ──────────────────────────────────────────────
        //
        // Rule: "remaining money" (income - budget) always goes to savings goals.
        // Goals are filled smallest currentAmount first (least amount first).
        //
        // Case A: Budget DECREASED → more surplus available → deposit surplus to savings.
        // Case B: Budget INCREASED → less surplus → withdraw the extra amount from savings
        //         (starting from the goal with the SMALLEST currentAmount).
        //
        // In both cases, we recalculate the full surplus and reconcile savings.
        // ─────────────────────────────────────────────────────────────────────

        const budgetDelta = newBudgetLimit - oldBudgetLimit; // + means budget went up, - means budget went down

        // Load all incomplete savings goals sorted by currentAmount ASC (smallest first)
        let goals = await SavingsGoal.find({ user: req.user._id }).sort({ currentAmount: 1 });
        const incompleteGoals = goals.filter(g => g.currentAmount < g.targetAmount);

        if (budgetDelta > 0 && incompleteGoals.length > 0) {
            // Budget was INCREASED → need to withdraw budgetDelta from savings (smallest first)
            let toWithdraw = budgetDelta;
            for (const goal of incompleteGoals) {
                if (toWithdraw <= 0) break;
                const canWithdraw = Math.min(goal.currentAmount, toWithdraw);
                if (canWithdraw > 0) {
                    goal.currentAmount = Math.max(0, goal.currentAmount - canWithdraw);
                    updateMilestones(goal);
                    await goal.save();
                    toWithdraw -= canWithdraw;
                }
            }
            // Reload goals after withdrawal
            goals = await SavingsGoal.find({ user: req.user._id }).sort({ currentAmount: 1 });
        }

        // Now distribute the full surplus into savings (smallest currentAmount first)
        const surplus = totalIncome - newBudgetLimit;
        if (surplus > 0) {
            const freshGoals = await SavingsGoal.find({ user: req.user._id }).sort({ currentAmount: 1 });
            const freshIncomplete = freshGoals.filter(g => g.currentAmount < g.targetAmount);
            let toDeposit = surplus;

            for (const goal of freshIncomplete) {
                if (toDeposit <= 0) break;
                const remaining = goal.targetAmount - goal.currentAmount;
                const deposit = Math.min(remaining, toDeposit);
                goal.currentAmount += deposit;
                toDeposit -= deposit;
                updateMilestones(goal);
                await goal.save();
            }
        }
        // ─────────────────────────────────────────────────────────────────────

        res.redirect('/budgets');
    } catch (e) {
        console.error("Error setting budget limit:", e);
        res.redirect('/budgets');
    }
});

// --- DELETE budget limit ---
router.delete('/:id', async (req, res) => {
    try {
        await Budget.findOneAndDelete({ _id: req.params.id, user: req.user._id });
        res.redirect('/budgets');
    } catch (e) {
        console.error("Error deleting budget:", e);
        res.redirect('/budgets');
    }
});

module.exports = router;
