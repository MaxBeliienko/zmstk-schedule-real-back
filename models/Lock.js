// Блокування для utils/keyedLock.js: запис з унікальним _id = ключ блокування.
// Працює однаково для одного й кількох інстансів сервера. expiresAt (TTL)
// прибирає "завислі" блокування, якщо процес упав посеред операції.

const mongoose = require("mongoose");

const lockSchema = new mongoose.Schema(
  {
    _id: { type: String },
    owner: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false }
);

lockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("Lock", lockSchema);
