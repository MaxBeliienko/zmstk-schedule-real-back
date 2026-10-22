require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("./config/db");
const { runMigrations } = require("./migrations");
const app = require("./app");

const PORT = process.env.PORT || 8080;

async function start() {
  await connectDB();

  // Одноразові міграції даних (кожна виконується лише раз)
  await runMigrations();

  const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

  // Коректне завершення: дочікуємось активних запитів і закриваємо БД
  const shutdown = (signal) => {
    console.log(`${signal} отримано, зупиняємо сервер...`);
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start();
