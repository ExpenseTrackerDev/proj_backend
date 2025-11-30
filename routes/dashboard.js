// routes/dashboard.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Income = require('../models/Income');
const Expense = require('../models/Expense');

// Middleware to validate user by ID
const getUserMiddleware = async (req, res, next) => {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ message: "User ID is required" });

    try {
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: "User not found" });
        req.user = user;
        next();
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

// Dashboard data for a month
router.get('/data', getUserMiddleware, async (req, res) => {
    try {
        const { month, year } = req.query;
        const selectedMonth = month ? (parseInt(month) - 1) : new Date().getMonth();
        const selectedYear = year ? parseInt(year) : new Date().getFullYear();

        const startDate = new Date(selectedYear, selectedMonth, 1);
        const endDate = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59);

        // Fetch incomes and expenses
        const incomesRaw = await Income.find({ userId: req.user._id, date: { $gte: startDate, $lte: endDate } }).sort({ date: -1 });
        const expensesRaw = await Expense.find({ userId: req.user._id, date: { $gte: startDate, $lte: endDate } }).sort({ date: -1 });

        // Normalize categories
        const incomes = incomesRaw.map(i => ({ ...i._doc, category: i.category.toLowerCase() }));
        const expenses = expensesRaw.map(e => ({ ...e._doc, category: e.category.toLowerCase() }));

        // Totals
        const totalIncome = incomes.reduce((sum, i) => sum + i.amount, 0);
        const totalExpense = expenses.reduce((sum, e) => sum + e.amount, 0);
        const balance = totalIncome - totalExpense;

        // ALL transactions for the month
        const allTransactions = [
            ...incomes.map(i => ({ type: "Income", amount: i.amount, category: i.category, description: i.description, date: i.date })),
            ...expenses.map(e => ({ type: "Expense", amount: e.amount, category: e.category, description: e.description, date: e.date }))
        ].sort((a, b) => b.date - a.date); // sorted descending

        // Daily chart data
        const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
        const dailyIncome = Array(daysInMonth).fill(0);
        const dailyExpense = Array(daysInMonth).fill(0);
        incomes.forEach(i => { dailyIncome[i.date.getDate() - 1] += i.amount });
        expenses.forEach(e => { dailyExpense[e.date.getDate() - 1] += e.amount });

        // Previous month calculations
        const prevMonth = selectedMonth === 0 ? 11 : selectedMonth - 1;
        const prevYear = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
        const prevStart = new Date(prevYear, prevMonth, 1);
        const prevEnd = new Date(prevYear, prevMonth + 1, 0, 23, 59, 59);

        const prevIncomesRaw = await Income.find({ userId: req.user._id, date: { $gte: prevStart, $lte: prevEnd } });
        const prevExpensesRaw = await Expense.find({ userId: req.user._id, date: { $gte: prevStart, $lte: prevEnd } });

        const prevIncomes = prevIncomesRaw.map(i => ({ ...i._doc, category: i.category.toLowerCase() }));
        const prevExpenses = prevExpensesRaw.map(e => ({ ...e._doc, category: e.category.toLowerCase() }));

        const prevTotalIncome = prevIncomes.reduce((sum, i) => sum + i.amount, 0);
        const prevTotalExpense = prevExpenses.reduce((sum, e) => sum + e.amount, 0);

        // Prepare advice fields
        let advice = "";
        let categoryAdvice = "";
        let incomeUsageMessage = "";
        let hasPreviousData = true;

        if (prevIncomes.length === 0 && prevExpenses.length === 0) {
            hasPreviousData = false;
            advice = "No previous month data available.";
            incomeUsageMessage = "No previous month income to calculate usage.";
        } else {
            const spentRatio = prevTotalIncome > 0 ? prevTotalExpense / prevTotalIncome : 0;
            if (spentRatio > 0.8) advice = "⚠️ You spent a lot last month. Try saving more this month!";
            else if (spentRatio > 0.5) advice = "Good balance last month — keep managing expenses wisely 👍";
            else advice = "Great savings last month! Keep it up 💰";

            if (prevTotalIncome > 0) {
                const usage = ((prevTotalExpense / prevTotalIncome) * 100).toFixed(1);
                incomeUsageMessage = `You used ${usage}% of your income last month.`;
            }

            // Category-based advice
            const categoryTotals = {};
            prevExpenses.forEach(e => {
                categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount;
            });

            let maxCategory = null;
            let maxAmount = 0;
            for (const cat in categoryTotals) {
                if (categoryTotals[cat] > maxAmount) {
                    maxAmount = categoryTotals[cat];
                    maxCategory = cat;
                }
            }

            if (maxCategory && prevTotalIncome > 0 && maxAmount > prevTotalIncome * 0.3) {
                categoryAdvice = `You spent a lot on ${maxCategory}. Try reducing this category.`;
            }
        }

        // Final JSON response
        res.json({
            username: req.user.username,
            email: req.user.email,
            totalIncome,
            totalExpense,
            balance,
            recentTransactions: allTransactions, // all transactions of the month
            dailyIncome,
            dailyExpense,
            advice,
            categoryAdvice,
            incomeUsageMessage,
            hasPreviousData
        });

    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

module.exports = router;
