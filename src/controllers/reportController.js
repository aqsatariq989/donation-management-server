const Donation = require("../models/donation");
const Distribution = require("../models/distribution");
const Allocation = require("../models/allocation");
const Category = require("../models/category");

// ==================================================
// GET MONTHLY REPORT
// GET /api/reports/monthly?month=9&year=2026
// ==================================================

const getMonthlyReport = async (req, res) => {
  try {
    const currentDate = new Date();

    const month = Number(
      req.query.month || currentDate.getMonth() + 1
    );

    const year = Number(
      req.query.year || currentDate.getFullYear()
    );

    // ==================================================
    // VALIDATE MONTH & YEAR
    // ==================================================

    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return res.status(400).json({
        success: false,
        message: "Month must be between 1 and 12",
      });
    }

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return res.status(400).json({
        success: false,
        message: "Invalid year",
      });
    }

    // ==================================================
    // MONTH DATE RANGE
    // ==================================================

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);

    // ==================================================
    // 1. MONTHLY RECEIVED DONATIONS
    // ==================================================

    const donationTotals = await Donation.aggregate([
      {
        $match: {
          status: "Received",
          donationDate: {
            $gte: startDate,
            $lt: endDate,
          },
        },
      },
      {
        $group: {
          _id: null,
          totalAmount: {
            $sum: "$amount",
          },
          count: {
            $sum: 1,
          },
        },
      },
    ]);

    const totalDonations =
      donationTotals[0]?.totalAmount || 0;

    const donationCount =
      donationTotals[0]?.count || 0;

    // ==================================================
    // 2. MONTHLY DISTRIBUTIONS
    // ==================================================

    const distributionTotals = await Distribution.aggregate([
      {
        $match: {
          distributionDate: {
            $gte: startDate,
            $lt: endDate,
          },
        },
      },
      {
        $group: {
          _id: null,
          totalAmount: {
            $sum: "$amount",
          },
          count: {
            $sum: 1,
          },
        },
      },
    ]);

    const totalDistributed =
      distributionTotals[0]?.totalAmount || 0;

    const distributionCount =
      distributionTotals[0]?.count || 0;

    // ==================================================
    // 3. MONTHLY NET REMAINING
    // ==================================================

    const monthlyRemaining =
      Number(totalDonations.toString()) -
      Number(totalDistributed.toString());

    // ==================================================
    // 4. MONTHLY CATEGORY ALLOCATIONS
    // ==================================================

    const monthlyAllocations = await Allocation.aggregate([
      {
        $lookup: {
          from: "donations",
          localField: "donationId",
          foreignField: "_id",
          as: "donation",
        },
      },
      {
        $unwind: "$donation",
      },
      {
        $match: {
          "donation.status": "Received",
          "donation.donationDate": {
            $gte: startDate,
            $lt: endDate,
          },
        },
      },
      {
        $group: {
          _id: "$categoryId",
          totalAllocated: {
            $sum: "$allocatedAmount",
          },
        },
      },
    ]);

    // ==================================================
    // 5. MONTHLY CATEGORY DISTRIBUTIONS
    // ==================================================

    const monthlyDistributions =
      await Distribution.aggregate([
        {
          $match: {
            distributionDate: {
              $gte: startDate,
              $lt: endDate,
            },
          },
        },
        {
          $group: {
            _id: "$categoryId",
            totalDistributed: {
              $sum: "$amount",
            },
          },
        },
      ]);

    // ==================================================
    // 6. ALL-TIME CATEGORY ALLOCATIONS
    // Used for actual current category balance
    // ==================================================

    const allTimeAllocations = await Allocation.aggregate([
      {
        $lookup: {
          from: "donations",
          localField: "donationId",
          foreignField: "_id",
          as: "donation",
        },
      },
      {
        $unwind: "$donation",
      },
      {
        $match: {
          "donation.status": "Received",
        },
      },
      {
        $group: {
          _id: "$categoryId",
          totalAllocated: {
            $sum: "$allocatedAmount",
          },
        },
      },
    ]);

    // ==================================================
    // 7. ALL-TIME CATEGORY DISTRIBUTIONS
    // ==================================================

    const allTimeDistributions =
      await Distribution.aggregate([
        {
          $group: {
            _id: "$categoryId",
            totalDistributed: {
              $sum: "$amount",
            },
          },
        },
      ]);

    // ==================================================
    // 8. ACTIVE CATEGORIES
    // ==================================================

    const categories = await Category.find({
      isActive: true,
    }).sort({
      sortOrder: 1,
      createdAt: 1,
    });

    // ==================================================
    // 9. CATEGORY BREAKDOWN
    // ==================================================

    const categoryBreakdown = categories.map((category) => {
      // Monthly allocation
      const monthlyAllocation = monthlyAllocations.find(
        (item) =>
          item._id.toString() === category._id.toString()
      );

      // Monthly distribution
      const monthlyDistribution = monthlyDistributions.find(
        (item) =>
          item._id.toString() === category._id.toString()
      );

      // All-time allocation
      const allTimeAllocation = allTimeAllocations.find(
        (item) =>
          item._id.toString() === category._id.toString()
      );

      // All-time distribution
      const allTimeDistribution = allTimeDistributions.find(
        (item) =>
          item._id.toString() === category._id.toString()
      );

      const monthlyAllocatedAmount =
        monthlyAllocation
          ? Number(
              monthlyAllocation.totalAllocated.toString()
            )
          : 0;

      const monthlyDistributedAmount =
        monthlyDistribution
          ? Number(
              monthlyDistribution.totalDistributed.toString()
            )
          : 0;

      const allTimeAllocatedAmount =
        allTimeAllocation
          ? Number(
              allTimeAllocation.totalAllocated.toString()
            )
          : 0;

      const allTimeDistributedAmount =
        allTimeDistribution
          ? Number(
              allTimeDistribution.totalDistributed.toString()
            )
          : 0;

      // Monthly remaining
      const monthlyRemaining =
        monthlyAllocatedAmount -
        monthlyDistributedAmount;

      // Actual current category balance
      const currentBalance =
        Number(category.openingBalance || 0) +
        allTimeAllocatedAmount -
        allTimeDistributedAmount;

      return {
        categoryId: category._id,

        categoryName: category.name,

        allocationPercentage: Number(
          category.allocationPercentage || 0
        ).toFixed(6),

        openingBalance: Number(
          category.openingBalance || 0
        ).toFixed(2),

        monthlyAllocatedAmount:
          monthlyAllocatedAmount.toFixed(2),

        monthlyDistributedAmount:
          monthlyDistributedAmount.toFixed(2),

        monthlyRemaining:
          monthlyRemaining.toFixed(2),

        totalAllocatedAmount:
          allTimeAllocatedAmount.toFixed(2),

        totalDistributedAmount:
          allTimeDistributedAmount.toFixed(2),

        currentBalance:
          currentBalance.toFixed(2),
      };
    });

    // ==================================================
    // 10. DONATION DETAILS
    // ==================================================

    const donations = await Donation.find({
      status: "Received",
      donationDate: {
        $gte: startDate,
        $lt: endDate,
      },
    })
      .populate(
        "donorId",
        "name phone email totalDonated donationCount"
      )
      .sort({
        donationDate: -1,
        createdAt: -1,
      });

    // ==================================================
    // 11. DISTRIBUTION DETAILS
    // ==================================================

    const distributions = await Distribution.find({
      distributionDate: {
        $gte: startDate,
        $lt: endDate,
      },
    })
      .populate("categoryId", "name")
      .sort({
        distributionDate: -1,
        createdAt: -1,
      });

    // ==================================================
    // 12. CURRENT TOTAL CATEGORY BALANCE
    // ==================================================

    const totalCurrentCategoryBalance =
      categoryBreakdown.reduce(
        (total, category) =>
          total + Number(category.currentBalance),
        0
      );

    // ==================================================
    // 13. RESPONSE
    // ==================================================

    return res.status(200).json({
      success: true,

      data: {
        reportPeriod: {
          month,
          year,
          startDate,
          endDate,
        },

        summary: {
          totalDonations:
            Number(totalDonations.toString()).toFixed(2),

          donationCount,

          totalDistributed:
            Number(totalDistributed.toString()).toFixed(2),

          distributionCount,

          monthlyRemaining:
            monthlyRemaining.toFixed(2),

          currentCategoryBalance:
            totalCurrentCategoryBalance.toFixed(2),
        },

        categoryBreakdown,

        donations,

        distributions,
      },
    });
  } catch (error) {
    console.error("Get monthly report error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to generate monthly report",
      error: error.message,
    });
  }
};

module.exports = {
  getMonthlyReport,
};