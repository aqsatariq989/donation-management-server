const express = require("express");

const {
  createDistribution,
  getDistributions,
  getDistributionById,
} = require("../controllers/distributionController");

const {
  generateDistributionReceipt,
} = require("../controllers/distributionReceiptController");

const {
  protect,
  requireStaffOrAdmin,
} = require("../middleware/authMiddleware");

const router = express.Router();

// ==========================================================
// ALL DISTRIBUTION ROUTES REQUIRE LOGIN
// ==========================================================

router.use(protect);
router.use(requireStaffOrAdmin);

// ==========================================================
// GET ALL DISTRIBUTIONS
// ==========================================================

router.get(
  "/",
  getDistributions
);

// ==========================================================
// GENERATE DISTRIBUTION RECEIPT
// IMPORTANT: Keep this BEFORE /:id
// ==========================================================

router.get(
  "/:id/receipt",
  generateDistributionReceipt
);

// ==========================================================
// GET DISTRIBUTION BY ID
// ==========================================================

router.get(
  "/:id",
  getDistributionById
);

// ==========================================================
// CREATE DISTRIBUTION
// ==========================================================

router.post(
  "/",
  createDistribution
);

module.exports = router;