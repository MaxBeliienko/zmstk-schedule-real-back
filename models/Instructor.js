const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const instructorSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  pinCode: { type: String, required: true },
  certificate: [{ type: String }],
  // Документи інструктора: "дійсне до" (YYYY-MM-DD, "" — не вказано).
  // Для кожної дати автоматично створюється нагадування (utils/systemReminderSync.js)
  medicalExamUntil: { type: String, default: "" },
  sanitaryBookUntil: { type: String, default: "" },
  // Версія токенів: збільшується при зміні PIN — усі видані раніше токени
  // інструктора перестають працювати (authMiddleware звіряє версію)
  tokenVersion: { type: Number, default: 0 },
  // Захист від перебору PIN: лічильник невдалих спроб і тимчасове блокування
  failedLoginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date, default: null },
});

const isBcryptHash = (value) =>
  typeof value === "string" && /^\$2[aby]\$/.test(value);

instructorSchema.pre("save", async function (next) {
  if (this.isModified("pinCode")) {
    if (!isBcryptHash(this.pinCode)) {
      this.pinCode = await bcrypt.hash(this.pinCode, 10);
    }
    // Новий PIN = нова версія токенів. Виняток — лінива міграція
    // plaintext -> bcrypt (PIN той самий, сесії відкликати не треба)
    if (!this.isNew && !this.$locals.keepTokenVersion) {
      this.tokenVersion = (this.tokenVersion || 0) + 1;
    }
  }
  next();
});

instructorSchema.statics.isBcryptHash = isBcryptHash;

module.exports = mongoose.model("Instructor", instructorSchema);
