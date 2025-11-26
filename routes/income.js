const express = require("express");
const router = express.Router();
const Income = require("../models/Income");
const User = require("../models/User");

// Middleware to validate user
const getUserMiddleware = async (req, res, next) => {
    try {
        const userId = req.query.userId || req.header("userId");
        if (!userId) return res.status(401).json({ message: "User not authenticated" });

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: "User not found" });

        req.user = user;
        next();
    } catch (err) {
        return res.status(500).json({ message: "Server error", error: err.message });
    }
};

// Check if date belongs to current month
const isCurrentMonth = (date) => {
    const now = new Date();
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
};

// GET /api/incomes/data -> get all incomes for user
router.get("/data", getUserMiddleware, async (req, res) => {
    try {
        const incomes = await Income.find({ userId: req.user._id }).sort({ date: -1 });
        res.json(incomes);
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

// POST /api/incomes/add -> add new income
router.post("/add", getUserMiddleware, async (req, res) => {
    try {
        const { category, amount, date, description } = req.body;
        if (!category || !amount || !date) {
            return res.status(400).json({ message: "Amount, category, and date are required" });
        }

        const incomeDate = new Date(date);
        if (!isCurrentMonth(incomeDate)) {
            return res.status(403).json({ message: "You can only add incomes for current month" });
        }

        const income = new Income({
            userId: req.user._id,
            category,
            amount,
            date: incomeDate,
            description: description || ""
        });

        await income.save();
        res.json(income);
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

// POST /api/incomes/edit -> edit existing income
router.post("/edit", getUserMiddleware, async (req, res) => {
    try {
        const { incomeId } = req.query;
        const { category, amount, date, description } = req.body;

        const income = await Income.findById(incomeId);
        if (!income) return res.status(404).json({ message: "Income not found" });
        if (!income.userId.equals(req.user._id)) return res.status(403).json({ message: "Not authorized" });
        if (!isCurrentMonth(income.date)) return res.status(403).json({ message: "You can only edit current month incomes" });

        income.category = category;
        income.amount = amount;
        income.date = new Date(date);
        income.description = description || "";

        await income.save();
        res.json(income);
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

// POST /api/incomes/delete -> delete income (current month only)
router.post("/delete", getUserMiddleware, async (req, res) => {
    try {
        const { incomeId } = req.query;

        const income = await Income.findById(incomeId);
        if (!income) return res.status(404).json({ message: "Income not found" });
        if (!income.userId.equals(req.user._id)) return res.status(403).json({ message: "Not authorized" });
        if (!isCurrentMonth(income.date)) return res.status(403).json({ message: "You can only delete current month incomes" });

        await income.deleteOne();
        res.json({ message: "Income deleted successfully" });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

// GET /api/incomes/filter -> filter incomes by category and exact date
router.get("/filter", getUserMiddleware, async (req, res) => {
    try {
        const { category, date } = req.query;

        let query = { userId: req.user._id };
        if (category) query.category = { $regex: new RegExp(`^${category}$`, "i") };
        if (date) {
            const d = new Date(date);
            const nextDay = new Date(d);
            nextDay.setDate(d.getDate() + 1);
            query.date = { $gte: d, $lt: nextDay };
        }

        const incomes = await Income.find(query).sort({ date: -1 });
        res.json(incomes);
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

module.exports = router;
