const mongoose = require("mongoose");
const Allocation = require("../models/allocation");

// GET ALL ALLOCATIONS
// Optional filters:
// ?donationId=...
// ?categoryId=...
const getAllocations = async (req, res) => {
  try {
    const { donationId, categoryId } = req.query;

    const filter = {};

    // Filter by donation
    if (donationId) {
      if (!mongoose.Types.ObjectId.isValid(donationId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid donation ID",
        });
      }

      filter.donationId = donationId;
    }

    // Filter by category
    if (categoryId) {
      if (!mongoose.Types.ObjectId.isValid(categoryId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid category ID",
        });
      }

      filter.categoryId = categoryId;
    }

    const allocations = await Allocation.find(filter)
      .populate(
        "donationId",
        "donorName amount donationDate status referenceNumber"
      )
      .populate(
        "categoryId",
        "name allocationPercentage"
      )
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: allocations.length,
      filters: {
        donationId: donationId || null,
        categoryId: categoryId || null,
      },
      data: allocations,
    });
  } catch (error) {
    console.error("Get allocations error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch allocations",
      error: error.message,
    });
  }
};

module.exports = {
  getAllocations,
};