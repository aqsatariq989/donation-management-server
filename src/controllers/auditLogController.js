const mongoose = require("mongoose");
const AuditLog = require("../models/auditLog");

// ======================================================
// GET ALL AUDIT LOGS
// ======================================================
const getAuditLogs = async (req, res) => {
  try {
    const {
      module,
      action,
      userId,
      startDate,
      endDate,
      page = 1,
      limit = 50,
    } = req.query;

    const filter = {};

    // --------------------------------------------------
    // MODULE FILTER
    // --------------------------------------------------

    if (module) {
      filter.module = module.trim();
    }

    // --------------------------------------------------
    // ACTION FILTER
    // --------------------------------------------------

    if (action) {
      filter.action = action.trim().toUpperCase();
    }

    // --------------------------------------------------
    // USER FILTER
    // --------------------------------------------------

    if (userId) {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID",
        });
      }

      filter.userId = userId;
    }

    // --------------------------------------------------
    // DATE FILTER
    // --------------------------------------------------

    if (startDate || endDate) {
      filter.createdAt = {};

      if (startDate) {
        const start = new Date(startDate);

        if (Number.isNaN(start.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid start date",
          });
        }

        start.setHours(0, 0, 0, 0);
        filter.createdAt.$gte = start;
      }

      if (endDate) {
        const end = new Date(endDate);

        if (Number.isNaN(end.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid end date",
          });
        }

        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    // --------------------------------------------------
    // PAGINATION
    // --------------------------------------------------

    const currentPage = Math.max(
      Number(page) || 1,
      1
    );

    const perPage = Math.min(
      Math.max(Number(limit) || 50, 1),
      200
    );

    const skip =
      (currentPage - 1) * perPage;

    // --------------------------------------------------
    // GET DATA
    // --------------------------------------------------

    const [logs, totalRecords] =
      await Promise.all([
        AuditLog.find(filter)
          .populate(
            "userId",
            "name email role"
          )
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(perPage),

        AuditLog.countDocuments(filter),
      ]);

    const totalPages =
      Math.ceil(totalRecords / perPage);

    // --------------------------------------------------
    // RESPONSE
    // --------------------------------------------------

    return res.status(200).json({
      success: true,

      pagination: {
        currentPage,
        perPage,
        totalRecords,
        totalPages,
        hasNextPage:
          currentPage < totalPages,
        hasPreviousPage:
          currentPage > 1,
      },

      filters: {
        module: module || null,
        action: action || null,
        userId: userId || null,
        startDate: startDate || null,
        endDate: endDate || null,
      },

      count: logs.length,
      data: logs,
    });
  } catch (error) {
    console.error(
      "Get audit logs error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to fetch audit logs",
      error: error.message,
    });
  }
};

// ======================================================
// GET AUDIT LOG BY ID
// ======================================================
const getAuditLogById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid audit log ID",
      });
    }

    const auditLog =
      await AuditLog.findById(id).populate(
        "userId",
        "name email role"
      );

    if (!auditLog) {
      return res.status(404).json({
        success: false,
        message: "Audit log not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: auditLog,
    });
  } catch (error) {
    console.error(
      "Get audit log by ID error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to fetch audit log",
      error: error.message,
    });
  }
};

module.exports = {
  getAuditLogs,
  getAuditLogById,
};