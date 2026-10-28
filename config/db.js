// Підключення до MongoDB (рядок MONGODB_URI з .env).

const mongoose = require("mongoose");

// Підключається до бази; без бази сервер не має сенсу, тож при помилці зупиняється
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
