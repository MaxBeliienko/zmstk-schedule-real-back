// Допоміжні функції для seed-скриптів (seed.js, seedPlannedData.js).

const Instructor = require("../models/Instructor");
const Account = require("../models/Account");
const { derivePasswordKey } = require("./passwords");

// Seed-скрипти видаляють дані, тож запуск дозволено лише з прапорцем --yes,
// а для NODE_ENV=production — ще й з --production
function assertSeedAllowed(scriptName) {
  const args = process.argv.slice(2);
  const host = (() => {
    try {
      return new URL(process.env.MONGODB_URI).host;
    } catch {
      return "невідомий хост";
    }
  })();

  const refuse = (message) => {
    console.error(`\n⛔ ${scriptName}: ${message}`);
    console.error(`   База: ${host}`);
    console.error("   Скрипт ВИДАЛИТЬ інструкторів, ТЗ та інші дані в цій базі.\n");
    process.exit(1);
  };

  if (!args.includes("--yes")) {
    refuse(`запуск без підтвердження. Щоб продовжити: node ${scriptName} --yes`);
  }
  if (process.env.NODE_ENV === "production" && !args.includes("--production")) {
    refuse("NODE_ENV=production. Для бойової бази додайте ще прапорець --production");
  }
  console.log(`⚠️  ${scriptName}: очищення та заповнення бази ${host}`);
}

// Створює інструкторів разом з обліковими записами; pinCode — їхній пароль
async function insertInstructorsWithAccounts(instructors) {
  await Account.deleteMany({ role: "instructor" });
  for (const { pinCode, ...data } of instructors) {
    const instructor = await Instructor.create(data);
    await Account.create({
      role: "instructor",
      fullName: instructor.fullName,
      instructorId: instructor._id,
      passwordKey: await derivePasswordKey(String(pinCode)),
    });
  }
}

module.exports = { assertSeedAllowed, insertInstructorsWithAccounts };
