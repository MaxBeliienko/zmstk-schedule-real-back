const mongoose = require("mongoose");

// Картка інструктора: ПІБ, категорії посвідчення та строки документів.
// Пароль для входу зберігається в окремому обліковому записі (models/Account.js,
// поле instructorId). Для дат документів автоматично створюються нагадування
// в календарі (utils/systemReminderSync.js).
const instructorSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  certificate: [{ type: String }],
  // Дати "дійсне до" у форматі YYYY-MM-DD ("" — не вказано)
  medicalExamUntil: { type: String, default: "" },
  sanitaryBookUntil: { type: String, default: "" },
});

module.exports = mongoose.model("Instructor", instructorSchema);
