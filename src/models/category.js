const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    allocationPercentage: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      default: 0,
      min: 0,
      max: 100,
    },

    sortOrder: {
      type: Number,
      default: 0,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    openingBalance: {
      type: mongoose.Schema.Types.Decimal128,
      default: 0,
      min: 0,
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

categorySchema.index({
  name: 1,
});

categorySchema.index({
  isActive: 1,
});

categorySchema.index({
  sortOrder: 1,
});

module.exports =
  mongoose.model(
    "Category",
    categorySchema
  );