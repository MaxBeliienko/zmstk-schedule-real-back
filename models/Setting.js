const mongoose = require("mongoose");

// Службові налаштування системи у форматі "ключ -> значення"
// (напр. відбиток PASSWORD_PEPPER, див. migrations/index.js)
const settingSchema = new mongoose.Schema(
  {
    _id: { type: String },
    value: { type: mongoose.Schema.Types.Mixed },
  },
  { versionKey: false }
);

module.exports = mongoose.model("Setting", settingSchema);
