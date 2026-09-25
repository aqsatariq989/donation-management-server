const mongoose = require("mongoose");

const Category = require("../models/category");
const Allocation = require("../models/allocation");

// ======================================================
// ALLOCATE DONATION
// ======================================================

const allocateDonation = async (donation, session) => {
  // --------------------------------------------------
  // Get active categories
  // --------------------------------------------------

  const categories = await Category.find({
    isActive: true,
  })
    .sort({ sortOrder: 1, createdAt: 1 })
    .session(session);

  if (!categories.length) {
    throw new Error("No active categories found");
  }

  // --------------------------------------------------
  // Validate total allocation percentage
  // --------------------------------------------------

  const totalPercentage = categories.reduce(
    (total, category) =>
      total +
      Number(category.allocationPercentage || 0),
    0
  );

  if (Math.abs(totalPercentage - 100) > 0.000001) {
    throw new Error(
      `Active category allocation percentages must equal 100%. Current total: ${totalPercentage.toFixed(
        6
      )}%`
    );
  }

  // --------------------------------------------------
  // Convert Decimal128 donation amount safely
  // --------------------------------------------------

  const donationAmount = Number(
    donation.amount.toString()
  );

  if (
    !Number.isFinite(donationAmount) ||
    donationAmount <= 0
  ) {
    throw new Error(
      "Donation amount must be greater than 0"
    );
  }

  // --------------------------------------------------
  // Work in cents to avoid rounding problems
  // --------------------------------------------------

  const totalCents = Math.round(
    donationAmount * 100
  );

  let allocatedCents = 0;

  const allocationDocuments = [];

  // --------------------------------------------------
  // Calculate allocation for each category
  // --------------------------------------------------

  categories.forEach((category, index) => {
    const percentage = Number(
      category.allocationPercentage || 0
    );

    let categoryCents;

    // Last category receives rounding remainder
    if (index === categories.length - 1) {
      categoryCents =
        totalCents - allocatedCents;
    } else {
      categoryCents = Math.round(
        (totalCents * percentage) / 100
      );
    }

    allocatedCents += categoryCents;

    allocationDocuments.push({
      donationId: donation._id,

      categoryId: category._id,

      // Historical percentage snapshot
      percentage:
        mongoose.Types.Decimal128.fromString(
          percentage.toFixed(6)
        ),

      // Historical allocated amount
      allocatedAmount:
        mongoose.Types.Decimal128.fromString(
          (categoryCents / 100).toFixed(2)
        ),
    });
  });

  // --------------------------------------------------
  // Final safety check
  // --------------------------------------------------

  if (allocatedCents !== totalCents) {
    throw new Error(
      "Allocation calculation error: allocated amount does not equal donation amount."
    );
  }

  // --------------------------------------------------
  // Save allocations
  // --------------------------------------------------

  const createdAllocations =
    await Allocation.insertMany(
      allocationDocuments,
      { session }
    );

  return createdAllocations;
};

// ======================================================
// EXPORT
// ======================================================

module.exports = {
  allocateDonation,
};