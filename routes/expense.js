const express = require("express"); 
const router = express.Router();
const Expense = require("../models/Expense");
const User = require("../models/User");
// const Budget = require("../models/Budget"); // no longer needed for notifications

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

// GET /api/expenses/data -> get all expenses for user
router.get("/data", getUserMiddleware, async (req, res) => {
    try {
        const expenses = await Expense.find({ userId: req.user._id }).sort({ date: -1 });
        res.json(expenses);
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

// POST /api/expenses/add -> add new expense
router.post("/add", getUserMiddleware, async (req, res) => {
    try {
        const { category, amount, date, description } = req.body;
        if (!category || !amount || !date) {
            return res.status(400).json({ message: "Amount, category, and date are required" });
        }

        const expenseDate = new Date(date);
        if (!isCurrentMonth(expenseDate)) {
            return res.status(403).json({ message: "You can only add expenses for current month" });
        }

        const expense = new Expense({
            userId: req.user._id,
            category,
            amount,
            date: expenseDate,
            description: description || ""
        });

        await expense.save();
        // Notifications skipped
        res.json(expense);
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

// POST /api/expenses/edit -> edit existing expense
router.post("/edit", getUserMiddleware, async (req, res) => {
    try {
        const { expenseId } = req.query;
        const { category, amount, date, description } = req.body;

        const expense = await Expense.findById(expenseId);
        if (!expense) return res.status(404).json({ message: "Expense not found" });
        if (!expense.userId.equals(req.user._id)) return res.status(403).json({ message: "Not authorized" });
        if (!isCurrentMonth(expense.date)) return res.status(403).json({ message: "You can only edit current month expenses" });

        expense.category = category;
        expense.amount = amount;
        expense.date = new Date(date);
        expense.description = description || "";

        await expense.save();
        res.json(expense);
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

// POST /api/expenses/delete -> delete expense (current month only)
router.post("/delete", getUserMiddleware, async (req, res) => {
    try {
        const { expenseId } = req.query;

        const expense = await Expense.findById(expenseId);
        if (!expense) return res.status(404).json({ message: "Expense not found" });
        if (!expense.userId.equals(req.user._id)) return res.status(403).json({ message: "Not authorized" });
        if (!isCurrentMonth(expense.date)) return res.status(403).json({ message: "You can only delete current month expenses" });

        await expense.deleteOne();
        res.json({ message: "Expense deleted successfully" });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

// GET /api/expenses/filter -> filter expenses by category and exact date
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

        const expenses = await Expense.find(query).sort({ date: -1 });
        res.json(expenses);
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

module.exports = router;
