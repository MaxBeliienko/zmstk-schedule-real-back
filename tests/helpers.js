// Спільне для інтеграційних тестів API. Кожен тестовий файл піднімає власну
// тимчасову MongoDB у пам'яті (replica set з одного вузла — як на Atlas,
// щоб працювали транзакції): справжня база з .env не використовується.
// Між тестами колекції очищаються.

// Змінні середовища задаються до підключення app.js (він перевіряє секрети).
// TRUST_PROXY=1 дає змогу імітувати різні IP заголовком X-Forwarded-For
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-at-least-16-chars";
process.env.PASSWORD_PEPPER = "test-pepper-at-least-16-chars";
process.env.ADMIN_PASSWORD = "admin-pass";
process.env.ACCOUNTANT_PASSWORD = "accountant-pass";
process.env.TRUST_PROXY = "1";

const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server-core");
const request = require("supertest");
const app = require("../app");

const Instructor = require("../models/Instructor");
const Account = require("../models/Account");
const { derivePasswordKey } = require("../utils/passwords");
const Student = require("../models/Student");
const Vehicle = require("../models/Vehicle");
const ExerciseCategory = require("../models/Exercise");

let mongod;

// Запуск тимчасової БД; унікальні індекси створюються одразу — вони частина
// захисту від конфліктів
async function startDb() {
  mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongod.getUri());
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
}

async function stopDb() {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
}

// Очищення всіх колекцій між тестами
async function clearDb() {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

let ipCounter = 0;
// Нова "IP-адреса" для кожного входу, щоб ліміти спроб не змішувались
const nextIp = () => `10.0.${Math.floor(++ipCounter / 250)}.${ipCounter % 250 + 1}`;

const api = () => request(app);

// Паролі тестових адміна й бухгалтера
const STAFF_PASSWORDS = { admin: "admin-pass-1", accountant: "accountant-pass-1" };

// Вхід за паролем з окремої IP
async function login(password, ip = nextIp()) {
  return api().post("/api/auth/login").set("X-Forwarded-For", ip).send({ password });
}

// Обліковий запис з готовим ключем пароля (без перевірки довжини)
async function createAccount(data, password) {
  return Account.create({ ...data, passwordKey: await derivePasswordKey(password) });
}

// Токен адміна / бухгалтера; обліковий запис створюється за потреби
async function staffToken(role = "admin") {
  const password = STAFF_PASSWORDS[role];
  if (!(await Account.exists({ role, fullName: `Тест ${role}` }))) {
    await createAccount({ role, fullName: `Тест ${role}` }, password);
  }
  const res = await login(password);
  if (res.status !== 200) throw new Error(`staff login failed: ${res.status}`);
  return res.body.token;
}

// Інструктор з обліковим записом. Без пароля генерується унікальний —
// однакових паролів у системі бути не може
let instructorCounter = 0;
async function createInstructor(
  fullName = "Іваненко І.І.",
  password = `instructor-${++instructorCounter}`
) {
  const instructor = await Instructor.create({ fullName, certificate: ["B"] });
  await createAccount({ role: "instructor", fullName, instructorId: instructor._id }, password);
  return instructor;
}

// Тестові ТЗ і курсант з типовими даними (overrides — що змінити)
async function createVehicle(overrides = {}) {
  return Vehicle.create({
    brand: "Renault",
    plateNumber: `BA${Math.floor(Math.random() * 9000 + 1000)}AA`,
    category: ["B", "CE"],
    ...overrides,
  });
}

async function createStudent(overrides = {}) {
  return Student.create({
    fullName: "Петренко Петро",
    group: "12",
    category: "B",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    studyType: "Практика",
    ...overrides,
  });
}

// Мінімальний довідник вправ категорії B: 1 год, 1 год, 2 год (автодром), іспит 0.5 год
async function createExercises() {
  return ExerciseCategory.create({
    category: "B",
    isPreparation: false,
    totalHours: 3.5,
    exercises: [
      { code: "1.1", hours: 1 },
      { code: "1.2", hours: 1 },
      { code: "2.1", hours: 2, isAutodrome: true },
      { code: "Іспит", hours: 0.5 },
    ],
  });
}

// Заголовок авторизації для supertest
const auth = (token) => ({ Authorization: `Bearer ${token}` });

module.exports = {
  api,
  auth,
  startDb,
  stopDb,
  clearDb,
  nextIp,
  staffToken,
  login,
  createAccount,
  STAFF_PASSWORDS,
  createInstructor,
  createVehicle,
  createStudent,
  createExercises,
};
