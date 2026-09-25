const express = require("express");

const {
  getAllocations,
} = require("../controllers/allocationController");

const {
  protect,
  requireStaffOrAdmin,
} = require("../middleware/authMiddleware");

const router = express.Router();

// All allocation routes require login
router.use(protect);
router.use(requireStaffOrAdmin);

// GET ALL ALLOCATIONS
// GET /api/allocations
router.get("/", getAllocations);

module.exports = router;