require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const mongoose = require("mongoose");
const connectDB = require("./config/db");
const sanitize = require("./middlewares/sanitize");
const { errorHandler, notFoundHandler } = require("./middlewares/errorHandler");
const { runMigrations } = require("./migrations");

// Перевіряємо секрет одразу при старті (кидає помилку, якщо його немає)
require("./config/jwt");

const app = express();

// Кількість проксі перед сервером (Cloud Run / Render / Railway — зазвичай 1).
// За замовчуванням 0: без проксі довіряти X-Forwarded-For не можна — інакше
// клієнт підставить будь-який IP і обійде ліміт спроб входу.
// УВАГА: якщо сервер працює за проксі, задайте TRUST_PROXY=1, інакше всі
// користувачі матимуть спільний ліміт (IP проксі).
app.set("trust proxy", Number(process.env.TRUST_PROXY || 0));

app.use(helmet());

// CORS: дозволені домени фронтенду через кому в CORS_ORIGIN, напр.
// CORS_ORIGIN=https://zmstk.vercel.app,http://localhost:5173
// Якщо змінну не задано — дозволяємо всі домени (як раніше) і попереджаємо.
const allowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

if (allowedOrigins.length === 0) {
  console.warn(
    "⚠️  CORS_ORIGIN не задано — API приймає запити з будь-якого домену."
  );
}

app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
  })
);

app.use(express.json({ limit: "200kb" }));
app.use(sanitize);

// Підключення роутів
app.use("/api/auth", require("./routes/auth"));
app.use("/api/vehicles", require("./routes/vehicles"));
app.use("/api/instructors", require("./routes/instructors"));
app.use("/api/schedule", require("./routes/schedule"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/reminders", require("./routes/reminders"));

// Health check для Render (Settings → Health Check Path: /health).
// ip — адреса клієнта, як її бачить сервер: має збігатися з вашою реальною
// IP-адресою (інакше неправильно налаштовано TRUST_PROXY)
app.get("/health", (req, res) => {
  const dbReady = mongoose.connection.readyState === 1;
  res.status(dbReady ? 200 : 503).json({ status: dbReady ? "ok" : "db-unavailable", ip: req.ip });
});

app.get("/", (req, res) => {
  res.send("API Автошколи працює!");
});

app.use(notFoundHandler);
app.use(errorHandler);

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
