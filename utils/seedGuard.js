const bcrypt = require("bcryptjs");

// Seed-скрипти ВИДАЛЯЮТЬ дані (deleteMany({})) у базі з MONGODB_URI.
// Щоб випадково не стерти бойову базу, запуск дозволено лише з явним
// підтвердженням: `node seed.js --yes`, а для NODE_ENV=production —
// додатково `--production`.
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

// insertMany не викликає pre("save") хук моделі, тож хешуємо PIN явно
const withHashedPins = (instructors) =>
  instructors.map((i) => ({ ...i, pinCode: bcrypt.hashSync(String(i.pinCode), 10) }));

module.exports = { assertSeedAllowed, withHashedPins };
