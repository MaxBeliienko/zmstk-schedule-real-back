// Express-застосунок: middleware, підключення всіх маршрутів API та обробка помилок.
// Без підключення до БД і без listen(): сервер запускає server.js, а тести
// (tests/) викликають застосунок напряму через supertest.

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const mongoose = require("mongoose");
const swaggerUi = require("swagger-ui-express");
const openApiSpec = require("./docs/openapi");
const sanitize = require("./middlewares/sanitize");
const { errorHandler, notFoundHandler } = require("./middlewares/errorHandler");

// Перевірка обов'язкових секретів: без них модулі кидають помилку і сервер не стартує
require("./config/jwt");
require("./config/passwords");

const app = express();

// Кількість проксі перед сервером (Render — 1). Від цього залежить req.ip,
// а отже й ліміт невдалих спроб входу (routes/auth.js)
app.set("trust proxy", Number(process.env.TRUST_PROXY || 0));

// Захисні HTTP-заголовки
app.use(helmet());

// Домени фронтенду, яким дозволено звертатися до API (CORS_ORIGIN через кому)
const allowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

if (allowedOrigins.length === 0 && process.env.NODE_ENV !== "test") {
  console.warn(
    "⚠️  CORS_ORIGIN не задано — API приймає запити з будь-якого домену."
  );
}

app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
  })
);

// Розбір JSON у тілі запиту та очищення від NoSQL-операторів (middlewares/sanitize.js)
app.use(express.json({ limit: "200kb" }));
app.use(sanitize);

// Маршрути API. Кожен модуль у routes/ сам перевіряє авторизацію та ролі
app.use("/api/config", require("./routes/config"));
app.use("/api/auth", require("./routes/auth"));
app.use("/api/accounts", require("./routes/accounts"));
app.use("/api/vehicles", require("./routes/vehicles"));
app.use("/api/instructors", require("./routes/instructors"));
app.use("/api/schedule", require("./routes/schedule"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/reminders", require("./routes/reminders"));

// Перевірка стану для хостингу (Render: Health Check Path = /health).
// ip — адреса клієнта, як її бачить сервер; допомагає налаштувати TRUST_PROXY
app.get("/health", (req, res) => {
  const dbReady = mongoose.connection.readyState === 1;
  res.status(dbReady ? 200 : 503).json({ status: dbReady ? "ok" : "db-unavailable", ip: req.ip });
});

// Документація API (Swagger UI): /api/docs; опис маршрутів — docs/openapi.js
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec, { customSiteTitle: "ZMSTK API" }));
app.get("/api/docs.json", (req, res) => res.json(openApiSpec));

app.get("/", (req, res) => {
  res.send("API Автошколи працює!");
});

// Невідомі маршрути та єдиний формат помилок (middlewares/errorHandler.js)
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
