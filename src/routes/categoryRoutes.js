const express = require("express");

const {
  getCategories,
  getCategoryById,
  getCategoryBalances,
  getTotalPercentage,
  createCategory,
  updateCategory,
  updateCategoryStatus,
  equalAllocation,
  deleteCategory,
} = require("../controllers/categoryController");

const {
  protect,
  requireStaffOrAdmin,
  requireAdmin,
} = require("../middleware/authMiddleware");

const router = express.Router();

/*
|--------------------------------------------------------------------------
| Authentication
|--------------------------------------------------------------------------
*/

router.use(protect);

/*
|--------------------------------------------------------------------------
| Staff + Admin
|--------------------------------------------------------------------------
*/

/*
 * GET /api/categories
 */
router.get(
  "/",
  requireStaffOrAdmin,
  getCategories
);

/*
 * GET /api/categories/balances
 *
 * IMPORTANT:
 * This must come before /:id
 */
router.get(
  "/balances",
  requireStaffOrAdmin,
  getCategoryBalances
);

/*
 * GET /api/categories/total-percentage
 */
router.get(
  "/total-percentage",
  requireStaffOrAdmin,
  getTotalPercentage
);

/*
 * GET /api/categories/:id
 */
router.get(
  "/:id",
  requireStaffOrAdmin,
  getCategoryById
);

/*
|--------------------------------------------------------------------------
| Admin Only
|--------------------------------------------------------------------------
*/

/*
 * POST /api/categories
 *
 * Add new category
 */
router.post(
  "/",
  requireAdmin,
  createCategory
);

/*
 * POST /api/categories/equal-allocation
 *
 * Automatically divide 100% among active categories.
 *
 * IMPORTANT:
 * This must come BEFORE /:id
 */
router.post(
  "/equal-allocation",
  requireAdmin,
  equalAllocation
);

/*
 * PUT /api/categories/:id
 *
 * Edit category
 */
router.put(
  "/:id",
  requireAdmin,
  updateCategory
);

/*
 * PATCH /api/categories/:id/status
 *
 * Activate / Deactivate category
 */
router.patch(
  "/:id/status",
  requireAdmin,
  updateCategoryStatus
);

/*
 * DELETE /api/categories/:id
 */
router.delete(
  "/:id",
  requireAdmin,
  deleteCategory
);

module.exports = router;