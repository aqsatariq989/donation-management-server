const Donation = require("../models/donation");
const Distribution = require("../models/distribution");
const Allocation = require("../models/allocation");
const Category = require("../models/category");

// GET DASHBOARD SUMMARY
const getDashboardSummary = async (req, res) => {
  try {
    // --------------------------------------------------
    // 1. TOTAL RECEIVED DONATIONS
    // --------------------------------------------------
    const donationTotals = await Donation.aggregate([
      {
        $match: {
          status: "Received",
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

    const totalDonations = donationTotals[0]?.totalAmount || 0;
    const totalDonationCount = donationTotals[0]?.count || 0;

    // --------------------------------------------------
    // 2. TOTAL DISTRIBUTED
    // --------------------------------------------------
    const distributionTotals = await Distribution.aggregate([
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

    const totalDistributed = distributionTotals[0]?.totalAmount || 0;
    const totalDistributionCount = distributionTotals[0]?.count || 0;

    // --------------------------------------------------
    // 3. TOTAL REMAINING
    // --------------------------------------------------
    const totalRemaining =
      Number(totalDonations.toString()) -
      Number(totalDistributed.toString());

    // --------------------------------------------------
    // 4. CURRENT MONTH DATE RANGE
    // --------------------------------------------------
    const now = new Date();

    const currentMonthStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    );

    const nextMonthStart = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      1
    );

    // --------------------------------------------------
    // 5. CURRENT MONTH DONATIONS
    // --------------------------------------------------
    const currentMonthDonationTotals = await Donation.aggregate([
      {
        $match: {
          status: "Received",
          donationDate: {
            $gte: currentMonthStart,
            $lt: nextMonthStart,
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

    const currentMonthDonations =
      currentMonthDonationTotals[0]?.totalAmount || 0;

    const currentMonthDonationCount =
      currentMonthDonationTotals[0]?.count || 0;

    // --------------------------------------------------
    // 6. CURRENT MONTH DISTRIBUTION
    // --------------------------------------------------
    const currentMonthDistributionTotals =
      await Distribution.aggregate([
        {
          $match: {
            distributionDate: {
              $gte: currentMonthStart,
              $lt: nextMonthStart,
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

    const currentMonthDistribution =
      currentMonthDistributionTotals[0]?.totalAmount || 0;

    const currentMonthDistributionCount =
      currentMonthDistributionTotals[0]?.count || 0;

    // --------------------------------------------------
    // 7. CATEGORY-WISE ALLOCATIONS
    // --------------------------------------------------
    const categoryAllocations = await Allocation.aggregate([
      {
        $group: {
          _id: "$categoryId",
          totalAllocated: {
            $sum: "$allocatedAmount",
          },
        },
      },
    ]);

    // --------------------------------------------------
    // 8. CATEGORY-WISE DISTRIBUTIONS
    // --------------------------------------------------
    const categoryDistributions = await Distribution.aggregate([
      {
        $group: {
          _id: "$categoryId",
          totalDistributed: {
            $sum: "$amount",
          },
        },
      },
    ]);

    // --------------------------------------------------
    // 9. CATEGORY BALANCES
    // --------------------------------------------------
    const categories = await Category.find({
      isActive: true,
    }).sort({
      sortOrder: 1,
      createdAt: 1,
    });

    const categoryBalances = categories.map((category) => {
      const allocation = categoryAllocations.find(
        (item) =>
          item._id.toString() === category._id.toString()
      );

      const distribution = categoryDistributions.find(
        (item) =>
          item._id.toString() === category._id.toString()
      );

      const allocatedAmount = allocation
        ? Number(allocation.totalAllocated.toString())
        : 0;

      const distributedAmount = distribution
        ? Number(distribution.totalDistributed.toString())
        : 0;

      const openingBalance = Number(
        category.openingBalance?.toString() || 0
      );

      const remainingBalance =
        openingBalance +
        allocatedAmount -
        distributedAmount;

      return {
        categoryId: category._id,
        categoryName: category.name,
        allocationPercentage: category.allocationPercentage,
        openingBalance: openingBalance.toFixed(2),
        allocatedAmount: allocatedAmount.toFixed(2),
        distributedAmount: distributedAmount.toFixed(2),
        remainingBalance: remainingBalance.toFixed(2),
      };
    });

    // --------------------------------------------------
    // 10. RECENT DONATIONS
    // --------------------------------------------------
    const recentDonations = await Donation.find({
      status: "Received",
    })
      .populate(
        "donorId",
        "name phone email totalDonated donationCount"
      )
      .sort({
        donationDate: -1,
        createdAt: -1,
      })
      .limit(10);

    // --------------------------------------------------
    // 11. RECENT DISTRIBUTIONS
    // --------------------------------------------------
    const recentDistributions = await Distribution.find()
      .populate("categoryId", "name")
      .sort({
        distributionDate: -1,
        createdAt: -1,
      })
      .limit(10);

    // --------------------------------------------------
    // 12. RESPONSE
    // --------------------------------------------------
    return res.status(200).json({
      success: true,

      data: {
        summary: {
          totalDonations:
            Number(totalDonations.toString()).toFixed(2),

          totalDonationCount,

          totalDistributed:
            Number(totalDistributed.toString()).toFixed(2),

          totalDistributionCount,

          totalRemaining:
            totalRemaining.toFixed(2),

          currentMonthDonations:
            Number(currentMonthDonations.toString()).toFixed(2),

          currentMonthDonationCount,

          currentMonthDistribution:
            Number(currentMonthDistribution.toString()).toFixed(2),

          currentMonthDistributionCount,
        },

        categoryBalances,

        recentDonations,

        recentDistributions,
      },
    });
  } catch (error) {
    console.error("Get dashboard summary error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard summary",
      error: error.message,
    });
  }
};

module.exports = {
  getDashboardSummary,
};