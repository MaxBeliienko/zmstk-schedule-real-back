const bcrypt = require("bcryptjs");
const Migration = require("../models/Migration");
const Instructor = require("../models/Instructor");
const Reminder = require("../models/Reminder");
const { withLock } = require("../utils/keyedLock");
const { syncAllVehicleReminders } = require("../utils/systemReminderSync");

// Одноразові міграції даних. Виконуються при старті сервера по черзі, кожна
// рівно один раз (журнал — колекція migrations). Нову міграцію додавати в
// кінець списку з унікальною назвою; старі не змінювати.
const MIGRATIONS = [
  {
    name: "2026-09-hash-plaintext-pins",
    async up() {
      const instructors = await Instructor.find({}).select("pinCode").lean();
      const plaintext = instructors.filter((i) => !Instructor.isBcryptHash(i.pinCode));
      for (const instructor of plaintext) {
        await Instructor.updateOne(
          { _id: instructor._id },
          { $set: { pinCode: await bcrypt.hash(String(instructor.pinCode), 10) } }
        );
      }
      return `захешовано PIN: ${plaintext.length}`;
    },
  },
  {
    name: "2026-09-vehicle-reminders-dedupe-and-sync",
    async up() {
      // Прибираємо можливі дублікати системних карток МТБ, щоб створився
      // унікальний індекс, і перераховуємо виконавців (адмін + бухгалтер)
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
      // Старий не унікальний індекс на ті самі поля заважає створити новий
      const indexes = await Reminder.collection.indexes();
      if (indexes.some((i) => i.name === "sourceType_1_sourceVehicleId_1")) {
        await Reminder.collection.dropIndex("sourceType_1_sourceVehicleId_1");
      }
      await Reminder.createIndexes();
      await syncAllVehicleReminders();
      return `видалено дублікатів: ${extraIds.length}`;
    },
  },
  {
    name: "2026-10-system-reminders-for-instructors",
    async up() {
      // Унікальний індекс system_card_unique враховував лише ТЗ — друга
      // картка інструктора того ж типу (sourceVehicleId = null) йому б
      // суперечила. Його замінює system_card_unique_v2 (з sourceInstructorId).
      const indexes = await Reminder.collection.indexes();
      if (indexes.some((i) => i.name === "system_card_unique")) {
        await Reminder.collection.dropIndex("system_card_unique");
      }
      await Reminder.createIndexes();
      return "оновлено унікальний індекс системних карток";
    },
  },
];

async function runMigrations() {
  await withLock("migrations", async () => {
    const applied = new Set((await Migration.find({}).lean()).map((m) => m._id));
    for (const migration of MIGRATIONS) {
      if (applied.has(migration.name)) continue;
      const result = await migration.up();
      await Migration.create({ _id: migration.name });
      console.log(`Міграція ${migration.name}: ${result || "готово"}`);
    }
  });
}

module.exports = { runMigrations };
