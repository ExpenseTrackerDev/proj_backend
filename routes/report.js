const express = require("express");
const router = express.Router(); // ← this was missing
const PDFDocument = require("pdfkit");
const User = require("../models/User");
const Income = require("../models/Income");
const Expense = require("../models/Expense");

// Generate PDF report for a user for a given month/year
router.get("/pdf", async (req, res) => {
    try {
        const { userId, month, year } = req.query;
        if (!userId) return res.status(400).send("userId is required");

        const user = await User.findById(userId);
        if (!user) return res.status(404).send("User not found");

        const selectedMonth = month ? parseInt(month) - 1 : new Date().getMonth();
        const selectedYear = year ? parseInt(year) : new Date().getFullYear();
        const startDate = new Date(selectedYear, selectedMonth, 1);
        const endDate = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59);

        const incomes = await Income.find({ userId, date: { $gte: startDate, $lte: endDate } });
        const expenses = await Expense.find({ userId, date: { $gte: startDate, $lte: endDate } });

        const doc = new PDFDocument({ size: "A4", margin: 50 });

        // Set headers to force download
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename=${user.username}_${selectedMonth + 1}_${selectedYear}_report.pdf`
        );

        doc.pipe(res);

        // PDF content
        doc.fontSize(20).text(`Monthly Report for ${user.username}`, { align: "center" });
        doc.moveDown();

        doc.fontSize(16).text(`Month: ${selectedMonth + 1} / Year: ${selectedYear}`);
        doc.moveDown();

        doc.fontSize(14).text("Incomes:");
        incomes.forEach(i => {
            doc.text(`• ${i.category}: $${i.amount} on ${i.date.toDateString()}`);
        });
        doc.moveDown();

        doc.fontSize(14).text("Expenses:");
        expenses.forEach(e => {
            doc.text(`• ${e.category}: $${e.amount} on ${e.date.toDateString()}`);
        });

        const totalIncome = incomes.reduce((sum, i) => sum + i.amount, 0);
        const totalExpense = expenses.reduce((sum, e) => sum + e.amount, 0);
        const balance = totalIncome - totalExpense;

        doc.moveDown();
        doc.fontSize(16).text(`Total Income: $${totalIncome}`);
        doc.text(`Total Expense: $${totalExpense}`);
        doc.text(`Balance: $${balance}`);

        doc.end(); // finalize PDF
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

module.exports = router; // ← must export router
