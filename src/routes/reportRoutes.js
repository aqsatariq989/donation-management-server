const express = require("express");

const {
  getMonthlyReport,
} = require("../controllers/reportController");

const {
  exportMonthlyReportExcel,
} = require("../controllers/reportExportController");

const {
  exportMonthlyReportPdf,
} = require("../controllers/reportPdfController");

const {
  protect,
  requireStaffOrAdmin,
} = require("../middleware/authMiddleware");

const router = express.Router();

// All report routes require login
router.use(protect);
router.use(requireStaffOrAdmin);

// MONTHLY REPORT
router.get("/monthly", getMonthlyReport);

// MONTHLY REPORT - EXCEL
router.get(
  "/monthly/excel",
  exportMonthlyReportExcel
);

// MONTHLY REPORT - PDF
router.get(
  "/monthly/pdf",
  exportMonthlyReportPdf
);

module.exports = router;