const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const User = require("./src/models/user");

const resetAdminPassword = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing from .env");
    }

    if (!process.env.ADMIN_EMAIL) {
      throw new Error("ADMIN_EMAIL is missing from .env");
    }

    if (!process.env.ADMIN_PASSWORD) {
      throw new Error("ADMIN_PASSWORD is missing from .env");
    }

    if (process.env.ADMIN_PASSWORD.length < 6) {
      throw new Error(
        "ADMIN_PASSWORD must be at least 6 characters"
      );
    }

    await mongoose.connect(process.env.MONGODB_URI);

    console.log("MongoDB connected successfully");

    const email = process.env.ADMIN_EMAIL
      .trim()
      .toLowerCase();

    const admin = await User.findOne({
      email,
      role: "Admin",
    });

    if (!admin) {
      console.log("Admin user not found.");
      await mongoose.disconnect();
      return;
    }

    const hashedPassword = await bcrypt.hash(
      process.env.ADMIN_PASSWORD,
      12
    );

    admin.password = hashedPassword;
    admin.isActive = true;

    await admin.save();

    console.log("Admin password reset successfully.");
    console.log(`Admin Email: ${admin.email}`);
    console.log(`Role: ${admin.role}`);

    await mongoose.disconnect();

    console.log("MongoDB disconnected.");
  } catch (error) {
    console.error(
      "Admin password reset error:",
      error.message
    );

    try {
      await mongoose.disconnect();
    } catch (disconnectError) {
      // Ignore disconnect errors
    }

    process.exit(1);
  }
};

resetAdminPassword();