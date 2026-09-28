const mongoose = require("mongoose");

// Розподілене блокування через MongoDB: запис з унікальним _id = ключ
// блокування. Працює однаково для одного й кількох інстансів сервера.
// expiresAt — страховка на випадок падіння процесу посеред операції
// (TTL-індекс прибирає "завислі" блокування).
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
