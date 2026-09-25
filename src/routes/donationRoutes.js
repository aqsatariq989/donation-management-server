const express = require("express");

const {
  createDonation,
  getDonations,
  getDonationById,
  updateDonationStatus,
  convertPendingDonationToReceived,
} = require("../controllers/donationController");

const {
  protect,
  requireStaffOrAdmin,
} = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);
router.use(requireStaffOrAdmin);

// Get all donations
router.get("/", getDonations);

// Get single donation
router.get("/:id", getDonationById);

// Create donation
router.post("/", createDonation);

// Update payment status
router.put("/:id/status", updateDonationStatus);

// Convert Pending donation to Received
router.put(
  "/:id/convert-to-received",
  convertPendingDonationToReceived
);

module.exports = router;