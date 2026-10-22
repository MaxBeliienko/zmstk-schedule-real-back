const { describe, test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const h = require("../helpers");
const Instructor = require("../../models/Instructor");

describe("Інструктори: зміна PIN", () => {
  before(h.startDb);
  after(h.stopDb);
  beforeEach(h.clearDb);

  test("адмін змінює PIN: старі сесії завершуються, вхід — лише з новим PIN", async () => {
    const instructor = await h.createInstructor("Іваненко І.І.", "111111");
    const oldSession = await h.instructorLogin("Іваненко І.І.", "111111");
    assert.equal(oldSession.status, 200);

    const admin = await h.staffToken("admin");
    const res = await h
      .api()
      .put(`/api/instructors/${instructor._id}`)
      .set(h.auth(admin))
      .send({ pinCode: "222222" });
    assert.equal(res.status, 200);
    assert.equal(res.body.pinChanged, true);
    // PIN не повертається у відповіді
    assert.equal(res.body.instructor.pinCode, undefined);

    // PIN у базі — хеш, не відкритий текст
    const stored = await Instructor.findById(instructor._id).lean();
    assert.match(stored.pinCode, /^\$2[aby]\$/);

    // Старий токен більше не діє
    const me = await h.api().get("/api/auth/me").set(h.auth(oldSession.body.token));
    assert.equal(me.status, 401);

    assert.equal((await h.instructorLogin("Іваненко І.І.", "111111")).status, 401);
    assert.equal((await h.instructorLogin("Іваненко І.І.", "222222")).status, 200);
  });

  test("бухгалтер теж може змінити PIN (як і інші дані інструктора)", async () => {
    const instructor = await h.createInstructor();
    const accountant = await h.staffToken("accountant");
    const res = await h
      .api()
      .put(`/api/instructors/${instructor._id}`)
      .set(h.auth(accountant))
      .send({ pinCode: "333333" });
    assert.equal(res.status, 200);
    assert.equal((await h.instructorLogin(instructor.fullName, "333333")).status, 200);
  });

  test("редагування без PIN не змінює PIN і не завершує сесії", async () => {
    const instructor = await h.createInstructor("Іваненко І.І.", "111111");
    const session = await h.instructorLogin("Іваненко І.І.", "111111");

    const admin = await h.staffToken("admin");
    const res = await h
      .api()
      .put(`/api/instructors/${instructor._id}`)
      .set(h.auth(admin))
      .send({ certificate: ["B", "C"], medicalExamUntil: "2027-01-01" });
    assert.equal(res.status, 200);
    assert.equal(res.body.pinChanged, false);
    assert.deepEqual(res.body.instructor.certificate, ["B", "C"]);

    const me = await h.api().get("/api/auth/me").set(h.auth(session.body.token));
    assert.equal(me.status, 200);
    assert.equal((await h.instructorLogin("Іваненко І.І.", "111111")).status, 200);
  });

  test("некоректний PIN — 400, дані не змінюються", async () => {
    const instructor = await h.createInstructor("Іваненко І.І.", "111111");
    const admin = await h.staffToken("admin");
    for (const pinCode of ["12345", "1234567", "12ab56"]) {
      const res = await h
        .api()
        .put(`/api/instructors/${instructor._id}`)
        .set(h.auth(admin))
        .send({ pinCode });
      assert.equal(res.status, 400, pinCode);
    }
    assert.equal((await h.instructorLogin("Іваненко І.І.", "111111")).status, 200);
  });

  test("інструктор не може змінювати дані (і PIN) — 403", async () => {
    const instructor = await h.createInstructor("Іваненко І.І.", "111111");
    const session = await h.instructorLogin("Іваненко І.І.", "111111");
    const res = await h
      .api()
      .put(`/api/instructors/${instructor._id}`)
      .set(h.auth(session.body.token))
      .send({ pinCode: "999999" });
    assert.equal(res.status, 403);
  });

  test("публічний список інструкторів не віддає PIN", async () => {
    await h.createInstructor();
    const res = await h.api().get("/api/instructors");
    assert.equal(res.status, 200);
    assert.equal(res.body.instructors.length, 1);
    assert.equal(res.body.instructors[0].pinCode, undefined);
  });
});
