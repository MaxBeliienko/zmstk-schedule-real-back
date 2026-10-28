// Допоміжні засоби для роутів: помилки з HTTP-статусом, обгортка async-обробників
// і перевірка вхідних даних.

const mongoose = require("mongoose");

// Помилка з HTTP-статусом: роут кидає її, а відповідь формує middlewares/errorHandler.js.
// extra — додаткові поля відповіді (напр. список конфліктів)
class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

// Скорочення для найчастіших статусів
const badRequest = (message, extra) => new HttpError(400, message, extra);
const forbidden = (message = "Недостатньо прав для цієї дії") =>
  new HttpError(403, message);
const notFound = (message = "Запис не знайдено") => new HttpError(404, message);
const conflict = (message) => new HttpError(409, message);

// Обгортка async-роуту: будь-яка помилка потрапляє в errorHandler
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Чи є рядок коректним id MongoDB (24 hex-символи)
const isObjectId = (value) =>
  typeof value === "string" && mongoose.isValidObjectId(value) && /^[a-f\d]{24}$/i.test(value);

// Екранує спецсимволи, щоб текст пошуку шукався буквально (і без ReDoS)
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Повертає значення, лише якщо це рядок (захист від масивів/об'єктів у запиті)
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
