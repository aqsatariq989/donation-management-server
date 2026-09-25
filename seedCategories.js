const mongoose = require("mongoose");
require("dotenv").config();

const Category = require("./src/models/category");

const categories = [
  {
    name: "Education / Students",
    allocationPercentage: 14.285714,
    openingBalance: 0,
    sortOrder: 1,
  },
  {
    name: "Widows",
    allocationPercentage: 14.285714,
    openingBalance: 0,
    sortOrder: 2,
  },
  {
    name: "Orphans",
    allocationPercentage: 14.285714,
    openingBalance: 0,
    sortOrder: 3,
  },
  {
    name: "Mosques",
    allocationPercentage: 14.285714,
    openingBalance: 0,
    sortOrder: 4,
  },
  {
    name: "Hospitals / Medical Assistance",
    allocationPercentage: 14.285714,
    openingBalance: 0,
    sortOrder: 5,
  },
  {
    name: "Graveyards / Cemetery",
    allocationPercentage: 14.285714,
    openingBalance: 0,
    sortOrder: 6,
  },
  {
    name: "Other Community Welfare",
    allocationPercentage: 14.285716,
    openingBalance: 0,
    sortOrder: 7,
  },
];

async function seedCategories() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    console.log("MongoDB connected successfully");

    await Category.deleteMany({});

    const result = await Category.insertMany(categories);

    console.log(`${result.length} categories added successfully`);

    console.log(result);

    await mongoose.connection.close();

    console.log("Database connection closed");
  } catch (error) {
    console.error("Seed failed:", error.message);
    process.exit(1);
  }
}

seedCategories();