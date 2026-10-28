// Інтеграційні тести облікових записів персоналу: створення, унікальність
// паролів, права, блокування та автор у історії передплат.

const { describe, test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const h = require("../helpers");

describe("Облікові записи персоналу", () => {
  let admin;

  before(h.startDb);
  after(h.stopDb);
  beforeEach(async () => {
    await h.clearDb();
    admin = await h.staffToken("admin");
  });

  const create = (body) =>
    h.api().post("/api/accounts").set(h.auth(admin)).send(body);

  test("адмін створює бухгалтера, той входить своїм паролем", async () => {
    const res = await create({ fullName: "Олена", role: "accountant", password: "olena-pass-1" });
    assert.equal(res.status, 201);
    const session = await h.login("olena-pass-1");
    assert.equal(session.status, 200);
    assert.equal(session.body.user.role, "accountant");
    assert.equal(session.body.user.fullName, "Олена");
  });

  test("однаковий пароль у двох користувачів неможливий", async () => {
    const res = await create({ fullName: "Дубль", role: "accountant", password: h.STAFF_PASSWORDS.admin });
    assert.equal(res.status, 409);
  });

  test("бухгалтер не має доступу до облікових записів", async () => {
    const accountant = await h.staffToken("accountant");
    const res = await h.api().get("/api/accounts").set(h.auth(accountant));
    assert.equal(res.status, 403);
  });

  test("не можна заблокувати себе чи останнього адміна", async () => {
    const list = await h.api().get("/api/accounts").set(h.auth(admin));
    const self = list.body.accounts.find((a) => a.isSelf);
    const res = await h
      .api()
      .put(`/api/accounts/${self._id}`)
      .set(h.auth(admin))
      .send({ isActive: false });
    assert.equal(res.status, 400);

    const del = await h.api().delete(`/api/accounts/${self._id}`).set(h.auth(admin));
    assert.equal(del.status, 400);
  });

  test("блокування завершує сесії користувача", async () => {
    const created = await create({ fullName: "Олена", role: "accountant", password: "olena-pass-1" });
    const session = await h.login("olena-pass-1");

    const res = await h
      .api()
      .put(`/api/accounts/${created.body.account._id}`)
      .set(h.auth(admin))
      .send({ isActive: false });
    assert.equal(res.status, 200);

    const me = await h.api().get("/api/auth/me").set(h.auth(session.body.token));
    assert.equal(me.status, 401);
    assert.equal((await h.login("olena-pass-1")).status, 403);
  });

  test("в історії передплат видно, хто вніс зміну", async () => {
    const created = await create({ fullName: "Олена", role: "accountant", password: "olena-pass-1" });
    assert.equal(created.status, 201);
    const token = (await h.login("olena-pass-1")).body.token;
    const student = await h.createStudent({ cost: 1000 });

    const res = await h
      .api()
      .put(`/api/admin/students/${student._id}`)
      .set(h.auth(token))
      .send({ prepayment: 300 });
    assert.equal(res.status, 200);
    const entry = res.body.student.prepaymentHistory.at(-1);
    assert.equal(entry.byName, "Олена");
    assert.equal(entry.role, "Accountant");
  });
});
