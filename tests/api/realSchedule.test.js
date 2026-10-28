// Інтеграційні тести реального графіка: збереження дня інструктора,
// конфлікти авто й курсантів, права та обмеження за датою.

const { describe, test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const h = require("../helpers");
const { todayKyiv, addDays } = require("../../utils/dates");

describe("Реальний графік інструктора", () => {
  let ins1;
  let ins2;
  let token1;
  let token2;
  let car;
  const today = todayKyiv();

  before(h.startDb);
  after(h.stopDb);
  beforeEach(async () => {
    await h.clearDb();
    ins1 = await h.createInstructor("Іваненко І.І.", "111111");
    ins2 = await h.createInstructor("Коваль П.П.", "222222");
    token1 = (await h.login("111111")).body.token;
    token2 = (await h.login("222222")).body.token;
    car = await h.createVehicle();
  });

  const save = (token, instructor, slots, date = today) =>
    h
      .api()
      .post("/api/schedule/save")
      .set(h.auth(token))
      .send({ date, instructorId: instructor._id.toString(), slots });

  test("інструктор зберігає і читає свій день", async () => {
    const res = await save(token1, ins1, [
      { timeSlot: "08:00-09:00", vehicleId: car._id.toString(), studentName: "Бойко А.", location: "Автодром" },
    ]);
    assert.equal(res.status, 200);

    const day = await h
      .api()
      .get("/api/schedule/instructor-day")
      .query({ date: today, instructorId: ins1._id.toString() })
      .set(h.auth(token1));
    assert.equal(day.status, 200);
    const slot = day.body.slots.find((s) => s.timeSlot === "08:00-09:00");
    assert.equal(slot.studentName, "Бойко А.");
    assert.equal(slot.location, "Автодром");
  });

  test("одне авто в одному слоті — лише в одного інструктора", async () => {
    await save(token1, ins1, [{ timeSlot: "08:00-09:00", vehicleId: car._id.toString() }]);
    const res = await save(token2, ins2, [{ timeSlot: "08:00-09:00", vehicleId: car._id.toString() }]);
    assert.equal(res.status, 400);
    assert.match(res.body.errors[0].message, /вже використовується/);
  });

  test("той самий курсант (без урахування регістру й пробілів) у двох інструкторів одночасно — конфлікт", async () => {
    await save(token1, ins1, [{ timeSlot: "09:00-10:00", studentName: "Бойко Андрій" }]);
    const res = await save(token2, ins2, [{ timeSlot: "09:00-10:00", studentName: "  бойко   андрій " }]);
    assert.equal(res.status, 400);
    assert.match(res.body.errors[0].message, /Курсант/);
  });

  test("інструктор не може редагувати чужий графік", async () => {
    const res = await save(token1, ins2, [{ timeSlot: "08:00-09:00", studentName: "X" }]);
    assert.equal(res.status, 403);
  });

  test("інструктор редагує не раніше ніж позавчора, адмін — будь-яку дату", async () => {
    const tooOld = addDays(today, -3);
    const res = await save(token1, ins1, [{ timeSlot: "08:00-09:00", studentName: "X" }], tooOld);
    assert.equal(res.status, 400);

    const allowed = await save(
      token1,
      ins1,
      [{ timeSlot: "08:00-09:00", studentName: "X" }],
      addDays(today, -2)
    );
    assert.equal(allowed.status, 200);

    const admin = await h.staffToken("admin");
    const byAdmin = await save(admin, ins1, [{ timeSlot: "08:00-09:00", studentName: "X" }], tooOld);
    assert.equal(byAdmin.status, 200);
  });

  test("невідомий часовий слот відхиляється", async () => {
    const res = await save(token1, ins1, [{ timeSlot: "06:00-07:00", studentName: "X" }]);
    assert.equal(res.status, 400);
  });
});
