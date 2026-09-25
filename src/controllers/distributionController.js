const mongoose = require("mongoose");
const Distribution = require("../models/distribution");
const Allocation = require("../models/allocation");
const Category = require("../models/category");
const { createAuditLog } = require("../services/auditLogService");

// ======================================================
// CREATE DISTRIBUTION
// ======================================================
const createDistribution = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const {
      distributionDate,
      categoryId,
      beneficiaryName,
      amount,
      purpose,
      paymentMethod,
      referenceNumber = "",
      notes = "",
      receiptUrl = "",
    } = req.body;

    // Basic validation
    if (!distributionDate) {
      return res.status(400).json({
        success: false,
        message: "Distribution date is required",
      });
    }

    if (!categoryId) {
      return res.status(400).json({
        success: false,
        message: "Category is required",
      });
    }

    if (!beneficiaryName || !beneficiaryName.trim()) {
      return res.status(400).json({
        success: false,
        message: "Beneficiary name is required",
      });
    }

    const distributionAmount = Number(amount);

    if (
      !Number.isFinite(distributionAmount) ||
      distributionAmount <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Distribution amount must be greater than 0",
      });
    }

    if (!purpose || !purpose.trim()) {
      return res.status(400).json({
        success: false,
        message: "Purpose is required",
      });
    }

    if (!["Cash", "Bank", "Online", "Other"].includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment method",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid category ID",
      });
    }

    session.startTransaction();

    // ======================================================
    // CHECK CATEGORY
    // ======================================================
    const category = await Category.findById(categoryId).session(session);

    if (!category) {
      throw new Error("Category not found");
    }

    if (!category.isActive) {
      throw new Error("Category is not active");
    }

    // ======================================================
    // GET TOTAL ALLOCATED
    // ======================================================
    const allocations = await Allocation.find({
      categoryId,
    }).session(session);

    const totalAllocated = allocations.reduce(
      (total, allocation) =>
        total + Number(allocation.allocatedAmount.toString()),
      0
    );

    // ======================================================
    // GET TOTAL DISTRIBUTED
    // ======================================================
    const existingDistributions = await Distribution.find({
      categoryId,
    }).session(session);

    const totalDistributed = existingDistributions.reduce(
      (total, distribution) =>
        total + Number(distribution.amount.toString()),
      0
    );

    // ======================================================
    // CALCULATE REMAINING BALANCE
    // ======================================================
    const remainingBalance =
      Number(category.openingBalance || 0) +
      totalAllocated -
      totalDistributed;

    // ======================================================
    // CHECK SUFFICIENT BALANCE
    // ======================================================
    if (distributionAmount > remainingBalance + 0.000001) {
      throw new Error(
        `Insufficient category balance. Available balance: ${remainingBalance.toFixed(
          2
        )}`
      );
    }

    // ======================================================
    // CREATE DISTRIBUTION
    // ======================================================
    const distribution = await Distribution.create(
      [
        {
          distributionDate,
          categoryId,
          beneficiaryName: beneficiaryName.trim(),
          amount: mongoose.Types.Decimal128.fromString(
            distributionAmount.toFixed(2)
          ),
          purpose: purpose.trim(),
          paymentMethod,
          referenceNumber,
          notes,
          receiptUrl,

          // User tracking
          createdBy: req.user?.userId || null,
          updatedBy: req.user?.userId || null,
        },
      ],
      { session }
    );

    // ======================================================
    // COMMIT TRANSACTION
    // ======================================================
 await session.commitTransaction();

const createdDistribution = distribution[0];

await createAuditLog({
  user: req.user,
  action: "CREATE",
  module: "Distribution",
  description: "Created a new distribution",
  recordId: createdDistribution._id,
  metadata: {
    categoryId: category._id,
    categoryName: category.name,
    beneficiaryName: beneficiaryName.trim(),
    amount: Number(distributionAmount.toFixed(2)),
    paymentMethod,
    referenceNumber,
  },
});

    // ======================================================
    // RESPONSE
    // ======================================================
    return res.status(201).json({
      success: true,
      message: "Distribution created successfully",
      data: {
        distribution: createdDistribution,
        category: {
          id: category._id,
          name: category.name,
        },
        previousBalance: Number(remainingBalance.toFixed(2)),
        distributedAmount: Number(distributionAmount.toFixed(2)),
        remainingBalance: Number(
          (remainingBalance - distributionAmount).toFixed(2)
        ),
      },
    });
  } catch (error) {
    // Only abort if transaction is still active
    if (session.inTransaction()) {
      await session.abortTransaction();
    }

    console.error("Create distribution error:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Failed to create distribution",
    });
  } finally {
    await session.endSession();
  }
};

// ======================================================
// GET ALL DISTRIBUTIONS
// ======================================================
// ======================================================
// GET ALL DISTRIBUTIONS - SEARCH / FILTER / PAGINATION
// ======================================================
const getDistributions = async (req, res) => {
  try {
    // Read and normalize all query parameters.
    const search = String(req.query.search || "").trim();
    const rawCategoryId = String(req.query.categoryId || "").trim();
    const categoryName = String(req.query.category || "").trim();
    const startDate = String(req.query.startDate || "").trim();
    const endDate = String(req.query.endDate || "").trim();
    const minAmount = String(req.query.minAmount ?? "").trim();
    const maxAmount = String(req.query.maxAmount ?? "").trim();

    const requestedPage = Number(req.query.page);
    const requestedLimit = Number(req.query.limit);

    const currentPage =
      Number.isFinite(requestedPage) && requestedPage > 0
        ? Math.floor(requestedPage)
        : 1;

    const perPage =
      Number.isFinite(requestedLimit) && requestedLimit > 0
        ? Math.min(Math.floor(requestedLimit), 100)
        : 10;

    const skip = (currentPage - 1) * perPage;

    console.log("==============================================");
    console.log("DISTRIBUTION GET REQUEST");
    console.log("Query:", req.query);

    // ======================================================
    // BUILD MONGODB FILTER
    // ======================================================
    const filter = {};

    // ======================================================
    // SEARCH
    // Beneficiary, purpose, reference number
    // ======================================================
    if (search) {
      const escapedSearch = search.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

      const searchRegex = new RegExp(escapedSearch, "i");

      filter.$or = [
        { beneficiaryName: searchRegex },
        { purpose: searchRegex },
        { referenceNumber: searchRegex },
      ];
    }

    // ======================================================
    // CATEGORY FILTER
    //
    // Primary expected value:
    // categoryId=<Mongo ObjectId>
    //
    // Also accepts:
    // category=<category name>
    // This prevents the API from silently ignoring a category
    // if the frontend sends a category name instead of an ID.
    // ======================================================
    if (rawCategoryId) {
      if (mongoose.Types.ObjectId.isValid(rawCategoryId)) {
        filter.categoryId = new mongoose.Types.ObjectId(rawCategoryId);
      } else {
        // If categoryId is not an ObjectId, try treating it as
        // a category name instead of returning all records.
        const categoryByIdValue = await Category.findOne({
          name: {
            $regex: `^${rawCategoryId.replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&"
            )}$`,
            $options: "i",
          },
        }).select("_id");

        if (!categoryByIdValue) {
          console.log("Category filter matched no category:", rawCategoryId);

          return res.status(200).json({
            success: true,
            pagination: {
              currentPage,
              perPage,
              totalRecords: 0,
              totalPages: 1,
              hasNextPage: false,
              hasPreviousPage: currentPage > 1,
            },
            filters: {
              search,
              categoryId: rawCategoryId,
              category: categoryName || null,
              startDate: startDate || null,
              endDate: endDate || null,
              minAmount: minAmount !== "" ? Number(minAmount) : null,
              maxAmount: maxAmount !== "" ? Number(maxAmount) : null,
            },
            count: 0,
            data: [],
          });
        }

        filter.categoryId = categoryByIdValue._id;
      }
    } else if (categoryName) {
      const escapedCategoryName = categoryName.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

      const category = await Category.findOne({
        name: {
          $regex: `^${escapedCategoryName}$`,
          $options: "i",
        },
      }).select("_id");

      if (!category) {
        return res.status(200).json({
          success: true,
          pagination: {
            currentPage,
            perPage,
            totalRecords: 0,
            totalPages: 1,
            hasNextPage: false,
            hasPreviousPage: currentPage > 1,
          },
          filters: {
            search,
            categoryId: rawCategoryId || null,
            category: categoryName,
            startDate: startDate || null,
            endDate: endDate || null,
            minAmount: minAmount !== "" ? Number(minAmount) : null,
            maxAmount: maxAmount !== "" ? Number(maxAmount) : null,
          },
          count: 0,
          data: [],
        });
      }

      filter.categoryId = category._id;
    }

    // ======================================================
    // DATE FILTER
    // Uses local calendar dates:
    // startDate = 00:00:00.000
    // endDate   = 23:59:59.999
    // ======================================================
    const parseDateOnly = (value, endOfDay = false) => {
      if (!value) return null;

      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

      if (!match) return null;

      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);

      const date = new Date(
        year,
        month - 1,
        day,
        endOfDay ? 23 : 0,
        endOfDay ? 59 : 0,
        endOfDay ? 59 : 0,
        endOfDay ? 999 : 0
      );

      // Reject impossible dates such as 2026-02-31.
      if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
      ) {
        return null;
      }

      return date;
    };

    if (startDate || endDate) {
      filter.distributionDate = {};

      if (startDate) {
        const start = parseDateOnly(startDate, false);

        if (!start) {
          return res.status(400).json({
            success: false,
            message: "Invalid start date. Use YYYY-MM-DD.",
          });
        }

        filter.distributionDate.$gte = start;
      }

      if (endDate) {
        const end = parseDateOnly(endDate, true);

        if (!end) {
          return res.status(400).json({
            success: false,
            message: "Invalid end date. Use YYYY-MM-DD.",
          });
        }

        filter.distributionDate.$lte = end;
      }

      if (
        startDate &&
        endDate &&
        startDate > endDate
      ) {
        return res.status(400).json({
          success: false,
          message: "Start date cannot be after end date.",
        });
      }
    }

    // ======================================================
    // AMOUNT FILTER
    // Decimal128-safe MongoDB values
    // ======================================================
    const hasMinAmount = minAmount !== "";
    const hasMaxAmount = maxAmount !== "";

    if (hasMinAmount) {
      const minimum = Number(minAmount);

      if (!Number.isFinite(minimum) || minimum < 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid minimum amount.",
        });
      }

      filter.amount = {
        ...(filter.amount || {}),
        $gte: mongoose.Types.Decimal128.fromString(
          minimum.toFixed(2)
        ),
      };
    }

    if (hasMaxAmount) {
      const maximum = Number(maxAmount);

      if (!Number.isFinite(maximum) || maximum < 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid maximum amount.",
        });
      }

      filter.amount = {
        ...(filter.amount || {}),
        $lte: mongoose.Types.Decimal128.fromString(
          maximum.toFixed(2)
        ),
      };
    }

    if (
      hasMinAmount &&
      hasMaxAmount &&
      Number(minAmount) > Number(maxAmount)
    ) {
      return res.status(400).json({
        success: false,
        message: "Minimum amount cannot be greater than maximum amount.",
      });
    }

    console.log("FINAL MONGODB FILTER:", JSON.stringify(filter, null, 2));

    // ======================================================
    // QUERY DATA + TOTAL COUNT
    // ======================================================
    const [distributions, totalRecords] = await Promise.all([
      Distribution.find(filter)
        .populate(
          "categoryId",
          "name allocationPercentage"
        )
        .sort({
          distributionDate: -1,
          createdAt: -1,
        })
        .skip(skip)
        .limit(perPage)
        .lean(),

      Distribution.countDocuments(filter),
    ]);

    const totalPages = Math.max(
      Math.ceil(totalRecords / perPage),
      1
    );

    console.log("FILTER RESULT:", {
      totalRecords,
      returnedRecords: distributions.length,
      totalPages,
    });
    console.log("==============================================");

    return res.status(200).json({
      success: true,

      pagination: {
        currentPage,
        perPage,
        totalRecords,
        totalPages,
        hasNextPage: currentPage < totalPages,
        hasPreviousPage: currentPage > 1,
      },

      filters: {
        search,
        categoryId: rawCategoryId || null,
        category: categoryName || null,
        startDate: startDate || null,
        endDate: endDate || null,
        minAmount: hasMinAmount ? Number(minAmount) : null,
        maxAmount: hasMaxAmount ? Number(maxAmount) : null,
      },

      count: distributions.length,

      data: distributions,
    });
  } catch (error) {
    console.error("==============================================");
    console.error("GET DISTRIBUTIONS ERROR:", error);
    console.error("==============================================");

    return res.status(500).json({
      success: false,
      message: "Failed to fetch distributions",
      error: error.message,
    });
  }
};

// GET DISTRIBUTION BY ID
// ======================================================
const getDistributionById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid distribution ID",
      });
    }

    const distribution = await Distribution.findById(id)
      .populate("categoryId", "name allocationPercentage");

    if (!distribution) {
      return res.status(404).json({
        success: false,
        message: "Distribution not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: distribution,
    });
  } catch (error) {
    console.error("Get distribution by ID error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch distribution",
      error: error.message,
    });
  }
};

// ======================================================
// EXPORT
// ======================================================
module.exports = {
  createDistribution,
  getDistributions,
  getDistributionById,
};