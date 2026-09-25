const express = require("express");

const {
  generateDonationReceipt,
} = require("../controllers/receiptController");

const {
  protect,
  requireStaffOrAdmin,
} = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);
router.use(requireStaffOrAdmin);

router.get(
  "/:id/receipt",
  generateDonationReceipt
);

module.exports = router;