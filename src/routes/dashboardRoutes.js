const express = require("express");

const {
  getDashboardSummary,
} = require("../controllers/dashboardController");

const {
  protect,
  requireStaffOrAdmin,
} = require("../middleware/authMiddleware");

const router = express.Router();

// All dashboard routes require login
router.use(protect);
router.use(requireStaffOrAdmin);

// GET DASHBOARD SUMMARY
router.get("/summary", getDashboardSummary);

module.exports = router;