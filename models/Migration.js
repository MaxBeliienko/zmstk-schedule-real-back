// Журнал виконаних міграцій даних (migrations/index.js): _id = назва міграції.

const mongoose = require("mongoose");

const migrationSchema = new mongoose.Schema(
  {
    _id: { type: String },
    appliedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

module.exports = mongoose.model("Migration", migrationSchema);
