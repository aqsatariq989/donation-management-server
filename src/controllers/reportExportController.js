const ExcelJS = require("exceljs");
const Donation = require("../models/donation");
const Distribution = require("../models/distribution");
const Allocation = require("../models/allocation");
const Category = require("../models/category");

// ==================================================
// EXPORT MONTHLY REPORT TO EXCEL
// GET /api/reports/monthly/excel?month=9&year=2026
// ==================================================

const exportMonthlyReportExcel = async (req, res) => {
  try {
    const currentDate = new Date();

    const month = Number(
      req.query.month || currentDate.getMonth() + 1
    );

    const year = Number(
      req.query.year || currentDate.getFullYear()
    );

    // ==================================================
    // VALIDATE MONTH
    // ==================================================

    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return res.status(400).json({
        success: false,
        message: "Month must be between 1 and 12",
      });
    }

    // ==================================================
    // VALIDATE YEAR
    // ==================================================

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
    // 1. MONTHLY DONATION TOTALS
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
    // 2. MONTHLY DISTRIBUTION TOTALS
    // ==================================================

    const distributionTotals =
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
    // 3. MONTHLY REMAINING
    // ==================================================

    const monthlyRemaining =
      Number(totalDonations.toString()) -
      Number(totalDistributed.toString());

    // ==================================================
    // 4. MONTHLY CATEGORY ALLOCATIONS
    // ==================================================

    const monthlyAllocations =
      await Allocation.aggregate([
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
    // ==================================================

    const allTimeAllocations =
      await Allocation.aggregate([
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
    // 9. DONATION DETAILS
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
        "name phone email"
      )
      .sort({
        donationDate: -1,
        createdAt: -1,
      });

    // ==================================================
    // 10. DISTRIBUTION DETAILS
    // ==================================================

    const distributions =
      await Distribution.find({
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
    // 11. TOTAL CURRENT CATEGORY BALANCE
    // ==================================================

    const totalCurrentCategoryBalance =
      categories.reduce(
        (total, category) => {
          const allocation =
            allTimeAllocations.find(
              (item) =>
                item._id.toString() ===
                category._id.toString()
            );

          const distribution =
            allTimeDistributions.find(
              (item) =>
                item._id.toString() ===
                category._id.toString()
            );

          const allocatedAmount =
            allocation
              ? Number(
                  allocation.totalAllocated.toString()
                )
              : 0;

          const distributedAmount =
            distribution
              ? Number(
                  distribution.totalDistributed.toString()
                )
              : 0;

          return (
            total +
            Number(category.openingBalance || 0) +
            allocatedAmount -
            distributedAmount
          );
        },
        0
      );

    // ==================================================
    // 12. CREATE EXCEL WORKBOOK
    // ==================================================

    const workbook =
      new ExcelJS.Workbook();

    workbook.creator =
      "Donation Management System";

    workbook.created =
      new Date();

    // ==================================================
    // 13. SUMMARY SHEET
    // ==================================================

    const summarySheet =
      workbook.addWorksheet("Summary");

    summarySheet.mergeCells("A1:D1");

    summarySheet.getCell("A1").value =
      "DONATION MANAGEMENT SYSTEM";

    summarySheet.getCell("A1").font = {
      bold: true,
      size: 18,
    };

    summarySheet.getCell("A1").alignment = {
      horizontal: "center",
    };

    summarySheet.mergeCells("A2:D2");

    summarySheet.getCell("A2").value =
      `Monthly Report - ${month}/${year}`;

    summarySheet.getCell("A2").font = {
      bold: true,
      size: 14,
    };

    summarySheet.getCell("A2").alignment = {
      horizontal: "center",
    };

    summarySheet.addRow([]);

    summarySheet.addRow([
      "Metric",
      "Value",
    ]);

    summarySheet.getRow(4).font = {
      bold: true,
    };

    summarySheet.addRow([
      "Total Donations",
      Number(
        totalDonations.toString()
      ),
    ]);

    summarySheet.addRow([
      "Donation Count",
      donationCount,
    ]);

    summarySheet.addRow([
      "Total Distributed",
      Number(
        totalDistributed.toString()
      ),
    ]);

    summarySheet.addRow([
      "Distribution Count",
      distributionCount,
    ]);

    summarySheet.addRow([
      "Monthly Remaining",
      monthlyRemaining,
    ]);

    summarySheet.addRow([
      "Current Category Balance",
      totalCurrentCategoryBalance,
    ]);

    summarySheet.getColumn(1).width =
      30;

    summarySheet.getColumn(2).width =
      22;

    [5, 7, 9, 10].forEach(
      (rowNumber) => {
        summarySheet.getCell(
          rowNumber,
          2
        ).numFmt = "$#,##0.00";
      }
    );

    // ==================================================
    // 14. CATEGORY BREAKDOWN SHEET
    // ==================================================

    const categorySheet =
      workbook.addWorksheet(
        "Category Breakdown"
      );

    categorySheet.columns = [
      {
        header: "Category",
        key: "category",
        width: 35,
      },
      {
        header: "Allocation %",
        key: "percentage",
        width: 18,
      },
      {
        header: "Allocated Amount",
        key: "allocated",
        width: 20,
      },
      {
        header: "Distributed Amount",
        key: "distributed",
        width: 22,
      },
      {
        header: "Monthly Remaining",
        key: "monthlyRemaining",
        width: 20,
      },
      {
        header: "Opening Balance",
        key: "openingBalance",
        width: 20,
      },
      {
        header: "Total Allocated",
        key: "totalAllocated",
        width: 20,
      },
      {
        header: "Total Distributed",
        key: "totalDistributed",
        width: 22,
      },
      {
        header: "Current Balance",
        key: "currentBalance",
        width: 20,
      },
    ];

    categories.forEach(
      (category) => {
        // ------------------------------
        // Monthly Allocation
        // ------------------------------

        const allocation =
          monthlyAllocations.find(
            (item) =>
              item._id.toString() ===
              category._id.toString()
          );

        // ------------------------------
        // Monthly Distribution
        // ------------------------------

        const distribution =
          monthlyDistributions.find(
            (item) =>
              item._id.toString() ===
              category._id.toString()
          );

        // ------------------------------
        // All-Time Allocation
        // ------------------------------

        const allTimeAllocation =
          allTimeAllocations.find(
            (item) =>
              item._id.toString() ===
              category._id.toString()
          );

        // ------------------------------
        // All-Time Distribution
        // ------------------------------

        const allTimeDistribution =
          allTimeDistributions.find(
            (item) =>
              item._id.toString() ===
              category._id.toString()
          );

        // ------------------------------
        // Monthly Amounts
        // ------------------------------

        const monthlyAllocatedAmount =
          allocation
            ? Number(
                allocation.totalAllocated.toString()
              )
            : 0;

        const monthlyDistributedAmount =
          distribution
            ? Number(
                distribution.totalDistributed.toString()
              )
            : 0;

        // ------------------------------
        // All-Time Amounts
        // ------------------------------

        const totalAllocatedAmount =
          allTimeAllocation
            ? Number(
                allTimeAllocation.totalAllocated.toString()
              )
            : 0;

        const totalDistributedAmount =
          allTimeDistribution
            ? Number(
                allTimeDistribution.totalDistributed.toString()
              )
            : 0;

        // ------------------------------
        // Monthly Remaining
        // ------------------------------

        const categoryMonthlyRemaining =
          monthlyAllocatedAmount -
          monthlyDistributedAmount;

        // ------------------------------
        // Current Balance
        // ------------------------------

        const currentBalance =
          Number(
            category.openingBalance || 0
          ) +
          totalAllocatedAmount -
          totalDistributedAmount;

        // ------------------------------
        // Add Excel Row
        // ------------------------------

        categorySheet.addRow({
          category:
            category.name,

          percentage:
            Number(
              category.allocationPercentage || 0
            ),

          allocated:
            monthlyAllocatedAmount,

          distributed:
            monthlyDistributedAmount,

          monthlyRemaining:
            categoryMonthlyRemaining,

          openingBalance:
            Number(
              category.openingBalance || 0
            ),

          totalAllocated:
            totalAllocatedAmount,

          totalDistributed:
            totalDistributedAmount,

          currentBalance:
            currentBalance,
        });
      }
    );

    // Header formatting
    categorySheet.getRow(1).font = {
      bold: true,
    };

    // Percentage format
    categorySheet.getColumn(2).numFmt =
      '0.000000"%"';

    // Currency formatting
    for (
      let columnNumber = 3;
      columnNumber <= 9;
      columnNumber++
    ) {
      categorySheet.getColumn(
        columnNumber
      ).numFmt =
        "$#,##0.00";
    }

    // ==================================================
    // 15. DONATIONS SHEET
    // ==================================================

    const donationSheet =
      workbook.addWorksheet(
        "Donations"
      );

    donationSheet.columns = [
      {
        header: "Donation Date",
        key: "date",
        width: 18,
      },
      {
        header: "Donor Name",
        key: "donorName",
        width: 28,
      },
      {
        header: "Phone",
        key: "phone",
        width: 18,
      },
      {
        header: "Email",
        key: "email",
        width: 30,
      },
      {
        header: "Amount",
        key: "amount",
        width: 18,
      },
      {
        header: "Payment Method",
        key: "paymentMethod",
        width: 18,
      },
      {
        header: "Reference Number",
        key: "reference",
        width: 24,
      },
      {
        header: "Status",
        key: "status",
        width: 15,
      },
      {
        header: "Notes",
        key: "notes",
        width: 35,
      },
    ];

    donations.forEach(
      (donation) => {
        donationSheet.addRow({
          date:
            donation.donationDate,

          donorName:
            donation.donorName,

          phone:
            donation.donorPhone ||
            donation.donorId?.phone ||
            "",

          email:
            donation.donorEmail ||
            donation.donorId?.email ||
            "",

          amount:
            Number(
              donation.amount.toString()
            ),

          paymentMethod:
            donation.paymentMethod,

          reference:
            donation.referenceNumber ||
            "",

          status:
            donation.status,

          notes:
            donation.notes ||
            "",
        });
      }
    );

    donationSheet.getRow(1).font = {
      bold: true,
    };

    donationSheet.getColumn(1).numFmt =
      "yyyy-mm-dd";

    donationSheet.getColumn(5).numFmt =
      "$#,##0.00";

    // ==================================================
    // 16. DISTRIBUTIONS SHEET
    // ==================================================

    const distributionSheet =
      workbook.addWorksheet(
        "Distributions"
      );

    distributionSheet.columns = [
      {
        header: "Distribution Date",
        key: "date",
        width: 20,
      },
      {
        header: "Category",
        key: "category",
        width: 35,
      },
      {
        header: "Beneficiary Name",
        key: "beneficiary",
        width: 28,
      },
      {
        header: "Amount",
        key: "amount",
        width: 18,
      },
      {
        header: "Purpose",
        key: "purpose",
        width: 35,
      },
      {
        header: "Payment Method",
        key: "paymentMethod",
        width: 18,
      },
      {
        header: "Reference Number",
        key: "reference",
        width: 24,
      },
      {
        header: "Notes",
        key: "notes",
        width: 35,
      },
    ];

    distributions.forEach(
      (distribution) => {
        distributionSheet.addRow({
          date:
            distribution.distributionDate,

          category:
            distribution.categoryId?.name ||
            "",

          beneficiary:
            distribution.beneficiaryName,

          amount:
            Number(
              distribution.amount.toString()
            ),

          purpose:
            distribution.purpose,

          paymentMethod:
            distribution.paymentMethod,

          reference:
            distribution.referenceNumber ||
            "",

          notes:
            distribution.notes ||
            "",
        });
      }
    );

    distributionSheet.getRow(1).font = {
      bold: true,
    };

    distributionSheet.getColumn(1).numFmt =
      "yyyy-mm-dd";

    distributionSheet.getColumn(4).numFmt =
      "$#,##0.00";

    // ==================================================
    // 17. FREEZE HEADER ROWS
    // ==================================================

    categorySheet.views = [
      {
        state: "frozen",
        ySplit: 1,
      },
    ];

    donationSheet.views = [
      {
        state: "frozen",
        ySplit: 1,
      },
    ];

    distributionSheet.views = [
      {
        state: "frozen",
        ySplit: 1,
      },
    ];

    // ==================================================
    // 18. AUTO FILTERS
    // ==================================================

    categorySheet.autoFilter = {
      from: "A1",
      to: "I1",
    };

    donationSheet.autoFilter = {
      from: "A1",
      to: "I1",
    };

    distributionSheet.autoFilter = {
      from: "A1",
      to: "H1",
    };

    // ==================================================
    // 19. RESPONSE
    // ==================================================

    const fileName =
      `Donation_Monthly_Report_${year}_${String(
        month
      ).padStart(2, "0")}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileName}"`
    );

    await workbook.xlsx.write(res);

    res.end();
  } catch (error) {
    console.error(
      "Export monthly Excel error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to export monthly report to Excel",
      error: error.message,
    });
  }
};

// ==================================================
// EXPORT
// ==================================================

module.exports = {
  exportMonthlyReportExcel,
};