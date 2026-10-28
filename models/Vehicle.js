// Транспортний засіб (МТБ). Для строків страхування й техогляду автоматично
// створюються нагадування (utils/systemReminderSync.js).

const mongoose = require("mongoose");

const vehicleSchema = new mongoose.Schema({
  brand: { type: String, required: true },
  plateNumber: { type: String, required: true },
  category: [{ type: String, required: true }],
  isTowbar: { type: Boolean, default: false },
  isTrailer: { type: Boolean, default: false },

  // Відповідальний інструктор; його основне авто підставляється в кабінеті
  responsibleInstructorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Instructor",
    default: null,
  },

  // Коли призначено відповідального: якщо авто кілька, основне — призначене першим
  responsibleAssignedAt: { type: Date, default: null },
  insuranceUntil: { type: String, default: "" },
  inspectionUntil: { type: String, default: "" },
});

module.exports = mongoose.model("Vehicle", vehicleSchema);
