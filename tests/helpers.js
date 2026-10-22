// Спільне для інтеграційних тестів API.
//
// Кожен тестовий файл піднімає власну тимчасову MongoDB у пам'яті
// (mongodb-memory-server): реальна база з .env НЕ використовується і не
// змінюється. Між тестами колекції очищаються.

// Змінні середовища — до підключення app.js (він перевіряє JWT_SECRET)
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-at-least-16-chars";
process.env.ADMIN_PASSWORD = "admin-pass";
process.env.ACCOUNTANT_PASSWORD = "accountant-pass";
// Як на Render: один проксі. Дає змогу в тестах імітувати різні IP
// заголовком X-Forwarded-For (кожен тест — своя IP, ліміти не змішуються)
process.env.TRUST_PROXY = "1";

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server-core");
const request = require("supertest");
const app = require("../app");

const Instructor = require("../models/Instructor");
const Student = require("../models/Student");
const Vehicle = require("../models/Vehicle");
const ExerciseCategory = require("../models/Exercise");

let mongod;

async function startDb() {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  // Унікальні індекси — частина захисту від конфліктів, тож створюємо їх
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
}

async function stopDb() {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
}

async function clearDb() {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

let ipCounter = 0;
// Нова "IP-адреса" для кожного виклику
const nextIp = () => `10.0.${Math.floor(++ipCounter / 250)}.${ipCounter % 250 + 1}`;

const api = () => request(app);

async function staffToken(role = "admin") {
  const password = role === "admin" ? "admin-pass" : "accountant-pass";
  const res = await api()
    .post("/api/auth/staff-login")
    .set("X-Forwarded-For", nextIp())
    .send({ password });
  if (res.status !== 200) throw new Error(`staff login failed: ${res.status}`);
  return res.body.token;
}

async function instructorLogin(fullName, pinCode, ip = nextIp()) {
  return api()
    .post("/api/auth/instructor-login")
    .set("X-Forwarded-For", ip)
    .send({ fullName, pinCode });
}

async function createInstructor(fullName = "Іваненко І.І.", pinCode = "123456") {
  return Instructor.create({ fullName, pinCode, certificate: ["B"] });
}

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

// Мінімальний довідник вправ: 1-годинна, 2-годинна (автодром) та іспит 0.5 год
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

const auth = (token) => ({ Authorization: `Bearer ${token}` });

module.exports = {
  api,
  auth,
  startDb,
  stopDb,
  clearDb,
  nextIp,
  staffToken,
  instructorLogin,
  createInstructor,
  createVehicle,
  createStudent,
  createExercises,
};
