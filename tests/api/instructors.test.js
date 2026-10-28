// Інтеграційні тести інструкторів: створення з паролем, зміна пароля й ПІБ,
// права доступу, видалення разом з обліковим записом.

const { describe, test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const h = require("../helpers");
const Account = require("../../models/Account");

describe("Інструктори: створення і зміна пароля", () => {
  before(h.startDb);
  after(h.stopDb);
  beforeEach(h.clearDb);

  test("адмін створює інструктора з паролем — інструктор може увійти", async () => {
    const admin = await h.staffToken("admin");
    const res = await h
      .api()
      .post("/api/instructors")
      .set(h.auth(admin))
      .send({ fullName: "Новий Н.Н.", password: "new-pass-1", certificate: ["B"] });
    assert.equal(res.status, 201);
    assert.equal(res.body.instructor.password, undefined);

    const session = await h.login("new-pass-1");
    assert.equal(session.status, 200);
    assert.equal(session.body.user.id, res.body.instructor._id);
  });

  test("пароль, який уже є в іншого користувача, не приймається", async () => {
    await h.createInstructor("Іваненко І.І.", "same-pass-1");
    const admin = await h.staffToken("admin");
    const res = await h
      .api()
      .post("/api/instructors")
      .set(h.auth(admin))
      .send({ fullName: "Коваль П.П.", password: "same-pass-1" });
    assert.equal(res.status, 409);
  });

  test("зміна пароля завершує старі сесії, вхід — лише з новим паролем", async () => {
    const instructor = await h.createInstructor("Іваненко І.І.", "111111");
    const oldSession = await h.login("111111");
    assert.equal(oldSession.status, 200);

    const admin = await h.staffToken("admin");
    const res = await h
      .api()
      .put(`/api/instructors/${instructor._id}`)
      .set(h.auth(admin))
      .send({ password: "22222222" });
    assert.equal(res.status, 200);
    assert.equal(res.body.passwordChanged, true);

    const me = await h.api().get("/api/auth/me").set(h.auth(oldSession.body.token));
    assert.equal(me.status, 401);
    assert.equal((await h.login("111111")).status, 401);
    assert.equal((await h.login("22222222")).status, 200);
  });

  test("бухгалтер теж може змінити пароль інструктора", async () => {
    const instructor = await h.createInstructor();
    const accountant = await h.staffToken("accountant");
    const res = await h
      .api()
      .put(`/api/instructors/${instructor._id}`)
      .set(h.auth(accountant))
      .send({ password: "33333333" });
    assert.equal(res.status, 200);
    assert.equal((await h.login("33333333")).status, 200);
  });

  test("редагування без пароля не завершує сесії; зміна ПІБ оновлює обліковий запис", async () => {
    const instructor = await h.createInstructor("Іваненко І.І.", "111111");
    const session = await h.login("111111");

    const admin = await h.staffToken("admin");
    const res = await h
      .api()
      .put(`/api/instructors/${instructor._id}`)
      .set(h.auth(admin))
      .send({ fullName: "Іваненко Іван", certificate: ["B", "C"] });
    assert.equal(res.status, 200);
    assert.equal(res.body.passwordChanged, false);

    const me = await h.api().get("/api/auth/me").set(h.auth(session.body.token));
    assert.equal(me.status, 200);
    assert.equal(me.body.user.fullName, "Іваненко Іван");
  });

  test("короткий пароль — 400, старий пароль діє далі", async () => {
    const instructor = await h.createInstructor("Іваненко І.І.", "111111");
    const admin = await h.staffToken("admin");
    const res = await h
      .api()
      .put(`/api/instructors/${instructor._id}`)
      .set(h.auth(admin))
      .send({ password: "1234567" });
    assert.equal(res.status, 400);
    assert.equal((await h.login("111111")).status, 200);
  });

  test("інструктор не може змінювати дані — 403", async () => {
    const instructor = await h.createInstructor("Іваненко І.І.", "111111");
    const session = await h.login("111111");
    const res = await h
      .api()
      .put(`/api/instructors/${instructor._id}`)
      .set(h.auth(session.body.token))
      .send({ password: "99999999" });
    assert.equal(res.status, 403);
  });

  test("видалення інструктора видаляє і його обліковий запис", async () => {
    const instructor = await h.createInstructor("Іваненко І.І.", "111111");
    const admin = await h.staffToken("admin");
    const res = await h.api().delete(`/api/instructors/${instructor._id}`).set(h.auth(admin));
    assert.equal(res.status, 200);
    assert.equal(await Account.exists({ instructorId: instructor._id }), null);
    assert.equal((await h.login("111111")).status, 401);
  });
});
