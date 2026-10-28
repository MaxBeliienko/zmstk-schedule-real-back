// Інтеграційні тести входу за паролем: визначення ролі, блокування акаунта,
// старі PIN, ліміт спроб з IP, захист від підроблених токенів та ін'єкцій.

const { describe, test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const h = require("../helpers");
const Account = require("../../models/Account");
const Instructor = require("../../models/Instructor");

describe("Авторизація: вхід лише за паролем", () => {
  before(h.startDb);
  after(h.stopDb);
  beforeEach(h.clearDb);

  test("роль визначається за паролем: адмін, бухгалтер, інструктор", async () => {
    await h.createAccount({ role: "admin", fullName: "Адмін" }, "admin-pass-1");
    await h.createAccount({ role: "accountant", fullName: "Бухгалтер" }, "acc-pass-1");
    const instructor = await h.createInstructor("Іваненко І.І.", "instr-pass-1");

    const admin = await h.login("admin-pass-1");
    assert.equal(admin.status, 200);
    assert.equal(admin.body.user.role, "admin");

    const accountant = await h.login("acc-pass-1");
    assert.equal(accountant.body.user.role, "accountant");

    const ins = await h.login("instr-pass-1");
    assert.equal(ins.body.user.role, "instructor");
    assert.equal(ins.body.user.id, instructor._id.toString());

    const me = await h.api().get("/api/auth/me").set(h.auth(ins.body.token));
    assert.equal(me.status, 200);
    assert.equal(me.body.user.fullName, "Іваненко І.І.");
  });

  test("невірний пароль — 401", async () => {
    const res = await h.login("wrong-password");
    assert.equal(res.status, 401);
  });

  test("заблокований обліковий запис не входить і втрачає сесії", async () => {
    const account = await h.createAccount({ role: "accountant", fullName: "Бухгалтер" }, "acc-pass-1");
    const session = await h.login("acc-pass-1");
    assert.equal(session.status, 200);

    await Account.updateOne({ _id: account._id }, { $set: { isActive: false } });
    assert.equal((await h.login("acc-pass-1")).status, 403);
    const me = await h.api().get("/api/auth/me").set(h.auth(session.body.token));
    assert.equal(me.status, 401);
  });

  test("старий 6-значний PIN інструктора (bcrypt) діє і переводиться на новий ключ", async () => {
    const instructor = await Instructor.create({ fullName: "Коваль П.П." });
    await Account.create({
      role: "instructor",
      fullName: "Коваль П.П.",
      instructorId: instructor._id,
      legacyPinHash: await bcrypt.hash("123456", 4),
    });

    const res = await h.login("123456");
    assert.equal(res.status, 200);
    assert.equal(res.body.user.id, instructor._id.toString());

    const stored = await Account.findOne({ instructorId: instructor._id }).select(
      "+passwordKey +legacyPinHash"
    );
    assert.equal(stored.legacyPinHash, null);
    assert.ok(stored.passwordKey);
    assert.equal((await h.login("123456")).status, 200);
  });

  test("після 10 невдалих спроб вхід з цієї IP блокується, з іншої — ні", async () => {
    await h.createInstructor("Іваненко І.І.", "right-pass-1");
    const attackerIp = h.nextIp();

    for (let i = 1; i <= 9; i += 1) {
      assert.equal((await h.login(`wrong-${i}`, attackerIp)).status, 401, `спроба ${i}`);
    }
    assert.equal((await h.login("wrong-10", attackerIp)).status, 429);
    assert.equal((await h.login("right-pass-1", attackerIp)).status, 429);
    assert.equal((await h.login("right-pass-1")).status, 200);
  });

  test("запити без токена або з підробленим токеном — 401", async () => {
    assert.equal((await h.api().get("/api/vehicles")).status, 401);
    const fake = await h.api().get("/api/vehicles").set(h.auth("abc.def.ghi"));
    assert.equal(fake.status, 401);
  });

  test("NoSQL-ін'єкція в полі пароля не спрацьовує", async () => {
    await h.createInstructor();
    const res = await h
      .api()
      .post("/api/auth/login")
      .set("X-Forwarded-For", h.nextIp())
      .send({ password: { $ne: "" } });
    assert.equal(res.status, 400);
  });

  test("список інструкторів недоступний без входу", async () => {
    await h.createInstructor();
    assert.equal((await h.api().get("/api/instructors")).status, 401);
  });
});
