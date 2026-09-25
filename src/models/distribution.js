const mongoose = require("mongoose");

const distributionSchema = new mongoose.Schema(
  {
    distributionDate: {
      type: Date,
      required: true,
    },

    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },

    beneficiaryName: {
      type: String,
      required: true,
      trim: true,
    },

    amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      min: 0,
    },

    purpose: {
      type: String,
      required: true,
      trim: true,
    },

    paymentMethod: {
      type: String,
      enum: ["Cash", "Bank", "Online", "Other"],
      required: true,
    },

    referenceNumber: {
      type: String,
      trim: true,
      default: "",
    },

    notes: {
      type: String,
      trim: true,
      default: "",
    },

    receiptUrl: {
      type: String,
      trim: true,
      default: "",
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ======================================================
// INDEXES
// ======================================================

distributionSchema.index({ distributionDate: -1 });
distributionSchema.index({ categoryId: 1 });
distributionSchema.index({ beneficiaryName: 1 });
distributionSchema.index({ referenceNumber: 1 });

// ======================================================
// EXPORT
// ======================================================

module.exports = mongoose.model(
  "Distribution",
  distributionSchema
);