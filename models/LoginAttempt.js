const mongoose = require("mongoose");

// Невдалі спроби входу з однієї IP-адреси (_id = "ip:<адреса>").
// Після 10 невдалих спроб вхід з цієї IP блокується (routes/auth.js).
// expiresAt — TTL-індекс: запис зникає сам, коли вікно спроб або блокування минуло.
const loginAttemptSchema = new mongoose.Schema(
  {
    _id: { type: String },
    count: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false }
);

loginAttemptSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("LoginAttempt", loginAttemptSchema);
