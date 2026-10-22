const { describe, test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const h = require("../helpers");

describe("Авторизація", () => {
  before(h.startDb);
  after(h.stopDb);
  beforeEach(h.clearDb);

  test("вхід адміна й бухгалтера: роль визначається паролем", async () => {
    for (const [password, role] of [
      ["admin-pass", "admin"],
      ["accountant-pass", "accountant"],
    ]) {
      const res = await h
        .api()
        .post("/api/auth/staff-login")
        .set("X-Forwarded-For", h.nextIp())
        .send({ password });
      assert.equal(res.status, 200);
      assert.equal(res.body.user.role, role);
      assert.ok(res.body.token);
    }
  });

  test("невірний пароль персоналу — 401", async () => {
    const res = await h
      .api()
      .post("/api/auth/staff-login")
      .set("X-Forwarded-For", h.nextIp())
      .send({ password: "wrong" });
    assert.equal(res.status, 401);
  });

  test("вхід інструктора за ПІБ і PIN; PIN зберігається лише як хеш", async () => {
    const instructor = await h.createInstructor("Іваненко І.І.", "123456");
    assert.match(instructor.pinCode, /^\$2[aby]\$/);

    const ok = await h.instructorLogin("Іваненко І.І.", "123456");
    assert.equal(ok.status, 200);
    assert.equal(ok.body.user.role, "instructor");

    const me = await h.api().get("/api/auth/me").set(h.auth(ok.body.token));
    assert.equal(me.status, 200);
    assert.equal(me.body.user.fullName, "Іваненко І.І.");

    const bad = await h.instructorLogin("Іваненко І.І.", "000000");
    assert.equal(bad.status, 401);
  });

  test("після 5 невдалих спроб вхід блокується лише для цієї IP", async () => {
    await h.createInstructor("Іваненко І.І.", "123456");
    const attackerIp = h.nextIp();

    for (let i = 1; i <= 4; i += 1) {
      const res = await h.instructorLogin("Іваненко І.І.", "000000", attackerIp);
      assert.equal(res.status, 401, `спроба ${i}`);
    }
    const fifth = await h.instructorLogin("Іваненко І.І.", "000000", attackerIp);
    assert.equal(fifth.status, 429);

    // Навіть правильний PIN з цієї IP тепер не приймається
    const blocked = await h.instructorLogin("Іваненко І.І.", "123456", attackerIp);
    assert.equal(blocked.status, 429);

    // А сам інструктор з іншої мережі входить як завжди
    const owner = await h.instructorLogin("Іваненко І.І.", "123456");
    assert.equal(owner.status, 200);
  });

  test("запити без токена або з підробленим токеном — 401", async () => {
    const none = await h.api().get("/api/vehicles");
    assert.equal(none.status, 401);

    const fake = await h.api().get("/api/vehicles").set(h.auth("abc.def.ghi"));
    assert.equal(fake.status, 401);
  });

  test("NoSQL-ін'єкція в полі входу не спрацьовує", async () => {
    await h.createInstructor("Іваненко І.І.", "123456");
    // Без санітизації { $ne: "" } знайшов би будь-якого інструктора
    const res = await h
      .api()
      .post("/api/auth/instructor-login")
      .set("X-Forwarded-For", h.nextIp())
      .send({ fullName: { $ne: "" }, pinCode: "123456" });
    assert.equal(res.status, 400);
  });
});
