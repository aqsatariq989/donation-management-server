const PDFDocument = require("pdfkit");

const Donation = require("../models/donation");
const Distribution = require("../models/distribution");
const Allocation = require("../models/allocation");
const Category = require("../models/category");

// ==================================================
// EXPORT MONTHLY REPORT TO PDF
// GET /api/reports/monthly/pdf?month=9&year=2026
// ==================================================

const exportMonthlyReportPdf = async (req, res) => {
  try {
    const currentDate = new Date();

    const month = Number(
      req.query.month || currentDate.getMonth() + 1
    );

    const year = Number(
      req.query.year || currentDate.getFullYear()
    );

    // ==================================================
    // VALIDATION
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
    // 9. DONATIONS
    // ==================================================

    const donations = await Donation.find({
      status: "Received",
      donationDate: {
        $gte: startDate,
        $lt: endDate,
      },
    }).sort({
      donationDate: -1,
      createdAt: -1,
    });

    // ==================================================
    // 10. DISTRIBUTIONS
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

          const openingBalance =
            Number(
              category.openingBalance || 0
            );

          return (
            total +
            openingBalance +
            allocatedAmount -
            distributedAmount
          );
        },
        0
      );

    // ==================================================
    // CREATE PDF DOCUMENT
    // ==================================================

    const doc = new PDFDocument({
      size: "A4",
      margin: 40,
      bufferPages: true,
    });

    const fileName =
      `Donation_Monthly_Report_${year}_${String(
        month
      ).padStart(2, "0")}.pdf`;

    res.setHeader(
      "Content-Type",
      "application/pdf"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileName}"`
    );

    doc.pipe(res);

    // ==================================================
    // HELPER FUNCTIONS
    // ==================================================

    const money = (value) => {
      const number = Number(value || 0);

      return `$${number.toLocaleString(
        "en-US",
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }
      )}`;
    };

    const formatDate = (date) => {
      if (!date) return "";

      return new Date(date)
        .toISOString()
        .split("T")[0];
    };

    const monthName = new Date(
      year,
      month - 1,
      1
    ).toLocaleString("en-US", {
      month: "long",
    });

    const addSectionTitle = (title) => {
      if (doc.y > 720) {
        doc.addPage();
      }

      doc
        .fontSize(14)
        .font("Helvetica-Bold")
        .text(title);

      doc.moveDown(0.5);
    };

    const addTableHeader = (columns) => {
      doc
        .fontSize(8)
        .font("Helvetica-Bold");

      columns.forEach((column) => {
        doc.text(
          column.label,
          column.x,
          doc.y,
          {
            width: column.width,
          }
        );
      });

      doc.moveDown(0.3);

      doc
        .moveTo(40, doc.y)
        .lineTo(555, doc.y)
        .stroke();

      doc.moveDown(0.4);
    };

    // ==================================================
    // HEADER
    // ==================================================

    doc
      .fontSize(20)
      .font("Helvetica-Bold")
      .text(
        "DONATION MANAGEMENT SYSTEM",
        {
          align: "center",
        }
      );

    doc.moveDown(0.3);

    doc
      .fontSize(15)
      .font("Helvetica-Bold")
      .text(
        "Monthly Donation Report",
        {
          align: "center",
        }
      );

    doc.moveDown(0.2);

    doc
      .fontSize(11)
      .font("Helvetica")
      .text(
        `${monthName} ${year}`,
        {
          align: "center",
        }
      );

    doc.moveDown(1);

    doc
      .moveTo(40, doc.y)
      .lineTo(555, doc.y)
      .stroke();

    doc.moveDown(1);

    // ==================================================
    // SUMMARY
    // ==================================================

    addSectionTitle(
      "Report Summary"
    );

    doc
      .fontSize(10)
      .font("Helvetica");

    const summaryRows = [
      [
        "Total Donations",
        money(totalDonations),
      ],
      [
        "Donation Count",
        String(donationCount),
      ],
      [
        "Total Distributed",
        money(totalDistributed),
      ],
      [
        "Distribution Count",
        String(distributionCount),
      ],
      [
        "Monthly Remaining",
        money(monthlyRemaining),
      ],
      [
        "Current Category Balance",
        money(
          totalCurrentCategoryBalance
        ),
      ],
    ];

    summaryRows.forEach(
      ([label, value]) => {
        const currentY = doc.y;

        doc
          .font("Helvetica-Bold")
          .text(
            label,
            50,
            currentY,
            {
              width: 240,
            }
          );

        doc
          .font("Helvetica")
          .text(
            value,
            310,
            currentY,
            {
              width: 180,
            }
          );

        doc.moveDown(0.6);
      }
    );

    doc.moveDown(0.8);

    // ==================================================
    // CATEGORY BREAKDOWN
    // ==================================================

    addSectionTitle(
      "Category Breakdown"
    );

    const categoryColumns = [
      {
        label: "Category",
        x: 40,
        width: 135,
      },
      {
        label: "Alloc. %",
        x: 175,
        width: 55,
      },
      {
        label: "Monthly Alloc.",
        x: 230,
        width: 75,
      },
      {
        label: "Monthly Dist.",
        x: 305,
        width: 75,
      },
      {
        label: "Monthly Rem.",
        x: 380,
        width: 70,
      },
      {
        label: "Current Bal.",
        x: 450,
        width: 85,
      },
    ];

    addTableHeader(
      categoryColumns
    );

    categories.forEach(
      (category) => {
        if (doc.y > 720) {
          doc.addPage();

          addSectionTitle(
            "Category Breakdown (Continued)"
          );

          addTableHeader(
            categoryColumns
          );
        }

        const monthlyAllocation =
          monthlyAllocations.find(
            (item) =>
              item._id.toString() ===
              category._id.toString()
          );

        const monthlyDistribution =
          monthlyDistributions.find(
            (item) =>
              item._id.toString() ===
              category._id.toString()
          );

        const allTimeAllocation =
          allTimeAllocations.find(
            (item) =>
              item._id.toString() ===
              category._id.toString()
          );

        const allTimeDistribution =
          allTimeDistributions.find(
            (item) =>
              item._id.toString() ===
              category._id.toString()
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

        const monthlyCategoryRemaining =
          monthlyAllocatedAmount -
          monthlyDistributedAmount;

        const currentBalance =
          Number(
            category.openingBalance || 0
          ) +
          totalAllocatedAmount -
          totalDistributedAmount;

        const rowY = doc.y;

        doc
          .fontSize(7)
          .font("Helvetica")
          .text(
            category.name,
            40,
            rowY,
            {
              width: 130,
            }
          );

        doc.text(
          `${Number(
            category.allocationPercentage || 0
          ).toFixed(4)}%`,
          175,
          rowY,
          {
            width: 55,
          }
        );

        doc.text(
          money(
            monthlyAllocatedAmount
          ),
          230,
          rowY,
          {
            width: 75,
          }
        );

        doc.text(
          money(
            monthlyDistributedAmount
          ),
          305,
          rowY,
          {
            width: 75,
          }
        );

        doc.text(
          money(
            monthlyCategoryRemaining
          ),
          380,
          rowY,
          {
            width: 70,
          }
        );

        doc.text(
          money(currentBalance),
          450,
          rowY,
          {
            width: 85,
          }
        );

        doc.moveDown(0.8);
      }
    );

    // ==================================================
    // CATEGORY FINANCIAL DETAILS
    // ==================================================

    doc.addPage();

    addSectionTitle(
      "Category Financial Details"
    );

    const financialColumns = [
      {
        label: "Category",
        x: 40,
        width: 135,
      },
      {
        label: "Opening",
        x: 175,
        width: 75,
      },
      {
        label: "Total Alloc.",
        x: 250,
        width: 80,
      },
      {
        label: "Total Dist.",
        x: 330,
        width: 80,
      },
      {
        label: "Current Bal.",
        x: 410,
        width: 90,
      },
    ];

    addTableHeader(
      financialColumns
    );

    categories.forEach(
      (category) => {
        if (doc.y > 720) {
          doc.addPage();

          addSectionTitle(
            "Category Financial Details (Continued)"
          );

          addTableHeader(
            financialColumns
          );
        }

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

        const totalAllocated =
          allocation
            ? Number(
                allocation.totalAllocated.toString()
              )
            : 0;

        const totalDistributed =
          distribution
            ? Number(
                distribution.totalDistributed.toString()
              )
            : 0;

        const openingBalance =
          Number(
            category.openingBalance || 0
          );

        const currentBalance =
          openingBalance +
          totalAllocated -
          totalDistributed;

        const rowY = doc.y;

        doc
          .fontSize(7.5)
          .font("Helvetica")
          .text(
            category.name,
            40,
            rowY,
            {
              width: 130,
            }
          );

        doc.text(
          money(openingBalance),
          175,
          rowY,
          {
            width: 75,
          }
        );

        doc.text(
          money(totalAllocated),
          250,
          rowY,
          {
            width: 80,
          }
        );

        doc.text(
          money(totalDistributed),
          330,
          rowY,
          {
            width: 80,
          }
        );

        doc.text(
          money(currentBalance),
          410,
          rowY,
          {
            width: 90,
          }
        );

        doc.moveDown(0.8);
      }
    );

    // ==================================================
    // DONATION DETAILS
    // ==================================================

    doc.addPage();

    addSectionTitle(
      "Donation Details"
    );

    const donationColumns = [
      {
        label: "Date",
        x: 40,
        width: 65,
      },
      {
        label: "Donor",
        x: 110,
        width: 150,
      },
      {
        label: "Amount",
        x: 265,
        width: 80,
      },
      {
        label: "Method",
        x: 350,
        width: 75,
      },
      {
        label: "Reference",
        x: 430,
        width: 120,
      },
    ];

    addTableHeader(
      donationColumns
    );

    if (!donations.length) {
      doc
        .fontSize(9)
        .font("Helvetica")
        .text(
          "No donations recorded for this month."
        );
    }

    donations.forEach(
      (donation) => {
        if (doc.y > 735) {
          doc.addPage();

          addSectionTitle(
            "Donation Details (Continued)"
          );

          addTableHeader(
            donationColumns
          );
        }

        const rowY = doc.y;

        doc
          .fontSize(7.5)
          .font("Helvetica")
          .text(
            formatDate(
              donation.donationDate
            ),
            40,
            rowY,
            {
              width: 65,
            }
          );

        doc.text(
          donation.donorName || "",
          110,
          rowY,
          {
            width: 150,
          }
        );

        doc.text(
          money(
            donation.amount.toString()
          ),
          265,
          rowY,
          {
            width: 80,
          }
        );

        doc.text(
          donation.paymentMethod || "",
          350,
          rowY,
          {
            width: 75,
          }
        );

        doc.text(
          donation.referenceNumber || "",
          430,
          rowY,
          {
            width: 120,
          }
        );

        doc.moveDown(0.8);
      }
    );

    // ==================================================
    // DISTRIBUTION DETAILS
    // ==================================================

    doc.addPage();

    addSectionTitle(
      "Distribution Details"
    );

    const distributionColumns = [
      {
        label: "Date",
        x: 40,
        width: 65,
      },
      {
        label: "Category",
        x: 110,
        width: 135,
      },
      {
        label: "Beneficiary",
        x: 250,
        width: 120,
      },
      {
        label: "Amount",
        x: 375,
        width: 75,
      },
      {
        label: "Method",
        x: 455,
        width: 100,
      },
    ];

    addTableHeader(
      distributionColumns
    );

    if (!distributions.length) {
      doc
        .fontSize(9)
        .font("Helvetica")
        .text(
          "No distributions recorded for this month."
        );
    }

    distributions.forEach(
      (distribution) => {
        if (doc.y > 735) {
          doc.addPage();

          addSectionTitle(
            "Distribution Details (Continued)"
          );

          addTableHeader(
            distributionColumns
          );
        }

        const rowY = doc.y;

        doc
          .fontSize(7.5)
          .font("Helvetica")
          .text(
            formatDate(
              distribution.distributionDate
            ),
            40,
            rowY,
            {
              width: 65,
            }
          );

        doc.text(
          distribution.categoryId?.name ||
            "",
          110,
          rowY,
          {
            width: 135,
          }
        );

        doc.text(
          distribution.beneficiaryName ||
            "",
          250,
          rowY,
          {
            width: 120,
          }
        );

        doc.text(
          money(
            distribution.amount.toString()
          ),
          375,
          rowY,
          {
            width: 75,
          }
        );

        doc.text(
          distribution.paymentMethod ||
            "",
          455,
          rowY,
          {
            width: 100,
          }
        );

        doc.moveDown(0.8);
      }
    );

    // ==================================================
    // FOOTER / PAGE NUMBERS
    // ==================================================

    const pageRange =
      doc.bufferedPageRange();

    for (
      let i = 0;
      i < pageRange.count;
      i++
    ) {
      doc.switchToPage(
        pageRange.start + i
      );

      doc
        .fontSize(7)
        .font("Helvetica")
        .text(
          `Donation Management System | ${monthName} ${year} | Page ${
            i + 1
          } of ${pageRange.count}`,
          40,
          805,
          {
            align: "center",
            width: 515,
          }
        );
    }

    doc.end();
  } catch (error) {
    console.error(
      "Export monthly PDF error:",
      error
    );

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message:
          "Failed to export monthly report to PDF",
        error: error.message,
      });
    }

    res.end();
  }
};

// ==================================================
// EXPORT
// ==================================================

module.exports = {
  exportMonthlyReportPdf,
};