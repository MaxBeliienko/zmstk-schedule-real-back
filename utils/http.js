const mongoose = require("mongoose");

// Помилка з HTTP-статусом: кидаємо її в роутах, а відповідь формує
// єдиний errorHandler (middlewares/errorHandler.js)
class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const badRequest = (message, extra) => new HttpError(400, message, extra);
const forbidden = (message = "Недостатньо прав для цієї дії") =>
  new HttpError(403, message);
const notFound = (message = "Запис не знайдено") => new HttpError(404, message);
const conflict = (message) => new HttpError(409, message);

// Обгортка для async-роутів: будь-який throw/reject потрапляє в errorHandler
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const isObjectId = (value) =>
  typeof value === "string" && mongoose.isValidObjectId(value) && /^[a-f\d]{24}$/i.test(value);

// Екранує спецсимволи регулярних виразів у тексті пошуку, щоб
// "Іванов (А)" шукався буквально і не ламав запит / не давав ReDoS
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Повертає рядок або undefined — захист від того, що в query/body
// прийде масив чи об'єкт замість рядка
const asString = (value) => (typeof value === "string" ? value : undefined);

module.exports = {
  HttpError,
  badRequest,
  forbidden,
  notFound,
  conflict,
  asyncHandler,
  isObjectId,
  escapeRegex,
  asString,
};
