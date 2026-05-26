const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const SavingsGoal = require('../models/SavingsGoal');
const { isLoggedIn } = require('../middleware/auth');

// Protect all advice routes
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

// --- Renders / Gets Advisor Insights (AJAX JSON endpoint) ---
router.get('/insights', async (req, res) => {
    try {
        const userId = req.user._id;
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();
        const { start: monthStart, end: monthEnd } = getCurrentMonthRange();

        // 1. Fetch transaction stats
        const transactions = await Transaction.find({ user: userId });
        const monthlyExpenses = transactions.filter(t => t.type === 'expense' && t.date >= monthStart && t.date <= monthEnd);
        const monthlyIncomes = transactions.filter(t => t.type === 'income' && t.date >= monthStart && t.date <= monthEnd);

        const totalSpent = monthlyExpenses.reduce((sum, t) => sum + t.amount, 0);
        const totalIncome = monthlyIncomes.reduce((sum, t) => sum + t.amount, 0);
        const flaggedCount = transactions.filter(t => t.isFlagged).length;

        // 2. Fetch budgets
        const budgets = await Budget.find({ user: userId, periodMonth: currentMonth, periodYear: currentYear });
        const spentMap = {};
        monthlyExpenses.forEach(t => {
            spentMap[t.category] = (spentMap[t.category] || 0) + t.amount;
        });

        const budgetSummaries = budgets.map(b => {
            const spent = spentMap[b.category] || 0;
            return {
                category: b.category,
                limit: b.limitAmount,
                spent,
                isOver: spent > b.limitAmount,
                percentUsed: b.limitAmount > 0 ? Math.round((spent / b.limitAmount) * 100) : 0
            };
        });

        // 3. Fetch savings goals
        const savingsGoals = await SavingsGoal.find({ user: userId });

        // 4. Check if Gemini API is available
        const apiKey = process.env.GEMINI_API_KEY;
        let adviceList = [];

        if (apiKey) {
            try {
                // Formulate detailed context for AI Advisor
                const systemPrompt = `You are Finova AI, a premium personal wealth advisor. Generate exactly 3 highly actionable, ultra-personalized financial bullet-point recommendations for the user based on their monthly metrics. Be concise, direct, professional, and supportive. Focus on budget overruns, savings milestones, and security. Keep each bullet point under 18 words and do not include any markdown bolding symbols (*).`;
                const userPrompt = `Monthly Metrics:
- Net Income: ₹${totalIncome.toLocaleString()}
- Monthly Expenses: ₹${totalSpent.toLocaleString()}
- Active Budget Compliance: ${JSON.stringify(budgetSummaries)}
- Savings Goals Goals: ${JSON.stringify(savingsGoals.map(g => ({ title: g.title, target: g.targetAmount, current: g.currentAmount })))}
- Flagged Security Risks: ${flaggedCount} transaction alerts active.`;

                const prompt = `${systemPrompt}\n\nUser Data:\n${userPrompt}`;

                // Native fetch to Google Gemini REST endpoint
                const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
                const apiResponse = await fetch(geminiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{ text: prompt }]
                        }]
                    })
                });

                if (apiResponse.ok) {
                    const result = await apiResponse.json();
                    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
                    adviceList = text.split('\n')
                        .map(line => line.replace(/^-\s*/, '').trim())
                        .filter(line => line.length > 0)
                        .slice(0, 3);
                } else {
                    console.warn(`[Advisor] Gemini returned status ${apiResponse.status}, falling back to local compiler.`);
                }
            } catch (err) {
                console.error("[Advisor] Failed to call Gemini API:", err.message);
            }
        }

        // Fallback to custom rule-based advice compiler if Gemini fails or is unconfigured
        if (adviceList.length === 0) {
            const overbudgets = budgetSummaries.filter(b => b.isOver);
            const urgentGoal = savingsGoals.find(g => (g.currentAmount / g.targetAmount) < 0.5);

            if (overbudgets.length > 0) {
                adviceList.push(`Over budget in "${overbudgets[0].category}" by ₹${Math.round(overbudgets[0].spent - overbudgets[0].limit).toLocaleString()}. Reallocate from minor categories.`);
            } else if (totalSpent > totalIncome * 0.8 && totalIncome > 0) {
                adviceList.push(`Total expense velocity is high (spent ${Math.round((totalSpent / totalIncome) * 100)}% of income). Shift to defensive spending mode.`);
            } else {
                adviceList.push(`Budget buffers are perfectly compliant this month. Maintain current transaction pacing.`);
            }

            if (urgentGoal) {
                const remainder = urgentGoal.targetAmount - urgentGoal.currentAmount;
                adviceList.push(`Goal "${urgentGoal.title}" is underfunded. Deposit ₹${Math.round(remainder * 0.1).toLocaleString()} this week to maintain progress.`);
            } else if (savingsGoals.length > 0) {
                adviceList.push(`Savings targets are progressing smoothly. Keep adding monthly milestone deposits.`);
            } else {
                adviceList.push(`No active savings goals found. Create a goal to set up milestone security pools.`);
            }

            if (flaggedCount > 0) {
                adviceList.push(`Audit ${flaggedCount} transaction warning flags in your ledger. Update your cards if transactions are suspicious.`);
            } else {
                adviceList.push(`Zero security anomalies reported. Transaction integrity checks are completely clear.`);
            }
        }

        res.json({ success: true, advice: adviceList });
    } catch (e) {
        console.error("Error loading advisor insights:", e);
        res.status(500).json({ success: false, error: "Failed to load advice insights." });
    }
});

module.exports = router;
