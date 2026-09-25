const PDFDocument = require("pdfkit");
const mongoose = require("mongoose");

const Donation = require("../models/donation");
const Allocation = require("../models/allocation");
const auditLogService = require("../services/auditLogService");

// ==========================================================
// GENERATE DONATION RECEIPT
// GET /api/donations/:id/receipt
// ==========================================================

const generateDonationReceipt = async (req, res) => {
  try {
    const { id } = req.params;

    // ========================================================
    // VALIDATE ID
    // ========================================================

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid donation ID",
      });
    }

    // ========================================================
    // GET DONATION
    // ========================================================

    const donation = await Donation.findById(id).populate(
      "donorId",
      "name phone email"
    );

    if (!donation) {
      return res.status(404).json({
        success: false,
        message: "Donation not found",
      });
    }

    // ========================================================
    // ONLY RECEIVED DONATIONS
    // ========================================================

    if (donation.status !== "Received") {
      return res.status(400).json({
        success: false,
        message:
          "Receipt can only be generated for received donations",
      });
    }

    // ========================================================
    // GET HISTORICAL ALLOCATIONS
    // ========================================================

    const allocations = await Allocation.find({
      donationId: donation._id,
    })
      .populate("categoryId", "name")
      .sort({ createdAt: 1 });

    // ========================================================
    // HELPERS
    // ========================================================

    const toNumber = (value) => {
      if (value === null || value === undefined) {
        return 0;
      }

      if (
        typeof value === "object" &&
        value.$numberDecimal !== undefined
      ) {
        return Number(value.$numberDecimal) || 0;
      }

      if (
        value &&
        typeof value.toString === "function"
      ) {
        return Number(value.toString()) || 0;
      }

      return Number(value) || 0;
    };

    const money = (value) => {
      return `$${toNumber(value).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    };

    const formatDate = (value) => {
      if (!value) {
        return "N/A";
      }

      const date = new Date(value);

      if (Number.isNaN(date.getTime())) {
        return "N/A";
      }

      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit",
      });
    };

    const safeText = (
      value,
      fallback = "N/A"
    ) => {
      if (
        value === null ||
        value === undefined ||
        String(value).trim() === ""
      ) {
        return fallback;
      }

      return String(value);
    };

    // ========================================================
    // DONOR DATA
    // ========================================================

    const donorName =
      donation.donorName ||
      donation.donorId?.name ||
      "N/A";

    const donorPhone =
      donation.donorPhone ||
      donation.donorId?.phone ||
      "N/A";

    const donorEmail =
      donation.donorEmail ||
      donation.donorId?.email ||
      "N/A";

    // ========================================================
    // RECEIPT DATA
    // ========================================================

    const receiptNumber =
      donation.referenceNumber ||
      `DON-${donation._id
        .toString()
        .slice(-8)
        .toUpperCase()}`;

    const fileName =
      `Donation_Receipt_${receiptNumber}.pdf`;

    // ========================================================
    // COLORS
    // ========================================================

    const NAVY = "#00142b";
    const GOLD = "#e6a726";
    const LIGHT = "#f5f7fa";
    const BORDER = "#d7dce2";
    const TEXT = "#222222";
    const GRAY = "#666666";
    const WHITE = "#ffffff";

    // ========================================================
    // CREATE PDF
    // ========================================================

    const doc = new PDFDocument({
      size: "A4",
      margin: 45,
      autoFirstPage: true,
      bufferPages: false,

      info: {
        Title: `Donation Receipt - ${receiptNumber}`,
        Author: "Donation Management System",
        Subject: "Donation Receipt",
      },
    });

    res.setHeader(
      "Content-Type",
      "application/pdf"
    );

    res.setHeader(
      "Content-Disposition",
      `inline; filename="${fileName}"`
    );

    doc.pipe(res);

    // ========================================================
    // PAGE DIMENSIONS
    // ========================================================

    const PAGE_WIDTH = doc.page.width;
    const PAGE_HEIGHT = doc.page.height;

    const LEFT = doc.page.margins.left;
    const RIGHT =
      PAGE_WIDTH - doc.page.margins.right;

    const WIDTH = RIGHT - LEFT;

    // Content must stay above footer
    const CONTENT_BOTTOM =
      PAGE_HEIGHT - 95;

    // ========================================================
    // HEADER
    // ========================================================

    const drawHeader = () => {
      doc
        .fillColor(NAVY)
        .font("Helvetica-Bold")
        .fontSize(22)
        .text(
          "DONATION RECEIPT",
          LEFT,
          38,
          {
            width: WIDTH,
            align: "center",
            lineBreak: false,
          }
        );

      doc
        .fillColor(GRAY)
        .font("Helvetica")
        .fontSize(8)
        .text(
          "DONATION MANAGEMENT SYSTEM",
          LEFT,
          67,
          {
            width: WIDTH,
            align: "center",
            lineBreak: false,
          }
        );

      doc
        .moveTo(
          LEFT,
          88
        )
        .lineTo(
          RIGHT,
          88
        )
        .lineWidth(1)
        .strokeColor(GOLD)
        .stroke();

      // Content start
      doc.y = 106;
    };

    // ========================================================
    // FOOTER
    // ========================================================

    const drawFooter = () => {
      const footerLineY =
        PAGE_HEIGHT - 63;

      doc
        .moveTo(
          LEFT,
          footerLineY
        )
        .lineTo(
          RIGHT,
          footerLineY
        )
        .lineWidth(0.5)
        .strokeColor(BORDER)
        .stroke();

      doc
        .fillColor(GRAY)
        .font("Helvetica")
        .fontSize(7.5)
        .text(
          "This receipt confirms that the above donation was received.",
          LEFT,
          footerLineY + 10,
          {
            width: WIDTH,
            align: "center",
            lineBreak: false,
          }
        );

      doc
        .fontSize(7)
        .text(
          `Generated on ${formatDate(new Date())}`,
          LEFT,
          footerLineY + 24,
          {
            width: WIDTH,
            align: "center",
            lineBreak: false,
          }
        );
    };

    // ========================================================
    // NEW PAGE
    // ========================================================

    const newPage = () => {
      doc.addPage();

      drawHeader();
    };

    // ========================================================
    // CHECK SPACE
    // ========================================================

    const ensureSpace = (
      requiredHeight
    ) => {
      if (
        doc.y + requiredHeight >
        CONTENT_BOTTOM
      ) {
        newPage();
      }
    };

    // ========================================================
    // SECTION TITLE
    // ========================================================

    const sectionTitle = (
      title
    ) => {
      doc
        .fillColor(NAVY)
        .font("Helvetica-Bold")
        .fontSize(11)
        .text(
          title,
          LEFT,
          doc.y,
          {
            width: WIDTH,
            lineBreak: false,
          }
        );

      doc.y += 18;
    };

    // ========================================================
    // START FIRST PAGE
    // ========================================================

    drawHeader();

    // ========================================================
    // RECEIPT INFORMATION
    // ========================================================

    const receiptInfoY =
      doc.y;

    doc
      .fillColor(GRAY)
      .font("Helvetica-Bold")
      .fontSize(8)
      .text(
        "RECEIPT NUMBER",
        LEFT,
        receiptInfoY,
        {
          width: 100,
          lineBreak: false,
        }
      );

    doc
      .fillColor(TEXT)
      .font("Helvetica")
      .fontSize(9)
      .text(
        receiptNumber,
        LEFT + 105,
        receiptInfoY,
        {
          width: 150,
          lineBreak: false,
        }
      );

    doc
      .fillColor(GRAY)
      .font("Helvetica-Bold")
      .fontSize(8)
      .text(
        "DONATION DATE",
        325,
        receiptInfoY,
        {
          width: 90,
          lineBreak: false,
        }
      );

    doc
      .fillColor(TEXT)
      .font("Helvetica")
      .fontSize(9)
      .text(
        formatDate(
          donation.donationDate
        ),
        420,
        receiptInfoY,
        {
          width: 130,
          align: "right",
          lineBreak: false,
        }
      );

    doc.y =
      receiptInfoY + 30;

    // ========================================================
    // DONOR INFORMATION
    // ========================================================

    ensureSpace(110);

    sectionTitle(
      "DONOR INFORMATION"
    );

    const donorBoxY =
      doc.y;

    const donorBoxHeight =
      72;

    doc
      .roundedRect(
        LEFT,
        donorBoxY,
        WIDTH,
        donorBoxHeight,
        5
      )
      .fillAndStroke(
        LIGHT,
        BORDER
      );

    // Name label
    doc
      .fillColor(GRAY)
      .font("Helvetica-Bold")
      .fontSize(8)
      .text(
        "NAME",
        LEFT + 15,
        donorBoxY + 13,
        {
          width: 45,
          lineBreak: false,
        }
      );

    // Name
    doc
      .fillColor(TEXT)
      .font("Helvetica")
      .fontSize(9)
      .text(
        safeText(donorName),
        LEFT + 65,
        donorBoxY + 12,
        {
          width: 215,
          height: 15,
          ellipsis: true,
          lineBreak: false,
        }
      );

    // Phone label
    doc
      .fillColor(GRAY)
      .font("Helvetica-Bold")
      .fontSize(8)
      .text(
        "PHONE",
        315,
        donorBoxY + 13,
        {
          width: 45,
          lineBreak: false,
        }
      );

    // Phone
    doc
      .fillColor(TEXT)
      .font("Helvetica")
      .fontSize(9)
      .text(
        safeText(donorPhone),
        365,
        donorBoxY + 12,
        {
          width: 165,
          height: 15,
          ellipsis: true,
          lineBreak: false,
        }
      );

    // Email label
    doc
      .fillColor(GRAY)
      .font("Helvetica-Bold")
      .fontSize(8)
      .text(
        "EMAIL",
        LEFT + 15,
        donorBoxY + 43,
        {
          width: 45,
          lineBreak: false,
        }
      );

    // Email
    doc
      .fillColor(TEXT)
      .font("Helvetica")
      .fontSize(8.5)
      .text(
        safeText(donorEmail),
        LEFT + 65,
        donorBoxY + 42,
        {
          width: 440,
          height: 15,
          ellipsis: true,
          lineBreak: false,
        }
      );

    doc.y =
      donorBoxY +
      donorBoxHeight +
      18;

    // ========================================================
    // DONATION DETAILS
    // ========================================================

    ensureSpace(125);

    sectionTitle(
      "DONATION DETAILS"
    );

    const detailsY =
      doc.y;

    const detailsHeight =
      100;

    doc
      .roundedRect(
        LEFT,
        detailsY,
        WIDTH,
        detailsHeight,
        5
      )
      .fillAndStroke(
        WHITE,
        BORDER
      );

    // Amount label
    doc
      .fillColor(GRAY)
      .font("Helvetica-Bold")
      .fontSize(8)
      .text(
        "DONATION AMOUNT",
        LEFT + 16,
        detailsY + 15,
        {
          width: 150,
          lineBreak: false,
        }
      );

    // Amount
    doc
      .fillColor(NAVY)
      .font("Helvetica-Bold")
      .fontSize(21)
      .text(
        money(donation.amount),
        LEFT + 16,
        detailsY + 32,
        {
          width: 210,
          lineBreak: false,
        }
      );

    // Vertical divider
    doc
      .moveTo(
        290,
        detailsY + 12
      )
      .lineTo(
        290,
        detailsY + 88
      )
      .lineWidth(0.5)
      .strokeColor(BORDER)
      .stroke();

    const detailRow = (
      label,
      value,
      y
    ) => {
      doc
        .fillColor(GRAY)
        .font("Helvetica-Bold")
        .fontSize(8)
        .text(
          label,
          310,
          y,
          {
            width: 90,
            lineBreak: false,
          }
        );

      doc
        .fillColor(TEXT)
        .font("Helvetica")
        .fontSize(8.5)
        .text(
          safeText(value),
          405,
          y,
          {
            width: 135,
            height: 12,
            ellipsis: true,
            lineBreak: false,
          }
        );
    };

    detailRow(
      "Payment Method",
      donation.paymentMethod,
      detailsY + 18
    );

    detailRow(
      "Reference",
      donation.referenceNumber ||
        receiptNumber,
      detailsY + 42
    );

    detailRow(
      "Status",
      donation.status,
      detailsY + 66
    );

    doc.y =
      detailsY +
      detailsHeight +
      18;

    // ========================================================
    // ALLOCATION SECTION
    // ========================================================

    ensureSpace(55);

    sectionTitle(
      "7-CATEGORY ALLOCATION"
    );

    // ========================================================
    // TABLE WIDTHS
    // ========================================================

    const tableLeft =
      LEFT;

    const tableWidth =
      WIDTH;

    const categoryWidth =
      300;

    const percentageWidth =
      80;

    const amountWidth =
      tableWidth -
      categoryWidth -
      percentageWidth;

    const HEADER_HEIGHT =
      22;

    const ROW_HEIGHT =
      20;

    // ========================================================
    // TABLE HEADER
    // ========================================================

    const drawTableHeader = (
      continued = false
    ) => {
      const y =
        doc.y;

      doc
        .rect(
          tableLeft,
          y,
          tableWidth,
          HEADER_HEIGHT
        )
        .fill(NAVY);

      doc
        .fillColor(WHITE)
        .font("Helvetica-Bold")
        .fontSize(8)
        .text(
          continued
            ? "CATEGORY (CONTINUED)"
            : "CATEGORY",
          tableLeft + 8,
          y + 7,
          {
            width:
              categoryWidth - 15,
            lineBreak: false,
          }
        );

      doc
        .text(
          "%",
          tableLeft +
            categoryWidth,
          y + 7,
          {
            width:
              percentageWidth,
            align: "center",
            lineBreak: false,
          }
        );

      doc
        .text(
          "AMOUNT",
          tableLeft +
            categoryWidth +
            percentageWidth,
          y + 7,
          {
            width:
              amountWidth - 8,
            align: "right",
            lineBreak: false,
          }
        );

      doc.y =
        y + HEADER_HEIGHT;
    };

    drawTableHeader();

    // ========================================================
    // ALLOCATION ROWS
    // ========================================================

    let totalAllocated = 0;

    if (
      allocations.length === 0
    ) {
      ensureSpace(
        ROW_HEIGHT
      );

      doc
        .fillColor(TEXT)
        .font("Helvetica")
        .fontSize(8)
        .text(
          "No allocation records found.",
          tableLeft + 8,
          doc.y + 6,
          {
            width:
              tableWidth - 16,
            lineBreak: false,
          }
        );

      doc.y +=
        ROW_HEIGHT;
    }

    for (
      let index = 0;
      index < allocations.length;
      index++
    ) {
      const allocation =
        allocations[index];

      // Only create page when THIS row
      // cannot fit on current page.
      if (
        doc.y +
          ROW_HEIGHT >
        CONTENT_BOTTOM
      ) {
        newPage();

        doc
          .fillColor(NAVY)
          .font("Helvetica-Bold")
          .fontSize(10)
          .text(
            "7-CATEGORY ALLOCATION",
            LEFT,
            doc.y,
            {
              lineBreak: false,
            }
          );

        doc.y += 16;

        drawTableHeader(true);
      }

      const categoryName =
        allocation.categoryId?.name ||
        allocation.categoryName ||
        `Category ${index + 1}`;

      const percentage =
        toNumber(
          allocation.percentage
        );

      const allocatedAmount =
        toNumber(
          allocation.allocatedAmount
        );

      totalAllocated +=
        allocatedAmount;

      const rowY =
        doc.y;

      // Alternating row background
      if (
        index % 2 === 0
      ) {
        doc
          .rect(
            tableLeft,
            rowY,
            tableWidth,
            ROW_HEIGHT
          )
          .fill(LIGHT);
      }

      // Category
      doc
        .fillColor(TEXT)
        .font("Helvetica")
        .fontSize(7.8)
        .text(
          safeText(
            categoryName,
            `Category ${index + 1}`
          ),
          tableLeft + 8,
          rowY + 6,
          {
            width:
              categoryWidth - 15,
            height: 10,
            ellipsis: true,
            lineBreak: false,
          }
        );

      // Percentage
      doc
        .fillColor(TEXT)
        .font("Helvetica")
        .fontSize(7.8)
        .text(
          `${percentage.toFixed(2)}%`,
          tableLeft +
            categoryWidth,
          rowY + 6,
          {
            width:
              percentageWidth,
            align: "center",
            lineBreak: false,
          }
        );

      // Amount
      doc
        .text(
          money(
            allocatedAmount
          ),
          tableLeft +
            categoryWidth +
            percentageWidth,
          rowY + 6,
          {
            width:
              amountWidth - 8,
            align: "right",
            lineBreak: false,
          }
        );

      // Row border
      doc
        .moveTo(
          tableLeft,
          rowY + ROW_HEIGHT
        )
        .lineTo(
          tableLeft + tableWidth,
          rowY + ROW_HEIGHT
        )
        .lineWidth(0.35)
        .strokeColor(BORDER)
        .stroke();

      doc.y =
        rowY + ROW_HEIGHT;
    }

    // ========================================================
    // TOTAL ALLOCATED
    // ========================================================

    if (
      doc.y + 26 >
      CONTENT_BOTTOM
    ) {
      newPage();

      sectionTitle(
        "ALLOCATION SUMMARY"
      );
    }

    const totalY =
      doc.y;

    doc
      .rect(
        tableLeft,
        totalY,
        tableWidth,
        25
      )
      .fill("#eef1f5");

    doc
      .fillColor(NAVY)
      .font("Helvetica-Bold")
      .fontSize(8)
      .text(
        "TOTAL ALLOCATED",
        tableLeft + 8,
        totalY + 8,
        {
          width:
            categoryWidth - 15,
          lineBreak: false,
        }
      );

    doc
      .text(
        money(totalAllocated),
        tableLeft +
          categoryWidth +
          percentageWidth,
        totalY + 8,
        {
          width:
            amountWidth - 8,
          align: "right",
          lineBreak: false,
        }
      );

    doc.y =
      totalY + 40;

    // ========================================================
    // NOTES
    // ========================================================

    if (
      donation.notes &&
      String(donation.notes).trim()
    ) {
      ensureSpace(55);

      sectionTitle(
        "NOTES"
      );

      const notes =
        String(donation.notes);

      doc
        .fillColor(TEXT)
        .font("Helvetica")
        .fontSize(8.5);

      // ------------------------------------------------------
      // Split notes into manageable paragraphs/lines.
      // A new page is created only when required.
      // ------------------------------------------------------

      const paragraphs =
        notes.split(/\r?\n/);

      for (
        let p = 0;
        p < paragraphs.length;
        p++
      ) {
        const paragraph =
          paragraphs[p].trim();

        if (!paragraph) {
          doc.y += 5;
          continue;
        }

        const paragraphHeight =
          doc.heightOfString(
            paragraph,
            {
              width: WIDTH,
              lineGap: 2,
            }
          );

        // If whole paragraph fits,
        // keep it together.
        if (
          doc.y +
            paragraphHeight <=
          CONTENT_BOTTOM
        ) {
          doc
            .fillColor(TEXT)
            .font("Helvetica")
            .fontSize(8.5)
            .text(
              paragraph,
              LEFT,
              doc.y,
              {
                width: WIDTH,
                lineGap: 2,
              }
            );

          doc.y += 5;

          continue;
        }

        // ----------------------------------------------------
        // Long paragraph:
        // split by words.
        // ----------------------------------------------------

        const words =
          paragraph.split(/\s+/);

        let currentLine = "";

        for (
          let i = 0;
          i < words.length;
          i++
        ) {
          const candidate =
            currentLine
              ? `${currentLine} ${words[i]}`
              : words[i];

          const candidateHeight =
            doc.heightOfString(
              candidate,
              {
                width: WIDTH,
                lineGap: 2,
              }
            );

          if (
            currentLine &&
            doc.y +
              candidateHeight >
            CONTENT_BOTTOM
          ) {
            doc
              .fillColor(TEXT)
              .font("Helvetica")
              .fontSize(8.5)
              .text(
                currentLine,
                LEFT,
                doc.y,
                {
                  width: WIDTH,
                  lineGap: 2,
                }
              );

            newPage();

            doc
              .fillColor(TEXT)
              .font("Helvetica")
              .fontSize(8.5);

            currentLine =
              words[i];
          } else {
            currentLine =
              candidate;
          }
        }

        if (
          currentLine
        ) {
          const lineHeight =
            doc.heightOfString(
              currentLine,
              {
                width: WIDTH,
                lineGap: 2,
              }
            );

          if (
            doc.y +
              lineHeight >
            CONTENT_BOTTOM
          ) {
            newPage();
          }

          doc
            .fillColor(TEXT)
            .font("Helvetica")
            .fontSize(8.5)
            .text(
              currentLine,
              LEFT,
              doc.y,
              {
                width: WIDTH,
                lineGap: 2,
              }
            );
        }

        doc.y += 5;
      }
    }

    // ========================================================
    // THANK YOU SECTION
    // ========================================================

    ensureSpace(85);

    doc
      .fillColor(NAVY)
      .font("Helvetica-Bold")
      .fontSize(12)
      .text(
        "Thank You for Your Generous Donation",
        LEFT,
        doc.y,
        {
          width: WIDTH,
          align: "center",
          lineBreak: false,
        }
      );

    doc.y += 20;

    doc
      .fillColor(GRAY)
      .font("Helvetica")
      .fontSize(8)
      .text(
        "Your contribution is sincerely appreciated and helps support our community welfare initiatives.",
        LEFT + 60,
        doc.y,
        {
          width:
            WIDTH - 120,
          align: "center",
        }
      );

    doc.y += 40;

    // ========================================================
    // SIGNATURES
    // ========================================================

    ensureSpace(60);

    const signatureY =
      doc.y;

    // Left signature
    doc
      .moveTo(
        70,
        signatureY
      )
      .lineTo(
        235,
        signatureY
      )
      .lineWidth(0.8)
      .strokeColor(TEXT)
      .stroke();

    // Right signature
    doc
      .moveTo(
        360,
        signatureY
      )
      .lineTo(
        525,
        signatureY
      )
      .lineWidth(0.8)
      .strokeColor(TEXT)
      .stroke();

    doc
      .fillColor(GRAY)
      .font("Helvetica")
      .fontSize(8)
      .text(
        "Authorized Signature",
        70,
        signatureY + 7,
        {
          width: 165,
          align: "center",
          lineBreak: false,
        }
      );

    doc
      .text(
        "Organization Stamp",
        360,
        signatureY + 7,
        {
          width: 165,
          align: "center",
          lineBreak: false,
        }
      );

    // ========================================================
    // FOOTER
    // ========================================================

    // IMPORTANT:
    // Footer is drawn ONLY after all content is complete.
    // No addPage() after this.
    drawFooter();

    // ========================================================
    // AUDIT LOG
    // ========================================================

    try {
      await auditLogService.createAuditLog({
        userId:
          req.user?._id ||
          req.user?.id ||
          null,

        userRole:
          req.user?.role || "",

        userEmail:
          req.user?.email || "",

        action:
          "GENERATE_RECEIPT",

        module:
          "Donations",

        description:
          `Donation receipt generated for ${receiptNumber}`,

        recordId:
          donation._id,

        metadata: {
          receiptNumber,

          donationId:
            donation._id.toString(),

          amount:
            donation.amount?.toString(),

          status:
            donation.status,

          allocationCount:
            allocations.length,
        },
      });
    } catch (auditError) {
      console.error(
        "Receipt audit log error:",
        auditError.message
      );
    }

    // ========================================================
    // END PDF
    // ========================================================

    doc.end();
  } catch (error) {
    console.error(
      "Generate donation receipt error:",
      error
    );

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message:
          "Failed to generate donation receipt",
        error: error.message,
      });
    }

    res.end();
  }
};

// ==========================================================
// EXPORT
// ==========================================================

module.exports = {
  generateDonationReceipt,
};