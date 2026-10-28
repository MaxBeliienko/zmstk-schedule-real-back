const mongoose = require("mongoose");

const ACCOUNT_ROLES = ["admin", "accountant", "instructor"];

// Обліковий запис для входу в систему (адмін, бухгалтер або інструктор).
// Вхід — лише за паролем: обліковий запис знаходиться за passwordKey
// (див. utils/passwords.js), а роль визначає, які розділи доступні.
// Обліковий запис інструктора пов'язаний з карткою Instructor через instructorId.
const accountSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ACCOUNT_ROLES, required: true },
    fullName: { type: String, required: true, trim: true },
    instructorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Instructor",
      default: null,
    },
    // Ключ пароля (scrypt). Унікальний: двох однакових паролів бути не може
    passwordKey: { type: String, default: null, select: false },
    // bcrypt-хеш старого 6-значного PIN інструктора. Після першого входу
    // замінюється на passwordKey (utils/accounts.js -> findAccountByPassword)
    legacyPinHash: { type: String, default: null, select: false },
    // Заблокований обліковий запис не може увійти, його сесії не діють
    isActive: { type: Boolean, default: true },
    // Збільшується при зміні пароля чи блокуванні — старі токени стають недійсними
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true }
);

accountSchema.index(
  { passwordKey: 1 },
  { unique: true, partialFilterExpression: { passwordKey: { $type: "string" } } }
);
accountSchema.index(
  { instructorId: 1 },
  { unique: true, partialFilterExpression: { instructorId: { $type: "objectId" } } }
);
accountSchema.index({ role: 1 });

module.exports = mongoose.model("Account", accountSchema);
module.exports.ACCOUNT_ROLES = ACCOUNT_ROLES;
