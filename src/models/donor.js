const mongoose = require("mongoose");

const donorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    phone: {
      type: String,
      trim: true,
      default: "",
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },

    totalDonated: {
      type: mongoose.Schema.Types.Decimal128,
      default: 0,
      min: 0,
    },

    donationCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    firstDonationDate: {
      type: Date,
      default: null,
    },

    lastDonationDate: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Search/index fields
donorSchema.index({ name: 1 });
donorSchema.index({ phone: 1 });
donorSchema.index({ email: 1 });

module.exports = mongoose.model("Donor", donorSchema);