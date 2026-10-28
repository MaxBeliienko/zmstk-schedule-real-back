const bcrypt = require("bcryptjs");
const Migration = require("../models/Migration");
const Instructor = require("../models/Instructor");
const Account = require("../models/Account");
const Reminder = require("../models/Reminder");
const Setting = require("../models/Setting");
const { withLock } = require("../utils/keyedLock");
const { syncAllVehicleReminders } = require("../utils/systemReminderSync");
const {
  derivePasswordKey,
  pepperFingerprint,
  oldPepperFingerprint,
  isBcryptHash,
} = require("../utils/passwords");

// Одноразові зміни даних при старті сервера (server.js). Кожна міграція
// виконується рівно один раз, журнал — колекція migrations. Нову міграцію
// додавати в кінець списку з унікальною назвою; виконані не змінювати.

// Сирі документи інструкторів (з полями, яких уже немає в схемі, напр. pinCode)
const rawInstructors = (projection) =>
  Instructor.collection.find({}, { projection }).toArray();

// Створює обліковий запис персоналу з пароля в .env, якщо такого пароля ще немає
async function createStaffAccountFromEnv(role, fullName, password) {
  if (!password) return false;
  const passwordKey = await derivePasswordKey(password);
  if (await Account.exists({ passwordKey })) return false;
  await Account.create({ role, fullName, passwordKey });
  return true;
}

// Список міграцій у порядку виконання
const MIGRATIONS = [
  // Старі PIN, збережені відкритим текстом, хешуються bcrypt
  {
    name: "2026-09-hash-plaintext-pins",
    async up() {
      const instructors = await rawInstructors({ pinCode: 1 });
      const plaintext = instructors.filter((i) => i.pinCode && !isBcryptHash(i.pinCode));
      for (const instructor of plaintext) {
        await Instructor.collection.updateOne(
          { _id: instructor._id },
          { $set: { pinCode: await bcrypt.hash(String(instructor.pinCode), 10) } }
        );
      }
      return `захешовано PIN: ${plaintext.length}`;
    },
  },
  // Прибирає дублікати системних карток ТЗ і замінює старий індекс унікальним
  {
    name: "2026-09-vehicle-reminders-dedupe-and-sync",
    async up() {
      const duplicates = await Reminder.aggregate([
        { $match: { sourceType: { $type: "string" } } },
        { $sort: { createdAt: 1 } },
        {
          $group: {
            _id: { sourceType: "$sourceType", sourceVehicleId: "$sourceVehicleId" },
            ids: { $push: "$_id" },
          },
        },
        { $match: { "ids.1": { $exists: true } } },
      ]);
      const extraIds = duplicates.flatMap((d) => d.ids.slice(1));
      if (extraIds.length) await Reminder.deleteMany({ _id: { $in: extraIds } });
      const indexes = await Reminder.collection.indexes();
      if (indexes.some((i) => i.name === "sourceType_1_sourceVehicleId_1")) {
        await Reminder.collection.dropIndex("sourceType_1_sourceVehicleId_1");
      }
      await Reminder.createIndexes();
      await syncAllVehicleReminders();
      return `видалено дублікатів: ${extraIds.length}`;
    },
  },
  // Унікальний індекс системних карток тепер враховує й інструкторів
  {
    name: "2026-10-system-reminders-for-instructors",
    async up() {
      const indexes = await Reminder.collection.indexes();
      if (indexes.some((i) => i.name === "system_card_unique")) {
        await Reminder.collection.dropIndex("system_card_unique");
      }
      await Reminder.createIndexes();
      return "оновлено унікальний індекс системних карток";
    },
  },
  // Прибирає старі поля блокування входу з карток інструкторів
  {
    name: "2026-10-login-lock-per-ip",
    async up() {
      const result = await Instructor.collection.updateMany(
        {},
        { $unset: { failedLoginAttempts: "", lockUntil: "" } }
      );
      return `очищено старі поля блокування: ${result.modifiedCount}`;
    },
  },
  {
    // Перехід на вхід "лише за паролем": кожен інструктор отримує обліковий
    // запис зі своїм старим PIN (bcrypt, переводиться на новий ключ при першому
    // вході), а адмін і бухгалтер — облікові записи з паролів у .env.
    name: "2026-10-accounts-password-login",
    async up() {
      await Account.createIndexes();
      const instructors = await rawInstructors({ fullName: 1, pinCode: 1 });
      let created = 0;
      for (const instructor of instructors) {
        if (await Account.exists({ instructorId: instructor._id })) continue;
        const pin = typeof instructor.pinCode === "string" ? instructor.pinCode : "";
        await Account.create({
          role: "instructor",
          fullName: instructor.fullName,
          instructorId: instructor._id,
          legacyPinHash: pin ? (isBcryptHash(pin) ? pin : await bcrypt.hash(pin, 10)) : null,
        });
        created += 1;
      }
      await Instructor.collection.updateMany({}, { $unset: { pinCode: "", tokenVersion: "" } });

      const admin = await createStaffAccountFromEnv(
        "admin",
        "Адміністратор",
        process.env.ADMIN_PASSWORD
      );
      const accountant = await createStaffAccountFromEnv(
        "accountant",
        "Бухгалтер",
        process.env.ACCOUNTANT_PASSWORD
      );
      return `облікових записів інструкторів: ${created}, адмін: ${admin ? "так" : "ні"}, бухгалтер: ${accountant ? "так" : "ні"}`;
    },
  },
];

const PEPPER_SETTING = "passwordPepperFingerprint";

// Перевіряє, що сервер запущено з тим самим PASSWORD_PEPPER, з яким
// створювались паролі в цій базі. Інакше жоден пароль не підійде, тож
// краще зупинити запуск з зрозумілою помилкою. Заміна перцю дозволена,
// якщо попередній вказано в PASSWORD_PEPPER_OLD (див. config/passwords.js).
async function assertSamePepper() {
  const fingerprint = pepperFingerprint();
  const saved = await Setting.findById(PEPPER_SETTING).lean();
  if (!saved) {
    await Setting.create({ _id: PEPPER_SETTING, value: fingerprint });
    return;
  }
  if (saved.value === fingerprint) return;
  if (saved.value === oldPepperFingerprint()) {
    await Setting.updateOne({ _id: PEPPER_SETTING }, { $set: { value: fingerprint } });
    console.log("PASSWORD_PEPPER замінено: паролі переводяться на новий при вході користувачів");
    return;
  }
  throw new Error(
    "PASSWORD_PEPPER відрізняється від того, з яким створено паролі в цій базі. " +
      "Поверніть попереднє значення або вкажіть його в PASSWORD_PEPPER_OLD."
  );
}

// Якщо в базі немає жодного активного адміна (нова база), створює його з
// ADMIN_PASSWORD, щоб було кому увійти й налаштувати систему
async function ensureAdminAccount() {
  if (await Account.exists({ role: "admin", isActive: true })) return;
  if (await createStaffAccountFromEnv("admin", "Адміністратор", process.env.ADMIN_PASSWORD)) {
    console.log("Створено обліковий запис адміністратора з ADMIN_PASSWORD");
  } else {
    console.warn("⚠️  Немає жодного активного адміністратора, а ADMIN_PASSWORD не задано або вже зайнятий.");
  }
}

// Запускається при старті сервера: перевірка "перцю", міграції, адмін за замовчуванням
async function runMigrations() {
  await withLock("migrations", async () => {
    await assertSamePepper();
    const applied = new Set((await Migration.find({}).lean()).map((m) => m._id));
    for (const migration of MIGRATIONS) {
      if (applied.has(migration.name)) continue;
      const result = await migration.up();
      await Migration.create({ _id: migration.name });
      console.log(`Міграція ${migration.name}: ${result || "готово"}`);
    }
    await ensureAdminAccount();
  });
}

module.exports = { runMigrations };
