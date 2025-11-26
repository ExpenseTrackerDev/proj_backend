const mongoose = require("mongoose");

const budgetSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true },        // Budget amount
    month: { type: Number, required: true },         // 1-12 for January-December
    year: { type: Number, required: true },
    notified: { type: [Number], default: [] }        // Stores which thresholds (50,75,100) notifications are already sent
}, { timestamps: true });

module.exports = mongoose.model("Budget", budgetSchema);
