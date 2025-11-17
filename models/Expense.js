const mongoose = require("mongoose");

const expenseSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    category: String,
    amount: Number,
    date: Date,
    description: String
});

module.exports = mongoose.model("Expense", expenseSchema);

