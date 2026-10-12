const mongoose = require("mongoose");

// Невдалі спроби входу інструктора з конкретної IP-адреси. Ключ —
// "<ip>|<id інструктора>": блокування діє лише на цю пару, тож чужі
// невдалі спроби (з іншої IP) не заважають інструктору увійти.
// expiresAt — TTL: запис зникає сам, коли вікно спроб / блокування минуло.
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
