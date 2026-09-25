const PDFDocument = require("pdfkit");
const mongoose = require("mongoose");

const Distribution = require("../models/distribution");
const auditLogService = require("../services/auditLogService");

// ==========================================================
// GENERATE DISTRIBUTION RECEIPT PDF - ONE PAGE
// GET /api/distributions/:id/receipt
// ==========================================================

const generateDistributionReceipt = async (req, res) => {
  try {
    const { id } = req.params;

    // ========================================================
    // VALIDATE ID
    // ========================================================

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid distribution ID",
      });
    }

    // ========================================================
    // GET DISTRIBUTION
    // ========================================================

    const distribution = await Distribution.findById(id)
      .populate("categoryId", "name");

    if (!distribution) {
      return res.status(404).json({
        success: false,
        message: "Distribution not found",
      });
    }

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

    // ========================================================
    // ONE LINE TEXT
    // Prevent long text from creating additional pages
    // ========================================================

    const oneLine = (
      value,
      fallback = "N/A",
      maxLength = 70
    ) => {
      if (
        value === null ||
        value === undefined ||
        value === ""
      ) {
        return fallback;
      }

      const text = String(value)
        .replace(/\r?\n/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (!text) {
        return fallback;
      }

      if (text.length > maxLength) {
        return `${text.slice(0, maxLength - 3)}...`;
      }

      return text;
    };

    // ========================================================
    // RECEIPT NUMBER
    // ========================================================

    const receiptNumber =
      distribution.referenceNumber ||
      `DIST-${distribution._id
        .toString()
        .slice(-8)
        .toUpperCase()}`;

    const fileName =
      `Distribution_Receipt_${receiptNumber}.pdf`;

    // ========================================================
    // A4 PAGE SETTINGS
    // ========================================================

    const PAGE_WIDTH = 595.28;
    const PAGE_HEIGHT = 841.89;

    const LEFT = 45;
    const RIGHT = 550;
    const WIDTH = RIGHT - LEFT;

    // ========================================================
    // COLORS
    // ========================================================

    const NAVY = "#00142b";
    const GOLD = "#e6a726";
    const LIGHT = "#f5f7fa";
    const BORDER = "#d7dce2";
    const TEXT = "#222222";
    const GRAY = "#666666";

    // ========================================================
    // CREATE PDF
    // IMPORTANT: margin = 0
    // ========================================================

    const doc = new PDFDocument({
      size: "A4",
      margin: 0,
      autoFirstPage: true,
      info: {
        Title: `Distribution Receipt - ${receiptNumber}`,
        Author: "Donation Management System",
        Subject: "Distribution Receipt",
      },
    });

    res.setHeader(
      "Content-Type",
      "application/pdf"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileName}"`
    );

    doc.pipe(res);

    // ========================================================
    // HEADER
    // ========================================================

    doc
      .fillColor(NAVY)
      .font("Helvetica-Bold")
      .fontSize(23)
      .text(
        "DISTRIBUTION RECEIPT",
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
      .fontSize(9)
      .text(
        "DONATION MANAGEMENT SYSTEM",
        LEFT,
        68,
        {
          width: WIDTH,
          align: "center",
          lineBreak: false,
        }
      );

    doc
      .moveTo(LEFT, 91)
      .lineTo(RIGHT, 91)
      .lineWidth(1.2)
      .strokeColor(GOLD)
      .stroke();

    // ========================================================
    // RECEIPT INFORMATION
    // ========================================================

    const infoY = 108;

    // Receipt Number Label
    doc
      .fillColor(GRAY)
      .font("Helvetica-Bold")
      .fontSize(8)
      .text(
        "RECEIPT NUMBER",
        LEFT,
        infoY,
        {
          width: 100,
          lineBreak: false,
        }
      );

    // Receipt Number
    doc
      .fillColor(TEXT)
      .font("Helvetica")
      .fontSize(9)
      .text(
        oneLine(receiptNumber, "N/A", 35),
        LEFT + 105,
        infoY,
        {
          width: 150,
          lineBreak: false,
        }
      );

    // Date Label
    doc
      .fillColor(GRAY)
      .font("Helvetica-Bold")
      .fontSize(8)
      .text(
        "DISTRIBUTION DATE",
        320,
        infoY,
        {
          width: 105,
          lineBreak: false,
        }
      );

    // Date
    doc
      .fillColor(TEXT)
      .font("Helvetica")
      .fontSize(9)
      .text(
        formatDate(distribution.date),
        425,
        infoY,
        {
          width: 125,
          align: "right",
          lineBreak: false,
        }
      );

    // ========================================================
    // BENEFICIARY INFORMATION
    // ========================================================

    const beneficiaryTitleY = 138;

    doc
      .fillColor(NAVY)
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(
        "BENEFICIARY INFORMATION",
        LEFT,
        beneficiaryTitleY,
        {
          width: WIDTH,
          lineBreak: false,
        }
      );

    const beneficiaryBoxY = 158;
    const beneficiaryBoxHeight = 62;

    doc
      .roundedRect(
        LEFT,
        beneficiaryBoxY,
        WIDTH,
        beneficiaryBoxHeight,
        5
      )
      .fillAndStroke(
        LIGHT,
        BORDER
      );

    // Name Label
    doc
      .fillColor(GRAY)
      .font("Helvetica-Bold")
      .fontSize(8)
      .text(
        "NAME",
        LEFT + 15,
        beneficiaryBoxY + 13,
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
        oneLine(
          distribution.beneficiaryName,
          "N/A",
          65
        ),
        LEFT + 65,
        beneficiaryBoxY + 12,
        {
          width: 430,
          lineBreak: false,
        }
      );

    // Category Label
    doc
      .fillColor(GRAY)
      .font("Helvetica-Bold")
      .fontSize(8)
      .text(
        "CATEGORY",
        LEFT + 15,
        beneficiaryBoxY + 40,
        {
          width: 55,
          lineBreak: false,
        }
      );

    // Category
    doc
      .fillColor(TEXT)
      .font("Helvetica")
      .fontSize(8.5)
      .text(
        oneLine(
          distribution.categoryId?.name,
          "N/A",
          65
        ),
        LEFT + 75,
        beneficiaryBoxY + 39,
        {
          width: 420,
          lineBreak: false,
        }
      );

    // ========================================================
    // DISTRIBUTION DETAILS
    // ========================================================

    const detailsTitleY = 242;

    doc
      .fillColor(NAVY)
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(
        "DISTRIBUTION DETAILS",
        LEFT,
        detailsTitleY,
        {
          lineBreak: false,
        }
      );

    const detailsY = 262;
    const detailsHeight = 96;

    doc
      .roundedRect(
        LEFT,
        detailsY,
        WIDTH,
        detailsHeight,
        5
      )
      .fillAndStroke(
        "#ffffff",
        BORDER
      );

    // Amount Label
    doc
      .fillColor(GRAY)
      .font("Helvetica-Bold")
      .fontSize(8)
      .text(
        "DISTRIBUTED AMOUNT",
        LEFT + 16,
        detailsY + 14,
        {
          width: 160,
          lineBreak: false,
        }
      );

    // Amount
    doc
      .fillColor(NAVY)
      .font("Helvetica-Bold")
      .fontSize(21)
      .text(
        money(distribution.amount),
        LEFT + 16,
        detailsY + 31,
        {
          width: 210,
          lineBreak: false,
        }
      );

    // Vertical Divider
    doc
      .moveTo(
        290,
        detailsY + 12
      )
      .lineTo(
        290,
        detailsY + detailsHeight - 12
      )
      .lineWidth(0.5)
      .strokeColor(BORDER)
      .stroke();

    // Detail Row
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
        .fontSize(9)
        .text(
          oneLine(
            value,
            "N/A",
            22
          ),
          405,
          y,
          {
            width: 135,
            lineBreak: false,
          }
        );
    };

    detailRow(
      "Payment Method",
      distribution.paymentMethod,
      detailsY + 17
    );

    detailRow(
      "Reference",
      distribution.referenceNumber ||
        receiptNumber,
      detailsY + 40
    );

    detailRow(
      "Status",
      "Distributed",
      detailsY + 63
    );

    // ========================================================
    // PURPOSE
    // ========================================================

    const purposeTitleY = 378;

    doc
      .fillColor(NAVY)
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(
        "PURPOSE",
        LEFT,
        purposeTitleY,
        {
          lineBreak: false,
        }
      );

    const purposeBoxY =
      purposeTitleY + 19;

    doc
      .roundedRect(
        LEFT,
        purposeBoxY,
        WIDTH,
        52,
        5
      )
      .fillAndStroke(
        LIGHT,
        BORDER
      );

    doc
      .fillColor(TEXT)
      .font("Helvetica")
      .fontSize(8.5)
      .text(
        oneLine(
          distribution.purpose,
          "No purpose provided.",
          120
        ),
        LEFT + 12,
        purposeBoxY + 18,
        {
          width: WIDTH - 24,
          lineBreak: false,
        }
      );

    // ========================================================
    // NOTES
    // ========================================================

    const notesY = 462;

    doc
      .fillColor(NAVY)
      .font("Helvetica-Bold")
      .fontSize(10.5)
      .text(
        "NOTES",
        LEFT,
        notesY,
        {
          lineBreak: false,
        }
      );

    doc
      .fillColor(TEXT)
      .font("Helvetica")
      .fontSize(8.5)
      .text(
        oneLine(
          distribution.notes,
          "No notes added.",
          145
        ),
        LEFT,
        notesY + 19,
        {
          width: WIDTH,
          lineBreak: false,
        }
      );

    // ========================================================
    // CONFIRMATION BOX
    // ========================================================

    const confirmationY = 550;

    doc
      .roundedRect(
        LEFT,
        confirmationY,
        WIDTH,
        70,
        6
      )
      .fillAndStroke(
        "#f8fafc",
        BORDER
      );

    doc
      .fillColor(NAVY)
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(
        "Distribution Confirmed",
        LEFT + 15,
        confirmationY + 13,
        {
          width: WIDTH - 30,
          align: "center",
          lineBreak: false,
        }
      );

    doc
      .fillColor(GRAY)
      .font("Helvetica")
      .fontSize(8.5)
      .text(
        "The above amount was recorded as a community welfare distribution.",
        LEFT + 25,
        confirmationY + 35,
        {
          width: WIDTH - 50,
          align: "center",
          lineBreak: false,
        }
      );

    // ========================================================
    // SIGNATURE AREA
    // ========================================================

    const signatureY = 665;

    const SIGNATURE_WIDTH = 165;

    const SIGNATURE_LEFT_X = 70;
    const SIGNATURE_RIGHT_X = 360;

    // Left Signature Line
    doc
      .moveTo(
        SIGNATURE_LEFT_X,
        signatureY
      )
      .lineTo(
        SIGNATURE_LEFT_X +
          SIGNATURE_WIDTH,
        signatureY
      )
      .lineWidth(0.8)
      .strokeColor(TEXT)
      .stroke();

    // Right Signature Line
    doc
      .moveTo(
        SIGNATURE_RIGHT_X,
        signatureY
      )
      .lineTo(
        SIGNATURE_RIGHT_X +
          SIGNATURE_WIDTH,
        signatureY
      )
      .lineWidth(0.8)
      .strokeColor(TEXT)
      .stroke();

    // Left Label
    doc
      .fillColor(GRAY)
      .font("Helvetica")
      .fontSize(8)
      .text(
        "Authorized Signature",
        SIGNATURE_LEFT_X,
        signatureY + 7,
        {
          width: SIGNATURE_WIDTH,
          align: "center",
          lineBreak: false,
        }
      );

    // Right Label
    doc
      .text(
        "Organization Stamp",
        SIGNATURE_RIGHT_X,
        signatureY + 7,
        {
          width: SIGNATURE_WIDTH,
          align: "center",
          lineBreak: false,
        }
      );

    // ========================================================
    // FOOTER
    // ========================================================

    const footerY =
      PAGE_HEIGHT - 62;

    doc
      .moveTo(
        LEFT,
        footerY
      )
      .lineTo(
        RIGHT,
        footerY
      )
      .lineWidth(0.5)
      .strokeColor(BORDER)
      .stroke();

    doc
      .fillColor(GRAY)
      .font("Helvetica")
      .fontSize(7.5)
      .text(
        "This receipt confirms that the above distribution was recorded.",
        LEFT,
        footerY + 11,
        {
          width: WIDTH,
          align: "center",
          lineBreak: false,
        }
      );

    doc
      .fontSize(7)
      .text(
        `Generated on ${formatDate(
          new Date()
        )}`,
        LEFT,
        footerY + 25,
        {
          width: WIDTH,
          align: "center",
          lineBreak: false,
        }
      );

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
          "Distributions",

        description:
          `Distribution receipt generated for ${receiptNumber}`,

        recordId:
          distribution._id,

        metadata: {
          receiptNumber,

          distributionId:
            distribution._id.toString(),

          amount:
            distribution.amount?.toString(),

          category:
            distribution.categoryId?.name ||
            "",

          beneficiary:
            distribution.beneficiaryName ||
            "",
        },
      });
    } catch (auditError) {
      console.error(
        "Distribution receipt audit log error:",
        auditError.message
      );
    }

    // ========================================================
    // END PDF
    // ========================================================

    // IMPORTANT:
    // Do NOT call doc.addPage()
    doc.end();

  } catch (error) {
    console.error(
      "Generate distribution receipt error:",
      error
    );

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message:
          "Failed to generate distribution receipt",
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
  generateDistributionReceipt,
};