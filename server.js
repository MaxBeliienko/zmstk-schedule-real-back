// Точка входу сервера: підключення до MongoDB, міграції даних і запуск HTTP-сервера.

require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("./config/db");
const { runMigrations } = require("./migrations");
const app = require("./app");

const PORT = process.env.PORT || 8080;

// Запускає сервер. Міграції (migrations/index.js) виконуються до прийому запитів
async function start() {
  await connectDB();

  await runMigrations();

  const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

  // Коректна зупинка (Render надсилає SIGTERM при редеплої): дочікуємось
  // активних запитів, закриваємо БД; через 10 с — примусовий вихід
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
