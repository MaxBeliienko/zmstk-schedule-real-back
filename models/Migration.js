const mongoose = require("mongoose");

// Журнал виконаних міграцій (одноразових змін даних при старті сервера)
const migrationSchema = new mongoose.Schema(
  {
    _id: { type: String },
    appliedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

module.exports = mongoose.model("Migration", migrationSchema);
