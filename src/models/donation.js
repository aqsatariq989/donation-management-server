const mongoose = require("mongoose");

const donationSchema = new mongoose.Schema(
  {
    donationDate: {
      type: Date,
      required: true,
    },

    // Link donation to Donor
 donorId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "Donor",
  default: null,
},

    // Donor information snapshot
    donorName: {
      type: String,
      required: true,
      trim: true,
    },

    donorPhone: {
      type: String,
      trim: true,
      default: "",
    },

    donorEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },

    // Donation amount
    amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      min: 0,
    },

    // Payment method
    paymentMethod: {
      type: String,
      enum: ["Cash", "Bank", "Online", "Other"],
      required: true,
    },

    // Donation status
    status: {
      type: String,
      enum: ["Received", "Pending"],
      default: "Received",
      required: true,
    },

    // Receipt / reference
    referenceNumber: {
      type: String,
      trim: true,
      default: "",
    },

    // Additional notes
    notes: {
      type: String,
      trim: true,
      default: "",
    },

    // User who created the donation
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // User who last updated the donation
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

// Useful indexes
donationSchema.index({ donationDate: -1 });
donationSchema.index({ donorId: 1 });
donationSchema.index({ donorName: 1 });
donationSchema.index({ status: 1 });
donationSchema.index({ referenceNumber: 1 });

module.exports = mongoose.model("Donation", donationSchema);