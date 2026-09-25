const express = require("express");

const {
  getDonors,
  getDonorById,
  getDonorDonations,
  createDonor,
  updateDonor,
  deleteDonor,
} = require("../controllers/donorController");

const {
  protect,
  requireStaffOrAdmin,
} = require("../middleware/authMiddleware");

const router = express.Router();

// All donor routes require login
router.use(protect);
router.use(requireStaffOrAdmin);

// GET ALL DONORS
// router.get("/", getDonors);
router.get("/", (req, res, next) => {
  console.log("DONOR ROUTE HIT:", req.method, req.originalUrl);
  getDonors(req, res, next);
});

// GET DONOR DONATION HISTORY
router.get("/:id/donations", getDonorDonations);

// GET DONOR BY ID
router.get("/:id", getDonorById);

// CREATE DONOR
router.post("/", createDonor);

// UPDATE DONOR
router.put("/:id", updateDonor);

// DELETE DONOR
router.delete("/:id", deleteDonor);

module.exports = router;