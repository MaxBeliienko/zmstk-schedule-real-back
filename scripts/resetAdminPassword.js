require("dotenv").config();

// Аварійне відновлення входу адміністратора.
//
// Коли потрібен: PASSWORD_PEPPER втрачено (або змінено без PASSWORD_PEPPER_OLD),
// тож жоден пароль не підходить і сервер не стартує через інший перець.
//
// Що робить:
//  1) приймає поточний PASSWORD_PEPPER як новий для цієї бази;
//  2) задає першому адміністратору (або створює нового) пароль з ADMIN_PASSWORD.
// Після цього адмін входить і задає нові паролі іншим користувачам
// (сторінки "Користувачі" та "Інструктори") — їхні старі паролі вже не діють.
//
// Запуск: node scripts/resetAdminPassword.js --yes
// (MONGODB_URI, PASSWORD_PEPPER і ADMIN_PASSWORD беруться з .env)

const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Account = require("../models/Account");
const Setting = require("../models/Setting");
const { derivePasswordKey, pepperFingerprint } = require("../utils/passwords");

async function main() {
  if (!process.argv.includes("--yes")) {
    console.error("Скрипт змінює пароль адміністратора в базі з MONGODB_URI. Запуск: node scripts/resetAdminPassword.js --yes");
    process.exit(1);
  }
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 8) {
    console.error("Задайте в .env ADMIN_PASSWORD (щонайменше 8 символів) — це буде новий пароль адміністратора.");
    process.exit(1);
  }

  await connectDB();

  await Setting.updateOne(
    { _id: "passwordPepperFingerprint" },
    { $set: { value: pepperFingerprint() } },
    { upsert: true }
  );

  let admin = await Account.findOne({ role: "admin" }).sort({ isActive: -1, createdAt: 1 });
  if (!admin) admin = new Account({ role: "admin", fullName: "Адміністратор" });

  // Якщо такий самий ключ уже є в іншого користувача — звільняємо його
  const passwordKey = await derivePasswordKey(password);
  await Account.updateMany({ passwordKey, _id: { $ne: admin._id } }, { $set: { passwordKey: null } });

  admin.passwordKey = passwordKey;
  admin.legacyPinHash = null;
  admin.isActive = true;
  admin.tokenVersion = (admin.tokenVersion || 0) + 1;
  await admin.save();

  console.log(`Готово. Адміністратор "${admin.fullName}" може увійти з паролем з ADMIN_PASSWORD.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
