const mongoose = require("mongoose");

const Donation = require("../models/donation");
const Donor = require("../models/donor");

const allocateDonation =
  require("../services/allocationService").allocateDonation;

const { createAuditLog } = require("../services/auditLogService");

// ======================================================
// CREATE DONATION
// ======================================================
const createDonation = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const {
      donationDate,
      donorId = null,
      donorName,
      donorPhone = "",
      donorEmail = "",
      amount,
      paymentMethod,
      status = "Received",
      referenceNumber = "",
      notes = "",
    } = req.body;

    // --------------------------------------------------
    // BASIC VALIDATION
    // --------------------------------------------------

    if (!donationDate) {
      return res.status(400).json({
        success: false,
        message: "Donation date is required",
      });
    }

    if (!donorName || !donorName.trim()) {
      return res.status(400).json({
        success: false,
        message: "Donor name is required",
      });
    }

    const donationAmount = Number(amount);

    if (!Number.isFinite(donationAmount) || donationAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Donation amount must be greater than 0",
      });
    }

    if (!["Cash", "Bank", "Online", "Other"].includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment method",
      });
    }

    if (!["Received", "Pending"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid donation status",
      });
    }

    // Validate donorId if provided
    if (
      donorId &&
      !mongoose.Types.ObjectId.isValid(donorId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid donor ID",
      });
    }

    // --------------------------------------------------
    // START TRANSACTION
    // --------------------------------------------------

    session.startTransaction();

    // --------------------------------------------------
    // FIND OR CREATE DONOR
    // --------------------------------------------------

    let donor = null;

    // 1. If donorId is explicitly provided
    if (donorId) {
      donor = await Donor.findById(donorId).session(session);

      if (!donor) {
        throw new Error("Donor not found");
      }
    }

    // 2. Otherwise find donor by email
    if (!donor && donorEmail.trim()) {
      donor = await Donor.findOne({
        email: donorEmail.trim().toLowerCase(),
      }).session(session);
    }

    // 3. Otherwise find donor by phone
    if (!donor && donorPhone.trim()) {
      donor = await Donor.findOne({
        phone: donorPhone.trim(),
      }).session(session);
    }

    // 4. Otherwise find donor by exact name
    if (!donor) {
      donor = await Donor.findOne({
        name: donorName.trim(),
      }).session(session);
    }

    // --------------------------------------------------
    // CREATE DONOR IF NOT FOUND
    // --------------------------------------------------

    if (!donor) {
      const newDonor = await Donor.create(
        [
          {
            name: donorName.trim(),
            phone: donorPhone.trim(),
            email: donorEmail.trim().toLowerCase(),
            totalDonated:
              mongoose.Types.Decimal128.fromString("0.00"),
            donationCount: 0,
            firstDonationDate: null,
            lastDonationDate: null,
          },
        ],
        { session }
      );

      donor = newDonor[0];
    } else {
      // ------------------------------------------------
      // UPDATE DONOR CONTACT INFORMATION IF PROVIDED
      // ------------------------------------------------

      let donorChanged = false;

      if (
        donorPhone.trim() &&
        donor.phone !== donorPhone.trim()
      ) {
        donor.phone = donorPhone.trim();
        donorChanged = true;
      }

      const normalizedEmail =
        donorEmail.trim().toLowerCase();

      if (
        normalizedEmail &&
        donor.email !== normalizedEmail
      ) {
        donor.email = normalizedEmail;
        donorChanged = true;
      }

      if (donorChanged) {
        await donor.save({ session });
      }
    }

    // --------------------------------------------------
    // CREATE DONATION
    // --------------------------------------------------

    const donationDocuments = await Donation.create(
      [
        {
          donationDate,

          donorId: donor._id,

          // Snapshot of donor information
          donorName: donorName.trim(),
          donorPhone: donorPhone.trim(),
          donorEmail: donorEmail.trim().toLowerCase(),

          amount:
            mongoose.Types.Decimal128.fromString(
              donationAmount.toFixed(2)
            ),

          paymentMethod,
          status,
          referenceNumber: referenceNumber.trim(),
          notes: notes.trim(),

          // Audit user
          createdBy: req.user?.userId || null,
          updatedBy: req.user?.userId || null,
        },
      ],
      { session }
    );

    const createdDonation = donationDocuments[0];

    // --------------------------------------------------
    // UPDATE DONOR SUMMARY
    // ONLY FOR RECEIVED DONATIONS
    // --------------------------------------------------

    if (status === "Received") {
      const currentTotal = Number(
        donor.totalDonated
          ? donor.totalDonated.toString()
          : "0"
      );

      const newTotal =
        currentTotal + donationAmount;

      donor.totalDonated =
        mongoose.Types.Decimal128.fromString(
          newTotal.toFixed(2)
        );

      donor.donationCount =
        Number(donor.donationCount || 0) + 1;

      const donationDateValue =
        new Date(donationDate);

      // First donation date
      if (
        !donor.firstDonationDate ||
        donationDateValue < donor.firstDonationDate
      ) {
        donor.firstDonationDate =
          donationDateValue;
      }

      // Last donation date
      if (
        !donor.lastDonationDate ||
        donationDateValue > donor.lastDonationDate
      ) {
        donor.lastDonationDate =
          donationDateValue;
      }

      await donor.save({ session });
    }

    // --------------------------------------------------
    // PENDING DONATION
    // NO ALLOCATION
    // --------------------------------------------------

    if (status === "Pending") {
      await session.commitTransaction();

      await createAuditLog({
        user: req.user,
        action: "CREATE",
        module: "Donation",
        description: "Created a new pending donation",
        recordId: createdDonation._id,
        metadata: {
          donorName: createdDonation.donorName,
          amount: createdDonation.amount.toString(),
          paymentMethod:
            createdDonation.paymentMethod,
          status: createdDonation.status,
          referenceNumber:
            createdDonation.referenceNumber,
        },
      });

      return res.status(201).json({
        success: true,
        message:
          "Pending donation created successfully. No category allocation was made.",
        data: {
          donation: createdDonation,
          donor: {
            id: donor._id,
            name: donor.name,
            totalDonated: donor.totalDonated,
            donationCount: donor.donationCount,
          },
          allocations: [],
        },
      });
    }

    // --------------------------------------------------
    // RECEIVED DONATION
    // AUTOMATIC CATEGORY ALLOCATION
    // --------------------------------------------------

    const allocations = await allocateDonation(
      createdDonation,
      session
    );

    // --------------------------------------------------
    // COMMIT TRANSACTION
    // --------------------------------------------------

    await session.commitTransaction();

    // --------------------------------------------------
    // AUDIT LOG
    // --------------------------------------------------

    await createAuditLog({
      user: req.user,
      action: "CREATE",
      module: "Donation",
      description: "Created a new received donation",
      recordId: createdDonation._id,
      metadata: {
        donorName: createdDonation.donorName,
        amount: createdDonation.amount.toString(),
        paymentMethod:
          createdDonation.paymentMethod,
        status: createdDonation.status,
        referenceNumber:
          createdDonation.referenceNumber,
      },
    });

    // --------------------------------------------------
    // RESPONSE
    // --------------------------------------------------

    return res.status(201).json({
      success: true,
      message:
        "Donation created and allocated successfully",

      data: {
        donation: createdDonation,

        donor: {
          id: donor._id,
          name: donor.name,
          phone: donor.phone,
          email: donor.email,
          totalDonated: donor.totalDonated,
          donationCount: donor.donationCount,
          firstDonationDate:
            donor.firstDonationDate,
          lastDonationDate:
            donor.lastDonationDate,
        },

        allocations,
      },
    });
  } catch (error) {
    // --------------------------------------------------
    // ROLLBACK TRANSACTION
    // --------------------------------------------------

    await session.abortTransaction();

    console.error(
      "Create donation error:",
      error
    );

    return res.status(400).json({
      success: false,
      message:
        error.message ||
        "Failed to create donation",
    });
  } finally {
    await session.endSession();
  }
};

// ======================================================
// GET DONATIONS - SEARCH / FILTER / PAGINATION
// ======================================================
const getDonations = async (req, res) => {
  try {
    console.log("DONATION QUERY:", req.query);

    const {
      search = "",
      status,
      paymentMethod,
      startDate,
      endDate,
      minAmount,
      maxAmount,
      page = 1,
      limit = 20,
    } = req.query;

    // --------------------------------------------------
    // PAGINATION
    // --------------------------------------------------

    const currentPage = Math.max(
      Number(page) || 1,
      1
    );

    const perPage = Math.min(
      Math.max(Number(limit) || 20, 1),
      100
    );

    const skip =
      (currentPage - 1) * perPage;

    // --------------------------------------------------
    // BUILD FILTER
    // --------------------------------------------------

    const filter = {};

    // --------------------------------------------------
    // SEARCH
    // --------------------------------------------------

    if (search.trim()) {
      const searchRegex = new RegExp(
        search.trim(),
        "i"
      );

      filter.$or = [
        { donorName: searchRegex },
        { donorPhone: searchRegex },
        { donorEmail: searchRegex },
        { referenceNumber: searchRegex },
      ];
    }

    // --------------------------------------------------
    // STATUS FILTER
    // --------------------------------------------------

    if (status) {
      if (
        !["Received", "Pending"].includes(status)
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid donation status",
        });
      }

      filter.status = status;
    }

    // --------------------------------------------------
    // PAYMENT METHOD FILTER
    // --------------------------------------------------

    if (paymentMethod) {
      if (
        !["Cash", "Bank", "Online", "Other"].includes(
          paymentMethod
        )
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid payment method",
        });
      }

      filter.paymentMethod = paymentMethod;
    }

    // --------------------------------------------------
    // DATE FILTER
    // --------------------------------------------------

    if (startDate || endDate) {
      filter.donationDate = {};

      if (startDate) {
        const start = new Date(startDate);

        if (Number.isNaN(start.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid start date",
          });
        }

        start.setHours(0, 0, 0, 0);

        filter.donationDate.$gte = start;
      }

      if (endDate) {
        const end = new Date(endDate);

        if (Number.isNaN(end.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid end date",
          });
        }

        end.setHours(23, 59, 59, 999);

        filter.donationDate.$lte = end;
      }
    }

    // --------------------------------------------------
    // AMOUNT FILTER
    // --------------------------------------------------

    if (minAmount !== undefined) {
      const minimum = Number(minAmount);

      if (
        !Number.isFinite(minimum) ||
        minimum < 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid minimum amount",
        });
      }

      filter.amount = {
        ...(filter.amount || {}),
        $gte:
          mongoose.Types.Decimal128.fromString(
            minimum.toFixed(2)
          ),
      };
    }

    if (maxAmount !== undefined) {
      const maximum = Number(maxAmount);

      if (
        !Number.isFinite(maximum) ||
        maximum < 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid maximum amount",
        });
      }

      filter.amount = {
        ...(filter.amount || {}),
        $lte:
          mongoose.Types.Decimal128.fromString(
            maximum.toFixed(2)
          ),
      };
    }

    // --------------------------------------------------
    // GET DATA + TOTAL COUNT
    // --------------------------------------------------

    const [donations, totalRecords] =
      await Promise.all([
        Donation.find(filter)
          .populate(
            "donorId",
            "name phone email totalDonated donationCount firstDonationDate lastDonationDate"
          )
          .sort({
            donationDate: -1,
            createdAt: -1,
          })
          .skip(skip)
          .limit(perPage),

        Donation.countDocuments(filter),
      ]);

    const totalPages =
      Math.ceil(totalRecords / perPage);

    // --------------------------------------------------
    // RESPONSE
    // --------------------------------------------------

    return res.status(200).json({
      success: true,

      pagination: {
        currentPage,
        perPage,
        totalRecords,
        totalPages,
        hasNextPage:
          currentPage < totalPages,
        hasPreviousPage:
          currentPage > 1,
      },

      filters: {
        search: search.trim(),
        status: status || null,
        paymentMethod:
          paymentMethod || null,
        startDate: startDate || null,
        endDate: endDate || null,
        minAmount:
          minAmount !== undefined
            ? Number(minAmount)
            : null,
        maxAmount:
          maxAmount !== undefined
            ? Number(maxAmount)
            : null,
      },

      count: donations.length,
      data: donations,
    });
  } catch (error) {
    console.error(
      "Get donations error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to fetch donations",
      error: error.message,
    });
  }
};

// ======================================================
// UPDATE DONATION STATUS
// PENDING -> RECEIVED
// ======================================================
const updateDonationStatus = async (
  req,
  res
) => {
  const session = await mongoose.startSession();

  try {
    const { id } = req.params;
    const { status } = req.body;

    // --------------------------------------------------
    // VALIDATE DONATION ID
    // --------------------------------------------------

    if (
      !mongoose.Types.ObjectId.isValid(id)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid donation ID",
      });
    }

    // --------------------------------------------------
    // VALIDATE STATUS
    // --------------------------------------------------

    if (
      !["Received", "Pending"].includes(status)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid donation status",
      });
    }

    // --------------------------------------------------
    // START TRANSACTION
    // --------------------------------------------------

    session.startTransaction();

    // --------------------------------------------------
    // FIND DONATION
    // --------------------------------------------------

    const donation =
      await Donation.findById(id).session(
        session
      );

    if (!donation) {
      throw new Error("Donation not found");
    }

    // --------------------------------------------------
    // NO CHANGE
    // --------------------------------------------------

    if (donation.status === status) {
      await session.commitTransaction();

      return res.status(200).json({
        success: true,
        message: `Donation is already ${status}`,
        data: {
          donation,
        },
      });
    }

    // --------------------------------------------------
    // CURRENT MVP RULE:
    // ONLY ALLOW PENDING -> RECEIVED
    // --------------------------------------------------

    if (
      donation.status === "Received" &&
      status === "Pending"
    ) {
      throw new Error(
        "Received donation cannot be changed back to Pending."
      );
    }

    // --------------------------------------------------
    // FIND DONOR
    // --------------------------------------------------

    const donor =
      await Donor.findById(
        donation.donorId
      ).session(session);

    if (!donor) {
      throw new Error(
        "Donor associated with this donation was not found."
      );
    }

    // --------------------------------------------------
    // CHANGE STATUS
    // --------------------------------------------------

    donation.status = "Received";
    donation.updatedBy =
      req.user?.userId || null;

    await donation.save({ session });

    // --------------------------------------------------
    // UPDATE DONOR SUMMARY
    // --------------------------------------------------

    const currentTotal = Number(
      donor.totalDonated
        ? donor.totalDonated.toString()
        : "0"
    );

    const donationAmount = Number(
      donation.amount.toString()
    );

    const newTotal =
      currentTotal + donationAmount;

    donor.totalDonated =
      mongoose.Types.Decimal128.fromString(
        newTotal.toFixed(2)
      );

    donor.donationCount =
      Number(donor.donationCount || 0) + 1;

    const donationDateValue =
      new Date(donation.donationDate);

    // --------------------------------------------------
    // FIRST DONATION DATE
    // --------------------------------------------------

    if (
      !donor.firstDonationDate ||
      donationDateValue <
        donor.firstDonationDate
    ) {
      donor.firstDonationDate =
        donationDateValue;
    }

    // --------------------------------------------------
    // LAST DONATION DATE
    // --------------------------------------------------

    if (
      !donor.lastDonationDate ||
      donationDateValue >
        donor.lastDonationDate
    ) {
      donor.lastDonationDate =
        donationDateValue;
    }

    await donor.save({ session });

    // --------------------------------------------------
    // CHECK FOR EXISTING ALLOCATION
    // --------------------------------------------------

    const Allocation =
      require("../models/allocation");

    const existingAllocation =
      await Allocation.findOne({
        donationId: donation._id,
      }).session(session);

    if (existingAllocation) {
      throw new Error(
        "This donation already has category allocations."
      );
    }

    // --------------------------------------------------
    // AUTOMATIC CATEGORY ALLOCATION
    // --------------------------------------------------

    const allocations =
      await allocateDonation(
        donation,
        session
      );

    // --------------------------------------------------
    // COMMIT TRANSACTION
    // --------------------------------------------------

    await session.commitTransaction();

    // --------------------------------------------------
    // AUDIT LOG
    // --------------------------------------------------

    await createAuditLog({
      user: req.user,
      action: "UPDATE",
      module: "Donation",
      description:
        "Converted pending donation to received",
      recordId: donation._id,
      metadata: {
        donorName: donation.donorName,
        amount:
          donation.amount.toString(),
        previousStatus: "Pending",
        newStatus: "Received",
        referenceNumber:
          donation.referenceNumber,
      },
    });

    // --------------------------------------------------
    // SUCCESS RESPONSE
    // --------------------------------------------------

    return res.status(200).json({
      success: true,

      message:
        "Pending donation changed to Received and allocated successfully",

      data: {
        donation,

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

        allocations,
      },
    });
  } catch (error) {
    // --------------------------------------------------
    // ROLLBACK
    // --------------------------------------------------

    await session.abortTransaction();

    console.error(
      "Update donation status error:",
      error
    );

    return res.status(400).json({
      success: false,
      message:
        error.message ||
        "Failed to update donation status",
    });
  } finally {
    await session.endSession();
  }
};

// ======================================================
// GET DONATION BY ID
// ======================================================
const getDonationById = async (
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
        message: "Invalid donation ID",
      });
    }

    const donation =
      await Donation.findById(id).populate(
        "donorId",
        "name phone email totalDonated donationCount firstDonationDate lastDonationDate"
      );

    if (!donation) {
      return res.status(404).json({
        success: false,
        message: "Donation not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: donation,
    });
  } catch (error) {
    console.error(
      "Get donation by ID error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to fetch donation",
      error: error.message,
    });
  }
};

// ======================================================
// CONVERT PENDING DONATION TO RECEIVED
// ======================================================
const convertPendingDonationToReceived =
  async (req, res) => {
    const session =
      await mongoose.startSession();

    try {
      const { id } = req.params;

      if (
        !mongoose.Types.ObjectId.isValid(id)
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid donation ID",
        });
      }

      session.startTransaction();

      // --------------------------------------------------
      // FIND DONATION
      // --------------------------------------------------

      const donation =
        await Donation.findById(id).session(
          session
        );

      if (!donation) {
        throw new Error(
          "Donation not found"
        );
      }

      // --------------------------------------------------
      // CHECK CURRENT STATUS
      // --------------------------------------------------

      if (donation.status === "Received") {
        throw new Error(
          "This donation has already been converted to Received."
        );
      }

      if (donation.status !== "Pending") {
        throw new Error(
          "Only Pending donations can be converted."
        );
      }

      // --------------------------------------------------
      // FIND DONOR
      // --------------------------------------------------

      let donor = null;

      if (donation.donorId) {
        donor =
          await Donor.findById(
            donation.donorId
          ).session(session);
      }

      if (
        !donor &&
        donation.donorEmail
      ) {
        donor =
          await Donor.findOne({
            email: donation.donorEmail,
          }).session(session);
      }

      if (
        !donor &&
        donation.donorPhone
      ) {
        donor =
          await Donor.findOne({
            phone: donation.donorPhone,
          }).session(session);
      }

      if (!donor) {
        donor =
          await Donor.findOne({
            name: donation.donorName,
          }).session(session);
      }

      // --------------------------------------------------
      // CREATE DONOR IF NOT FOUND
      // --------------------------------------------------

      if (!donor) {
        const newDonors =
          await Donor.create(
            [
              {
                name: donation.donorName,
                phone:
                  donation.donorPhone ||
                  "",
                email:
                  donation.donorEmail ||
                  "",
                totalDonated:
                  mongoose.Types.Decimal128.fromString(
                    "0.00"
                  ),
                donationCount: 0,
                firstDonationDate:
                  null,
                lastDonationDate:
                  null,
              },
            ],
            { session }
          );

        donor = newDonors[0];
      }

      // --------------------------------------------------
      // UPDATE DONATION STATUS
      // --------------------------------------------------

      donation.status = "Received";
      donation.donorId = donor._id;
      donation.updatedBy =
        req.user?.userId || null;

      await donation.save({ session });

      // --------------------------------------------------
      // UPDATE DONOR SUMMARY
      // --------------------------------------------------

      const donationAmount = Number(
        donation.amount.toString()
      );

      const currentTotal = Number(
        donor.totalDonated
          ? donor.totalDonated.toString()
          : "0"
      );

      donor.totalDonated =
        mongoose.Types.Decimal128.fromString(
          (
            currentTotal +
            donationAmount
          ).toFixed(2)
        );

      donor.donationCount =
        Number(donor.donationCount || 0) +
        1;

      const donationDateValue =
        new Date(
          donation.donationDate
        );

      if (
        !donor.firstDonationDate ||
        donationDateValue <
          donor.firstDonationDate
      ) {
        donor.firstDonationDate =
          donationDateValue;
      }

      if (
        !donor.lastDonationDate ||
        donationDateValue >
          donor.lastDonationDate
      ) {
        donor.lastDonationDate =
          donationDateValue;
      }

      await donor.save({ session });

      // --------------------------------------------------
      // AUTOMATIC CATEGORY ALLOCATION
      // --------------------------------------------------

      const allocations =
        await allocateDonation(
          donation,
          session
        );

      // --------------------------------------------------
      // COMMIT TRANSACTION
      // --------------------------------------------------

      await session.commitTransaction();

      // --------------------------------------------------
      // AUDIT LOG
      // --------------------------------------------------

      await createAuditLog({
        user: req.user,
        action: "UPDATE",
        module: "Donation",
        description:
          "Converted pending donation to received",
        recordId: donation._id,
        metadata: {
          donorName:
            donation.donorName,
          amount:
            donation.amount.toString(),
          previousStatus: "Pending",
          newStatus: "Received",
          referenceNumber:
            donation.referenceNumber,
        },
      });

      return res.status(200).json({
        success: true,
        message:
          "Pending donation converted to Received successfully and category allocation completed.",
        data: {
          donation,

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

          allocations,
        },
      });
    } catch (error) {
      await session.abortTransaction();

      console.error(
        "Convert pending donation error:",
        error
      );

      return res.status(400).json({
        success: false,
        message:
          error.message ||
          "Failed to convert pending donation",
      });
    } finally {
      await session.endSession();
    }
  };

// ======================================================
// EXPORTS
// ======================================================
module.exports = {
  createDonation,
  getDonations,
  getDonationById,
  updateDonationStatus,
  convertPendingDonationToReceived,
};