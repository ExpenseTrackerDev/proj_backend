// routes/dashboard.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Income = require('../models/Income');
const Expense = require('../models/Expense');

// Middleware to validate user by ID
const getUserMiddleware = async (req, res, next) => {
    const userId = req.query.userId; // replace with token later if needed
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
        const { month, year } = req.query; // 0-based month

        // ✅ ONLY CHANGE: make month 1-based → 0-based
        const selectedMonth = month ? (parseInt(month) - 1) : new Date().getMonth();

        const selectedYear = year ? parseInt(year) : new Date().getFullYear();

        const startDate = new Date(selectedYear, selectedMonth, 1);
        const endDate = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59);

        // Fetch incomes and expenses for selected month
        const incomes = await Income.find({
            userId: req.user._id,
            date: { $gte: startDate, $lte: endDate }
        }).sort({ date: -1 });

        const expenses = await Expense.find({
            userId: req.user._id,
            date: { $gte: startDate, $lte: endDate }
        }).sort({ date: -1 });

        // Totals
        const totalIncome = incomes.reduce((sum, i) => sum + i.amount, 0);
        const totalExpense = expenses.reduce((sum, e) => sum + e.amount, 0);
        const balance = totalIncome - totalExpense;

        // Recent transactions (merge both arrays and take latest 5)
        const mergedTransactions = [
            ...incomes.map(i => ({ type: "Income", amount: i.amount, category: i.category, description: i.description, date: i.date })),
            ...expenses.map(e => ({ type: "Expense", amount: e.amount, category: e.category, description: e.description, date: e.date }))
        ].sort((a, b) => b.date - a.date);

        const recentTransactions = mergedTransactions.slice(0, 5);

        // Daily chart data
        const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
        const dailyIncome = Array(daysInMonth).fill(0);
        const dailyExpense = Array(daysInMonth).fill(0);

        incomes.forEach(i => { dailyIncome[i.date.getDate() - 1] += i.amount });
        expenses.forEach(e => { dailyExpense[e.date.getDate() - 1] += e.amount });

        // Advice based on previous month
        const prevMonth = selectedMonth === 0 ? 11 : selectedMonth - 1;
        const prevYear = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
        const prevStart = new Date(prevYear, prevMonth, 1);
        const prevEnd = new Date(prevYear, prevMonth + 1, 0, 23, 59, 59);

        const prevIncomes = await Income.find({ userId: req.user._id, date: { $gte: prevStart, $lte: prevEnd } });
        const prevExpenses = await Expense.find({ userId: req.user._id, date: { $gte: prevStart, $lte: prevEnd } });

        const prevTotalIncome = prevIncomes.reduce((sum, i) => sum + i.amount, 0);
        const prevTotalExpense = prevExpenses.reduce((sum, e) => sum + e.amount, 0);

        let advice = "Great savings last month! Keep it up 💰";
        if (prevTotalIncome > 0) {
            const spentRatio = prevTotalExpense / prevTotalIncome;
            if (spentRatio > 0.8) advice = "⚠️ You spent a lot last month. Try saving more this month!";
            else if (spentRatio > 0.5) advice = "Good balance last month — keep managing expenses wisely 👍";
        }

        res.json({
            username: req.user.username,
            email: req.user.email,
            totalIncome,
            totalExpense,
            balance,
            recentTransactions,
            dailyIncome,
            dailyExpense,
            advice
        });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

module.exports = router;
