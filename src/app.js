const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// ============================================
// HOME
// ============================================
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Donation Management API is running",
  });
});

// ============================================
// HEALTH CHECK
// ============================================
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Donation Management API is running",
  });
});

// ============================================
// CATEGORY ROUTES
// ============================================
const categoryRoutes = require("./routes/categoryRoutes");
app.use("/api/categories", categoryRoutes);

// ============================================
// DONATION ROUTES
// ============================================
const donationRoutes = require("./routes/donationRoutes");
app.use("/api/donations", donationRoutes);

// ============================================
// RECEIPT ROUTES
// ============================================
const receiptRoutes = require("./routes/receiptRoutes");
app.use("/api/donations", receiptRoutes);

// ============================================
// ALLOCATION ROUTES
// ============================================
const allocationRoutes = require("./routes/allocationRoutes");
app.use("/api/allocations", allocationRoutes);

// ============================================
// DISTRIBUTION ROUTES
// ============================================
const distributionRoutes = require("./routes/distributionRoutes");
app.use("/api/distributions", distributionRoutes);

// ============================================
// DONOR ROUTES
// ============================================
const donorRoutes = require("./routes/donorRoutes");
app.use("/api/donors", donorRoutes);

// ============================================
// DASHBOARD ROUTES
// ============================================
const dashboardRoutes = require("./routes/dashboardRoutes");
app.use("/api/dashboard", dashboardRoutes);

// ============================================
// REPORT ROUTES
// ============================================
const reportRoutes = require("./routes/reportRoutes");
app.use("/api/reports", reportRoutes);

// ============================================
// AUTH ROUTES
// ============================================
const authRoutes = require("./routes/authRoutes");
app.use("/api/auth", authRoutes);

// ============================================
// AUDIT LOG ROUTES
// ============================================
const auditLogRoutes = require("./routes/auditLogRoutes");
app.use("/api/audit-logs", auditLogRoutes);

// User Management
const userRoutes = require("./routes/userRoutes");
app.use("/api/users", userRoutes);

// ============================================
// ROUTE NOT FOUND HANDLER
// ============================================
app.use((req, res) => {
  console.error("====================================");
  console.error("ROUTE NOT FOUND");
  console.error("Method:", req.method);
  console.error("URL:", req.originalUrl);
  console.error("====================================");

  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// ============================================
// GLOBAL JSON ERROR HANDLER
// ============================================
app.use((err, req, res, next) => {
  console.error("====================================");
  console.error("GLOBAL API ERROR");
  console.error("Method:", req.method);
  console.error("URL:", req.originalUrl);
  console.error("Message:", err.message);
  console.error("Stack:", err.stack);
  console.error("====================================");

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

module.exports = app;