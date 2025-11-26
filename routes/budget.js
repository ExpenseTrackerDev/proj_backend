const express = require("express");
const router = express.Router();
const Budget = require("../models/Budget");
const Expense = require("../models/Expense");
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

// Check if month/year is current or future
const isEditable = (month, year) => {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    return year > currentYear || (year === currentYear && month >= currentMonth);
};




// GET /api/budget/:year -> return only months with budget
/*router.get("/:year", getUserMiddleware, async (req, res) => {
    try {
        const year = parseInt(req.params.year);
        const budgets = await Budget.find({ userId: req.user._id, year });

        const result = await Promise.all(budgets.map(async (budget) => {
            const start = new Date(budget.year, budget.month - 1, 1);
            const end = new Date(budget.year, budget.month, 0, 23, 59, 59);
            const expenses = await Expense.find({ userId: req.user._id, date: { $gte: start, $lte: end } });
            const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);

            return {
                month: budget.month,
                year: budget.year,
                budgetId: budget._id,
                amount: budget.amount,
                usedAmount: totalSpent,
                percentUsed: budget.amount > 0 ? Math.round((totalSpent / budget.amount) * 100) : 0,
                editable: isEditable(budget.month, budget.year),
                overBudget: totalSpent > budget.amount ? totalSpent - budget.amount : 0
            };
        }));

        res.json(result);
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
});*/
// GET /api/budget/:year -> return only months with budget
router.get("/:year", getUserMiddleware, async (req, res) => {
    try {
        const year = parseInt(req.params.year);
        const budgets = await Budget.find({ userId: req.user._id, year });

        const result = await Promise.all(budgets.map(async (budget) => {

            // Convert to string-based date range (safe for string dates)
            const monthStr = String(budget.month).padStart(2, "0");

           /* const start = `${budget.year}-${monthStr}-01`;
            const end = `${budget.year}-${monthStr}-31`;

            // Now this will work regardless of string dates
            const expenses = await Expense.find({
                userId: req.user._id,
                date: { $gte: start, $lte: end }
            });*/
            const start = new Date(budget.year, budget.month - 1, 1);
            const end = new Date(budget.year, budget.month, 0, 23, 59, 59);

            const expenses = await Expense.find({
                userId: req.user._id,
                date: { $gte: start, $lte: end }
            });

            

            const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);

            return {
                month: budget.month,
                year: budget.year,
                budgetId: budget._id,
                amount: budget.amount,
                usedAmount: totalSpent,
                percentUsed: budget.amount > 0 ? Math.round((totalSpent / budget.amount) * 100) : 0,
                editable: isEditable(budget.month, budget.year),
                overBudget: totalSpent > budget.amount ? totalSpent - budget.amount : 0
            };
        }));

        res.json(result);
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
});


// POST /api/budget/add -> add new budget
router.post("/add", getUserMiddleware, async (req, res) => {
    try {
        const { month, year, amount } = req.body;
        if (!month || !year || !amount) return res.status(400).json({ message: "Month, year, and amount required" });

        if (!isEditable(month, year)) return res.status(403).json({ message: "Cannot add budget for past months" });

        const existing = await Budget.findOne({ userId: req.user._id, month, year });
        if (existing) return res.status(400).json({ message: "Budget already exists for this month" });

        const budget = new Budget({ userId: req.user._id, month, year, amount });
        await budget.save();

        res.status(200).json({ message: "Budget added successfully", ...budget._doc });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

// POST /api/budget/edit/:budgetId -> edit existing budget
/*router.post("/edit/:budgetId", getUserMiddleware, async (req, res) => {
    try {
        const { budgetId } = req.params;
        const { amount } = req.body;
        if (!amount) return res.status(400).json({ message: "Amount required" });

        const budget = await Budget.findById(budgetId);
        if (!budget) return res.status(404).json({ message: "Budget not found" });
        if (!budget.userId.equals(req.user._id)) return res.status(403).json({ message: "Not authorized" });
        if (!isEditable(budget.month, budget.year)) return res.status(403).json({ message: "Cannot edit past month budget" });

        budget.amount = amount;
        await budget.save();

        res.json({ message: "Budget updated successfully", ...budget._doc });
        
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
});*/
// POST /api/budget/edit/:budgetId -> edit existing budget
router.post("/edit/:budgetId", getUserMiddleware, async (req, res) => {
    try {
        const { budgetId } = req.params;
        const { amount } = req.body;

        if (!amount || amount <= 0)
            return res.status(400).json({ message: "Amount required and must be > 0" });

        const budget = await Budget.findById(budgetId);
        if (!budget) return res.status(404).json({ message: "Budget not found" });

        // Ensure user owns this budget
        if (!budget.userId.equals(req.user._id))
            return res.status(403).json({ message: "Not authorized" });

        // Only allow current/future month edits
        const now = new Date();
        if (
            budget.year < now.getFullYear() ||
            (budget.year === now.getFullYear() && budget.month < now.getMonth() + 1)
        )
            return res.status(403).json({ message: "Cannot edit past month budget" });

        budget.amount = amount;
        await budget.save();

        // Compute updated totals
        const start = new Date(budget.year, budget.month - 1, 1);
        const end = new Date(budget.year, budget.month, 0, 23, 59, 59);
        const expenses = await Expense.find({
            userId: req.user._id,
            date: { $gte: start, $lte: end },
        });
        const totalSpent = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
        const percentUsed = budget.amount > 0 ? Math.round((totalSpent / budget.amount) * 100) : 0;
        const overBudget = totalSpent > budget.amount ? totalSpent - budget.amount : 0;

        res.status(200).json({
            message: "Budget updated successfully",
            budgetId: budget._id,
            month: budget.month,
            year: budget.year,
            amount: budget.amount,
            usedAmount: totalSpent,
            percentUsed,
            editable: true,
            overBudget,
        });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

/*router.post("/edit/:budgetId", getUserMiddleware, async (req, res) => {
    try {
        const { budgetId } = req.params;
        const { amount } = req.body;
        if (!amount) return res.status(400).json({ message: "Amount required" });

        const budget = await Budget.findById(budgetId);
        if (!budget) return res.status(404).json({ message: "Budget not found" });
        if (!budget.userId.equals(req.user._id)) return res.status(403).json({ message: "Not authorized" });

        if (!isEditable(budget.month, budget.year))
            return res.status(403).json({ message: "Cannot edit past month budget" });

        budget.amount = amount;
        await budget.save();

        // Recalculate usedAmount and percentUsed
        const start = new Date(budget.year, budget.month - 1, 1);
        const end = new Date(budget.year, budget.month, 0, 23, 59, 59);
        const expenses = await Expense.find({
            userId: req.user._id,
            date: { $gte: start, $lte: end }
        });
        const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);
        const percentUsed = budget.amount > 0 ? Math.round((totalSpent / budget.amount) * 100) : 0;
        const overBudget = totalSpent > budget.amount ? totalSpent - budget.amount : 0;

        res.json({
            message: "Budget updated successfully",
            budgetId: budget._id,
            month: budget.month,
            year: budget.year,
            amount: budget.amount,
            usedAmount: totalSpent,
            percentUsed,
            editable: isEditable(budget.month, budget.year),
            overBudget
        });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
});
*/

// GET /api/budget/all/:userId  -> return budgets for user with computed usedAmount, percentUsed, etc.
router.get("/all/:userId", async (req, res) => {
    try {
        const budgets = await Budget.find({ userId: req.params.userId })
            .sort({ year: 1, month: 1 });

        // compute usedAmount and other derived fields for each budget
        const result = await Promise.all(budgets.map(async (budget) => {
            const start = new Date(budget.year, budget.month - 1, 1);
            const end = new Date(budget.year, budget.month, 0, 23, 59, 59);

            const expenses = await Expense.find({
                userId: req.params.userId,
                date: { $gte: start, $lte: end }
            });

            const totalSpent = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

            return {
                _id: budget._id, 
                month: budget.month,
                year: budget.year,
                budgetId: budget._id,
                amount: budget.amount,
                usedAmount: totalSpent,
                percentUsed: budget.amount > 0 ? Math.round((totalSpent / budget.amount) * 100) : 0,
                editable: isEditable(budget.month, budget.year),
                overBudget: totalSpent > budget.amount ? totalSpent - budget.amount : 0,
                createdAt: budget.createdAt,
                updatedAt: budget.updatedAt
            };
        }));

        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server Error", error: err.message });
    }
});



module.exports = router;
