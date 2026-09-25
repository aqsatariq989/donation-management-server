const express = require("express");

const {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  updateUserStatus,
  resetUserPassword,
  deleteUser,
} = require("../controllers/userController");

const {
  protect,
  requireAdmin,
} = require("../middleware/authMiddleware");

const router = express.Router();

// ======================================================
// ALL USER ROUTES REQUIRE LOGIN + ADMIN ROLE
// ======================================================

router.use(protect);
router.use(requireAdmin);

// ======================================================
// USERS
// ======================================================

// Get all users
router.get("/", getUsers);

// Create new user
router.post("/", createUser);

// Get single user
router.get("/:id", getUserById);

// Update user
router.put("/:id", updateUser);

// Activate / Deactivate user
router.patch("/:id/status", updateUserStatus);

// Reset user password
router.patch("/:id/password", resetUserPassword);

// Delete user
router.delete("/:id", deleteUser);

module.exports = router;