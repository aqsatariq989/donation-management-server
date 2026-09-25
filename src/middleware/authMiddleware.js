const jwt = require("jsonwebtoken");

// ==================================================
// VERIFY JWT TOKEN
// ==================================================

const protect = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    // Check Authorization header
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Expected format:
    // Authorization: Bearer TOKEN
    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message:
          "Invalid authorization format. Use Bearer token.",
      });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication token is missing",
      });
    }

    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      console.error(
        "JWT_SECRET is missing from .env"
      );

      return res.status(500).json({
        success: false,
        message:
          "Authentication configuration is missing",
      });
    }

    // Verify token
    const decoded = jwt.verify(
      token,
      jwtSecret
    );

    // Attach authenticated user information
    req.user = {
      userId: decoded.userId,
      role: decoded.role,
      email: decoded.email,
    };

    next();
  } catch (error) {
    console.error(
      "Authentication middleware error:",
      error.message
    );

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Authentication token has expired",
      });
    }

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Invalid authentication token",
      });
    }

    return res.status(401).json({
      success: false,
      message: "Authentication failed",
    });
  }
};

// ==================================================
// ADMIN ONLY
// ==================================================

const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  if (req.user.role !== "Admin") {
    return res.status(403).json({
      success: false,
      message:
        "Admin access required",
    });
  }

  next();
};

// ==================================================
// ADMIN OR STAFF
// ==================================================

const requireStaffOrAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  if (
    !["Admin", "Staff"].includes(
      req.user.role
    )
  ) {
    return res.status(403).json({
      success: false,
      message: "Access denied",
    });
  }

  next();
};

module.exports = {
  protect,
  requireAdmin,
  requireStaffOrAdmin,
};