const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const User = require("../models/user");
const { createAuditLog } = require("../services/auditLogService");

// ======================================================
// HELPER
// ======================================================

const sanitizeUser = (user) => {
  const obj = user.toObject ? user.toObject() : { ...user };

  delete obj.password;

  return obj;
};

const getUserId = (req) => {
  return req.user?._id || req.user?.id || null;
};

// ======================================================
// GET ALL USERS
// GET /api/users
// ADMIN ONLY
// ======================================================

const getUsers = async (req, res) => {
  try {
    const {
      search = "",
      role,
      status,
      page = 1,
      limit = 20,
    } = req.query;

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

    const filter = {};

    // --------------------------------------------------
    // SEARCH
    // --------------------------------------------------

    if (search.trim()) {
      const regex = new RegExp(
        search.trim(),
        "i"
      );

      filter.$or = [
        { name: regex },
        { email: regex },
      ];
    }

    // --------------------------------------------------
    // ROLE
    // --------------------------------------------------

    if (role) {
      if (!["Admin", "Staff"].includes(role)) {
        return res.status(400).json({
          success: false,
          message: "Invalid user role",
        });
      }

      filter.role = role;
    }

    // --------------------------------------------------
    // STATUS
    // --------------------------------------------------

    if (status !== undefined && status !== "") {
      if (
        !["active", "inactive"].includes(
          String(status).toLowerCase()
        )
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid user status",
        });
      }

      filter.isActive =
        String(status).toLowerCase() ===
        "active";
    }

    // --------------------------------------------------
    // QUERY
    // --------------------------------------------------

    const [users, totalRecords] =
      await Promise.all([
        User.find(filter)
          .select("-password")
          .sort({
            createdAt: -1,
          })
          .skip(skip)
          .limit(perPage)
          .lean(),

        User.countDocuments(filter),
      ]);

    const totalPages = Math.max(
      1,
      Math.ceil(
        totalRecords / perPage
      )
    );

    return res.status(200).json({
      success: true,
      data: users,
      pagination: {
        page: currentPage,
        limit: perPage,
        totalRecords,
        totalPages,
      },
    });
  } catch (error) {
    console.error(
      "Get users error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to fetch users",
    });
  }
};

// ======================================================
// GET SINGLE USER
// GET /api/users/:id
// ADMIN ONLY
// ======================================================

const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(id)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    const user = await User.findById(id)
      .select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error(
      "Get user error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to fetch user",
    });
  }
};

// ======================================================
// CREATE USER
// POST /api/users
// ADMIN ONLY
// ======================================================

const createUser = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      role = "Staff",
      isActive = true,
    } = req.body;

    // --------------------------------------------------
    // VALIDATION
    // --------------------------------------------------

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Name is required",
      });
    }

    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Password is required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message:
          "Password must be at least 6 characters",
      });
    }

    if (!["Admin", "Staff"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user role",
      });
    }

    // --------------------------------------------------
    // EMAIL
    // --------------------------------------------------

    const normalizedEmail =
      email.trim().toLowerCase();

    const existingUser =
      await User.findOne({
        email: normalizedEmail,
      });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message:
          "A user with this email already exists",
      });
    }

    // --------------------------------------------------
    // HASH PASSWORD
    // --------------------------------------------------

    const hashedPassword =
      await bcrypt.hash(password, 12);

    // --------------------------------------------------
    // CREATE
    // --------------------------------------------------

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role,
      isActive:
        typeof isActive === "boolean"
          ? isActive
          : true,
    });

    // --------------------------------------------------
    // AUDIT
    // --------------------------------------------------

    try {
      await createAuditLog({
        user: req.user,
        action: "CREATE",
        module: "User",
        description: `Created user ${user.name}`,
        recordId: user._id,
        metadata: {
          name: user.name,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
        },
      });
    } catch (auditError) {
      console.error(
        "User create audit error:",
        auditError.message
      );
    }

    return res.status(201).json({
      success: true,
      message: "User created successfully",
      data: sanitizeUser(user),
    });
  } catch (error) {
    console.error(
      "Create user error:",
      error
    );

    // Mongo duplicate email
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          "A user with this email already exists",
      });
    }

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to create user",
    });
  }
};

// ======================================================
// UPDATE USER
// PUT /api/users/:id
// ADMIN ONLY
// ======================================================

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      name,
      email,
      role,
      isActive,
    } = req.body;

    if (
      !mongoose.Types.ObjectId.isValid(id)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    const user =
      await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // --------------------------------------------------
    // PREVENT SELF DEACTIVATION
    // --------------------------------------------------

    const currentUserId =
      getUserId(req)?.toString();

    if (
      String(id) === currentUserId &&
      isActive === false
    ) {
      return res.status(400).json({
        success: false,
        message:
          "You cannot deactivate your own account",
      });
    }

    // --------------------------------------------------
    // PREVENT SELF ROLE CHANGE
    // --------------------------------------------------

    if (
      String(id) === currentUserId &&
      role &&
      role !== user.role
    ) {
      return res.status(400).json({
        success: false,
        message:
          "You cannot change your own role",
      });
    }

    // --------------------------------------------------
    // VALIDATE ROLE
    // --------------------------------------------------

    if (
      role !== undefined &&
      !["Admin", "Staff"].includes(role)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid user role",
      });
    }

    // --------------------------------------------------
    // VALIDATE NAME
    // --------------------------------------------------

    if (
      name !== undefined &&
      !String(name).trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Name cannot be empty",
      });
    }

    // --------------------------------------------------
    // VALIDATE EMAIL
    // --------------------------------------------------

    let normalizedEmail =
      user.email;

    if (email !== undefined) {
      if (!String(email).trim()) {
        return res.status(400).json({
          success: false,
          message:
            "Email cannot be empty",
        });
      }

      normalizedEmail =
        String(email)
          .trim()
          .toLowerCase();

      const duplicate =
        await User.findOne({
          email: normalizedEmail,
          _id: {
            $ne: id,
          },
        });

      if (duplicate) {
        return res.status(409).json({
          success: false,
          message:
            "Another user already uses this email",
        });
      }
    }

    // --------------------------------------------------
    // OLD DATA FOR AUDIT
    // --------------------------------------------------

    const oldData = {
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
    };

    // --------------------------------------------------
    // UPDATE
    // --------------------------------------------------

    if (name !== undefined) {
      user.name =
        String(name).trim();
    }

    if (email !== undefined) {
      user.email =
        normalizedEmail;
    }

    if (role !== undefined) {
      user.role = role;
    }

    if (isActive !== undefined) {
      user.isActive =
        Boolean(isActive);
    }

    await user.save();

    // --------------------------------------------------
    // NEW DATA
    // --------------------------------------------------

    const newData = {
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
    };

    // --------------------------------------------------
    // AUDIT
    // --------------------------------------------------

    try {
      await createAuditLog({
        user: req.user,
        action: "UPDATE",
        module: "User",
        description: `Updated user ${user.name}`,
        recordId: user._id,
        metadata: {
          oldData,
          newData,
        },
      });
    } catch (auditError) {
      console.error(
        "User update audit error:",
        auditError.message
      );
    }

    return res.status(200).json({
      success: true,
      message: "User updated successfully",
      data: sanitizeUser(user),
    });
  } catch (error) {
    console.error(
      "Update user error:",
      error
    );

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          "A user with this email already exists",
      });
    }

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to update user",
    });
  }
};

// ======================================================
// ACTIVATE / DEACTIVATE USER
// PATCH /api/users/:id/status
// ADMIN ONLY
// ======================================================

const updateUserStatus = async (
  req,
  res
) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (
      !mongoose.Types.ObjectId.isValid(id)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    if (
      typeof isActive !== "boolean"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "isActive must be true or false",
      });
    }

    const currentUserId =
      getUserId(req)?.toString();

    // --------------------------------------------------
    // PREVENT SELF DEACTIVATION
    // --------------------------------------------------

    if (
      String(id) === currentUserId &&
      isActive === false
    ) {
      return res.status(400).json({
        success: false,
        message:
          "You cannot deactivate your own account",
      });
    }

    const user =
      await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const oldStatus =
      user.isActive;

    user.isActive =
      isActive;

    await user.save();

    // --------------------------------------------------
    // AUDIT
    // --------------------------------------------------

    try {
      await createAuditLog({
        user: req.user,
        action: "STATUS_CHANGE",
        module: "User",
        description: `${
          isActive
            ? "Activated"
            : "Deactivated"
        } user ${user.name}`,
        recordId: user._id,
        metadata: {
          oldStatus,
          newStatus: isActive,
        },
      });
    } catch (auditError) {
      console.error(
        "User status audit error:",
        auditError.message
      );
    }

    return res.status(200).json({
      success: true,
      message: isActive
        ? "User activated successfully"
        : "User deactivated successfully",
      data: sanitizeUser(user),
    });
  } catch (error) {
    console.error(
      "Update user status error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to update user status",
    });
  }
};

// ======================================================
// RESET USER PASSWORD
// PATCH /api/users/:id/password
// ADMIN ONLY
// ======================================================

const resetUserPassword = async (
  req,
  res
) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (
      !mongoose.Types.ObjectId.isValid(id)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    if (!password) {
      return res.status(400).json({
        success: false,
        message: "New password is required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message:
          "Password must be at least 6 characters",
      });
    }

    const user =
      await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const hashedPassword =
      await bcrypt.hash(password, 12);

    user.password =
      hashedPassword;

    await user.save();

    // --------------------------------------------------
    // AUDIT
    // --------------------------------------------------

    try {
      await createAuditLog({
        user: req.user,
        action: "UPDATE",
        module: "User",
        description: `Password reset for user ${user.name}`,
        recordId: user._id,
        metadata: {
          passwordChanged: true,
        },
      });
    } catch (auditError) {
      console.error(
        "Password audit error:",
        auditError.message
      );
    }

    return res.status(200).json({
      success: true,
      message:
        "User password reset successfully",
    });
  } catch (error) {
    console.error(
      "Reset password error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to reset password",
    });
  }
};

// ======================================================
// DELETE USER
// DELETE /api/users/:id
// ADMIN ONLY
// ======================================================

const deleteUser = async (
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
        message: "Invalid user ID",
      });
    }

    const currentUserId =
      getUserId(req)?.toString();

    // --------------------------------------------------
    // PREVENT SELF DELETE
    // --------------------------------------------------

    if (
      String(id) === currentUserId
    ) {
      return res.status(400).json({
        success: false,
        message:
          "You cannot delete your own account",
      });
    }

    const user =
      await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // --------------------------------------------------
    // PROTECT LAST ACTIVE ADMIN
    // --------------------------------------------------

    if (
      user.role === "Admin" &&
      user.isActive === true
    ) {
      const activeAdminCount =
        await User.countDocuments({
          role: "Admin",
          isActive: true,
        });

      if (activeAdminCount <= 1) {
        return res.status(400).json({
          success: false,
          message:
            "The last active Admin cannot be deleted",
        });
      }
    }

    // --------------------------------------------------
    // DELETE
    // --------------------------------------------------

    const oldData = {
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
    };

    await User.findByIdAndDelete(id);

    // --------------------------------------------------
    // AUDIT
    // --------------------------------------------------

    try {
      await createAuditLog({
        user: req.user,
        action: "DELETE",
        module: "User",
        description: `Deleted user ${user.name}`,
        recordId: user._id,
        metadata: {
          oldData,
        },
      });
    } catch (auditError) {
      console.error(
        "User delete audit error:",
        auditError.message
      );
    }

    return res.status(200).json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    console.error(
      "Delete user error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to delete user",
    });
  }
};

// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  updateUserStatus,
  resetUserPassword,
  deleteUser,
};