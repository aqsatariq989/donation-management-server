const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const User = require("./src/models/user");

const seedAdmin = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing from .env");
    }

    if (!process.env.ADMIN_NAME) {
      throw new Error("ADMIN_NAME is missing from .env");
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

    const cleanEmail = process.env.ADMIN_EMAIL
      .trim()
      .toLowerCase();

    const existingUser = await User.findOne({
      email: cleanEmail,
    });

    if (existingUser) {
      if (existingUser.role === "Admin") {
        console.log("Admin user already exists.");
      } else {
        console.log(
          "A user with this email already exists and is not an Admin."
        );
      }

      await mongoose.disconnect();
      return;
    }

    const hashedPassword = await bcrypt.hash(
      process.env.ADMIN_PASSWORD,
      12
    );

    const admin = await User.create({
      name: process.env.ADMIN_NAME.trim(),
      email: cleanEmail,
      password: hashedPassword,
      role: "Admin",
      isActive: true,
    });

    console.log("Admin user created successfully.");
    console.log(`Admin ID: ${admin._id}`);
    console.log(`Admin Email: ${admin.email}`);
    console.log(`Role: ${admin.role}`);

    await mongoose.disconnect();
    console.log("MongoDB disconnected.");
  } catch (error) {
    console.error("Admin seed error:", error.message);

    try {
      await mongoose.disconnect();
    } catch (disconnectError) {
      // Ignore disconnect errors
    }

    process.exit(1);
  }
};

seedAdmin();