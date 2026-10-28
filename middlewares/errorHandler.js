// Єдиний формат помилок API: { success: false, message, ... }.
// Роути кидають HttpError (utils/http.js) або помилки Mongoose, а тут вони
// перетворюються на відповідь з потрібним статусом. Деталі 500-х помилок
// пишуться в лог, але не віддаються клієнту.

const mongoose = require("mongoose");
const { HttpError } = require("../utils/http");

// Обробник помилок Express (саме 4 аргументи — так Express його розпізнає)
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res
      .status(err.status)
      .json({ success: false, message: err.message, ...err.extra });
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const first = Object.values(err.errors)[0];
    return res.status(400).json({
      success: false,
      message: first?.message || "Некоректні дані",
    });
  }

  if (err instanceof mongoose.Error.CastError) {
    return res
      .status(400)
      .json({ success: false, message: `Некоректне значення поля ${err.path}` });
  }

  if (err?.code === 11000) {
    return res
      .status(409)
      .json({ success: false, message: "Такий запис уже існує" });
  }

  // Запис змінив хтось інший між читанням і збереженням (optimisticConcurrency у Student)
  if (err instanceof mongoose.Error.VersionError) {
    return res.status(409).json({
      success: false,
      message: "Дані щойно змінив інший користувач. Оновіть сторінку й повторіть зміни.",
    });
  }

  // Помилки розбору тіла запиту (express.json)
  if (err?.type === "entity.parse.failed") {
    return res
      .status(400)
      .json({ success: false, message: "Некоректний JSON у запиті" });
  }

  if (err?.type === "entity.too.large") {
    return res
      .status(413)
      .json({ success: false, message: "Запит завеликий" });
  }

  if (err?.expose && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ success: false, message: err.message });
  }

  console.error(`[${req.method} ${req.originalUrl}]`, err);
  return res
    .status(500)
    .json({ success: false, message: "Внутрішня помилка сервера" });
}

// Відповідь для невідомого маршруту
function notFoundHandler(req, res) {
  res.status(404).json({ success: false, message: "Маршрут не знайдено" });
}

module.exports = { errorHandler, notFoundHandler };
