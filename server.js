// server.js
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(bodyParser.json());
app.use(cors());

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('MongoDB Connected'))
.catch((err) => console.log('MongoDB Connection Error:', err));

// Simple route test
app.get('/', (req, res) => {
    res.send('Backend is running');
});

// Routes
const dashboardRoutes = require('./routes/dashboard'); 
const authRoutes = require('./routes/auth');
const expenseRoutes = require("./routes/expense");
const budgetRoutes = require("./routes/budget");
const incomeRoutes = require("./routes/income");
const reportRoutes = require('./routes/report');



// Mount routers
app.use('/api/dashboard', dashboardRoutes); 
app.use('/api/auth', authRoutes);
app.use("/api/expenses", expenseRoutes); // This line is correct
app.use("/api/budget", budgetRoutes);
app.use("/api/incomes", incomeRoutes);
app.use('/api/report', reportRoutes);



// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});
