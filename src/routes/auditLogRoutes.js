const express = require("express");

const {
  getAuditLogs,
  getAuditLogById,
} = require("../controllers/auditLogController");

const {
  protect,
  requireAdmin,
} = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);
router.use(requireAdmin);

router.get("/", getAuditLogs);

router.get("/:id", getAuditLogById);

module.exports = router;