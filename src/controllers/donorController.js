const mongoose = require("mongoose");
const Donor = require("../models/donor");
const Donation = require("../models/donation");

// ======================================================
// HELPERS
// ======================================================

const escapeRegex = (value) => {
  return String(value).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
};

const decimalToNumber = (value) => {
  if (value === null || value === undefined) {
    return 0;
  }

  return Number(value.toString());
};

// GET ALL DONORS - SEARCH / FILTER / PAGINATION
const getDonors = async (req, res) => {
  try {
    const {
      search = "",
      minDonated = "",
      maxDonated = "",
      minDonations = "",
      maxDonations = "",
      firstDonationFrom = "",
      firstDonationTo = "",
      lastDonationFrom = "",
      lastDonationTo = "",
      page = 1,
      limit = 10,
    } = req.query;

    const currentPage =
      Number(page) > 0 ? Math.floor(Number(page)) : 1;

    const perPage =
      Number(limit) > 0
        ? Math.min(Math.floor(Number(limit)), 100)
        : 10;

    const skip = (currentPage - 1) * perPage;

    const filter = {};

    // =====================================================
    // SEARCH
    // =====================================================
    if (search.trim()) {
      const escapedSearch = search
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      const regex = new RegExp(escapedSearch, "i");

      filter.$or = [
        { name: regex },
        { phone: regex },
        { email: regex },
      ];
    }

    // =====================================================
    // TOTAL DONATED FILTER
    // =====================================================
    if (minDonated !== "") {
      const value = Number(minDonated);

      if (!Number.isFinite(value) || value < 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid minimum donated amount.",
        });
      }

      filter.totalDonated = {
        ...(filter.totalDonated || {}),
        $gte: mongoose.Types.Decimal128.fromString(
          value.toFixed(2)
        ),
      };
    }

    if (maxDonated !== "") {
      const value = Number(maxDonated);

      if (!Number.isFinite(value) || value < 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid maximum donated amount.",
        });
      }

      filter.totalDonated = {
        ...(filter.totalDonated || {}),
        $lte: mongoose.Types.Decimal128.fromString(
          value.toFixed(2)
        ),
      };
    }

    if (
      minDonated !== "" &&
      maxDonated !== "" &&
      Number(minDonated) > Number(maxDonated)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Minimum donated amount cannot be greater than maximum donated amount.",
      });
    }

    // =====================================================
    // DONATION COUNT FILTER
    // =====================================================
    if (minDonations !== "") {
      const value = Number(minDonations);

      if (!Number.isInteger(value) || value < 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid minimum donations count.",
        });
      }

      filter.donationCount = {
        ...(filter.donationCount || {}),
        $gte: value,
      };
    }

    if (maxDonations !== "") {
      const value = Number(maxDonations);

      if (!Number.isInteger(value) || value < 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid maximum donations count.",
        });
      }

      filter.donationCount = {
        ...(filter.donationCount || {}),
        $lte: value,
      };
    }

    if (
      minDonations !== "" &&
      maxDonations !== "" &&
      Number(minDonations) > Number(maxDonations)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Minimum donations cannot be greater than maximum donations.",
      });
    }

    // =====================================================
    // DATE HELPER
    // =====================================================
    const parseDateOnly = (value, endOfDay = false) => {
      if (!value) return null;

      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

      if (!match) return null;

      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);

      const date = new Date(
        year,
        month - 1,
        day,
        endOfDay ? 23 : 0,
        endOfDay ? 59 : 0,
        endOfDay ? 59 : 0,
        endOfDay ? 999 : 0
      );

      if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
      ) {
        return null;
      }

      return date;
    };

    // =====================================================
    // FIRST DONATION DATE FILTER
    // =====================================================
    if (firstDonationFrom) {
      const date = parseDateOnly(firstDonationFrom);

      if (!date) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid first donation from date. Use YYYY-MM-DD.",
        });
      }

      filter.firstDonationDate = {
        ...(filter.firstDonationDate || {}),
        $gte: date,
      };
    }

    if (firstDonationTo) {
      const date = parseDateOnly(firstDonationTo, true);

      if (!date) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid first donation to date. Use YYYY-MM-DD.",
        });
      }

      filter.firstDonationDate = {
        ...(filter.firstDonationDate || {}),
        $lte: date,
      };
    }

    if (
      firstDonationFrom &&
      firstDonationTo &&
      firstDonationFrom > firstDonationTo
    ) {
      return res.status(400).json({
        success: false,
        message:
          "First donation from date cannot be after first donation to date.",
      });
    }

    // =====================================================
    // LAST DONATION DATE FILTER
    // =====================================================
    if (lastDonationFrom) {
      const date = parseDateOnly(lastDonationFrom);

      if (!date) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid last donation from date. Use YYYY-MM-DD.",
        });
      }

      filter.lastDonationDate = {
        ...(filter.lastDonationDate || {}),
        $gte: date,
      };
    }

    if (lastDonationTo) {
      const date = parseDateOnly(lastDonationTo, true);

      if (!date) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid last donation to date. Use YYYY-MM-DD.",
        });
      }

      filter.lastDonationDate = {
        ...(filter.lastDonationDate || {}),
        $lte: date,
      };
    }

    if (
      lastDonationFrom &&
      lastDonationTo &&
      lastDonationFrom > lastDonationTo
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Last donation from date cannot be after last donation to date.",
      });
    }

    console.log("==============================================");
    console.log("DONOR GET REQUEST");
    console.log("Query:", req.query);
    console.log(
      "FINAL DONOR MONGODB FILTER:",
      JSON.stringify(filter, null, 2)
    );

    // =====================================================
    // FETCH DONORS + COUNT
    // =====================================================
    const [donors, totalRecords] = await Promise.all([
      Donor.find(filter)
        .sort({ name: 1 })
        .skip(skip)
        .limit(perPage)
        .lean(),

      Donor.countDocuments(filter),
    ]);

    // =====================================================
    // DECIMAL128 -> STRING
    // Prevent frontend $NaN
    // =====================================================
    const normalizedDonors = donors.map((donor) => ({
      ...donor,

      totalDonated:
        donor.totalDonated !== null &&
        donor.totalDonated !== undefined
          ? donor.totalDonated.toString()
          : "0.00",

      donationCount: Number(donor.donationCount || 0),
    }));

    const totalPages = Math.max(
      Math.ceil(totalRecords / perPage),
      1
    );

    console.log("DONOR FILTER RESULT:", {
      totalRecords,
      returnedRecords: normalizedDonors.length,
      totalPages,
    });

    console.log("==============================================");

    return res.status(200).json({
      success: true,

      pagination: {
        currentPage,
        perPage,
        totalRecords,
        totalPages,
        hasNextPage: currentPage < totalPages,
        hasPreviousPage: currentPage > 1,
      },

      filters: {
        search: search.trim(),

        minDonated:
          minDonated !== "" ? Number(minDonated) : null,

        maxDonated:
          maxDonated !== "" ? Number(maxDonated) : null,

        minDonations:
          minDonations !== "" ? Number(minDonations) : null,

        maxDonations:
          maxDonations !== "" ? Number(maxDonations) : null,

        firstDonationFrom:
          firstDonationFrom || null,

        firstDonationTo:
          firstDonationTo || null,

        lastDonationFrom:
          lastDonationFrom || null,

        lastDonationTo:
          lastDonationTo || null,
      },

      count: normalizedDonors.length,
      data: normalizedDonors,
    });
  } catch (error) {
    console.error("==============================================");
    console.error("GET DONORS ERROR:", error);
    console.error("==============================================");

    return res.status(500).json({
      success: false,
      message: "Failed to fetch donors",
      error: error.message,
    });
  }
};

// ======================================================
// GET DONOR BY ID
// ======================================================

const getDonorById = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(id)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid donor ID",
      });
    }

    const donor =
      await Donor.findById(id);

    if (!donor) {
      return res.status(404).json({
        success: false,
        message: "Donor not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: donor,
    });
  } catch (error) {
    console.error(
      "Get donor by ID error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to fetch donor",
      error: error.message,
    });
  }
};

// ======================================================
// GET DONOR DONATION HISTORY
// ======================================================

const getDonorDonations = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(id)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid donor ID",
      });
    }

    const donor =
      await Donor.findById(id);

    if (!donor) {
      return res.status(404).json({
        success: false,
        message: "Donor not found",
      });
    }

    const donations =
      await Donation.find({
        donorId: id,
      })
        .sort({
          donationDate: -1,
          createdAt: -1,
        })
        .lean();

    return res.status(200).json({
      success: true,

      donor: {
        id: donor._id,
        name: donor.name,
        phone: donor.phone,
        email: donor.email,
        totalDonated:
          donor.totalDonated,
        donationCount:
          donor.donationCount,
        firstDonationDate:
          donor.firstDonationDate,
        lastDonationDate:
          donor.lastDonationDate,
      },

      count: donations.length,
      data: donations,
    });
  } catch (error) {
    console.error(
      "Get donor donations error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to fetch donor donation history",
      error: error.message,
    });
  }
};

// ======================================================
// CREATE DONOR
// ======================================================

const createDonor = async (
  req,
  res
) => {
  try {
    const {
      name,
      phone = "",
      email = "",
    } = req.body;

    if (
      !name ||
      !name.trim()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Donor name is required",
      });
    }

    const cleanName =
      name.trim();

    const cleanPhone =
      String(phone || "").trim();

    const cleanEmail =
      String(email || "")
        .trim()
        .toLowerCase();

    const existingConditions =
      [
        {
          name: cleanName,
        },
      ];

    if (cleanPhone) {
      existingConditions.push({
        phone: cleanPhone,
      });
    }

    if (cleanEmail) {
      existingConditions.push({
        email: cleanEmail,
      });
    }

    const existingDonor =
      await Donor.findOne({
        $or: existingConditions,
      });

    if (existingDonor) {
      return res.status(409).json({
        success: false,
        message:
          "Donor already exists",
        data: existingDonor,
      });
    }

    const donor =
      await Donor.create({
        name: cleanName,
        phone: cleanPhone,
        email: cleanEmail,
        totalDonated:
          mongoose.Types.Decimal128.fromString(
            "0.00"
          ),
        donationCount: 0,
        firstDonationDate: null,
        lastDonationDate: null,
      });

    return res.status(201).json({
      success: true,
      message:
        "Donor created successfully",
      data: donor,
    });
  } catch (error) {
    console.error(
      "Create donor error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to create donor",
      error: error.message,
    });
  }
};

// ======================================================
// UPDATE DONOR
// ======================================================

const updateDonor = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    const {
      name,
      phone,
      email,
    } = req.body;

    if (
      !mongoose.Types.ObjectId.isValid(id)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid donor ID",
      });
    }

    const donor =
      await Donor.findById(id);

    if (!donor) {
      return res.status(404).json({
        success: false,
        message: "Donor not found",
      });
    }

    if (name !== undefined) {
      if (
        !String(name).trim()
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Donor name cannot be empty",
        });
      }

      donor.name =
        String(name).trim();
    }

    if (phone !== undefined) {
      donor.phone =
        String(phone).trim();
    }

    if (email !== undefined) {
      donor.email =
        String(email)
          .trim()
          .toLowerCase();
    }

    await donor.save();

    return res.status(200).json({
      success: true,
      message:
        "Donor updated successfully",
      data: donor,
    });
  } catch (error) {
    console.error(
      "Update donor error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to update donor",
      error: error.message,
    });
  }
};

// ======================================================
// DELETE DONOR
// ======================================================

const deleteDonor = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(id)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid donor ID",
      });
    }

    const donor =
      await Donor.findById(id);

    if (!donor) {
      return res.status(404).json({
        success: false,
        message: "Donor not found",
      });
    }

    const donationCount =
      await Donation.countDocuments({
        donorId: id,
      });

    if (donationCount > 0) {
      return res.status(400).json({
        success: false,
        message:
          "This donor cannot be deleted because donation records exist.",
      });
    }

    await Donor.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message:
        "Donor deleted successfully",
    });
  } catch (error) {
    console.error(
      "Delete donor error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to delete donor",
      error: error.message,
    });
  }
};

module.exports = {
  getDonors,
  getDonorById,
  getDonorDonations,
  createDonor,
  updateDonor,
  deleteDonor,
};