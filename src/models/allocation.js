const mongoose = require("mongoose");

const allocationSchema = new mongoose.Schema(
  {
    donationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Donation",
      required: true,
    },

    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },

    // Percentage used at the time of donation
    // This must remain unchanged for historical records.
    percentage: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      min: 0,
      max: 100,
    },

    // Actual amount allocated to this category
    allocatedAmount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Useful indexes
allocationSchema.index({ donationId: 1 });
allocationSchema.index({ categoryId: 1 });
allocationSchema.index({ donationId: 1, categoryId: 1 });

module.exports = mongoose.model("Allocation", allocationSchema);