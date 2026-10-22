const { describe, test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const h = require("../helpers");

const DATE = "2026-06-15";

describe("Плановий графік: конфлікти бронювання і звіт по ТЗ", () => {
  let admin;
  let ins1;
  let ins2;
  let car;
  let car2;
  let trailer;
  let st1;
  let st2;

  before(h.startDb);
  after(h.stopDb);
  beforeEach(async () => {
    await h.clearDb();
    await h.createExercises();
    admin = await h.staffToken("admin");
    ins1 = await h.createInstructor("Іваненко І.І.");
    ins2 = await h.createInstructor("Коваль П.П.");
    car = await h.createVehicle({ brand: "Renault" });
    car2 = await h.createVehicle({ brand: "Skoda" });
    trailer = await h.createVehicle({ brand: "Причіп", isTrailer: true });
    st1 = await h.createStudent({ fullName: "Бойко А." });
    st2 = await h.createStudent({ fullName: "Антоненко В." });
  });

  const lesson = (overrides = {}) => ({
    instructorId: ins1._id.toString(),
    studentId: st1._id.toString(),
    vehicleId: car._id.toString(),
    category: "B",
    exerciseCode: "1.1",
    date: DATE,
    startTime: "10:00",
    ...overrides,
  });

  const create = (body) =>
    h.api().post("/api/admin/planned-schedule").set(h.auth(admin)).send(body);

  test("тривалість, час закінчення й автодром беруться з довідника вправ", async () => {
    const res = await create(lesson({ exerciseCode: "2.1" }));
    assert.equal(res.status, 201);
    assert.equal(res.body.slot.endTime, "12:00");
    assert.equal(res.body.slot.hours, 2);
    assert.equal(res.body.slot.isAutodrome, true);
  });

  test("одне авто не може бути в двох заняттях одночасно", async () => {
    assert.equal((await create(lesson())).status, 201);
    const res = await create(
      lesson({ instructorId: ins2._id.toString(), studentId: st2._id.toString(), startTime: "10:30" })
    );
    assert.equal(res.status, 409);
    assert.match(res.body.message, /Транспортний засіб/);
  });

  test("заняття, що лише стикуються в часі (10–11 і 11–12), — не конфлікт", async () => {
    assert.equal((await create(lesson())).status, 201);
    const res = await create(
      lesson({ instructorId: ins2._id.toString(), studentId: st2._id.toString(), startTime: "11:00" })
    );
    assert.equal(res.status, 201);
  });

  test("причіп не може бути одночасно в двох заняттях", async () => {
    assert.equal((await create(lesson({ trailerId: trailer._id.toString() }))).status, 201);
    const res = await create(
      lesson({
        instructorId: ins2._id.toString(),
        studentId: st2._id.toString(),
        vehicleId: car2._id.toString(),
        trailerId: trailer._id.toString(),
      })
    );
    assert.equal(res.status, 409);
    assert.match(res.body.message, /Причіп/);
  });

  test("курсант не може мати два заняття одночасно", async () => {
    assert.equal((await create(lesson())).status, 201);
    const res = await create(
      lesson({ instructorId: ins2._id.toString(), vehicleId: car2._id.toString(), exerciseCode: "1.2" })
    );
    assert.equal(res.status, 409);
    assert.match(res.body.message, /Курсант/);
  });

  test("інструктор не може мати два заняття одночасно", async () => {
    assert.equal((await create(lesson())).status, 201);
    const res = await create(lesson({ studentId: st2._id.toString(), vehicleId: car2._id.toString() }));
    assert.equal(res.status, 409);
    assert.match(res.body.message, /Інструктор/);
  });

  test("одна вправа — лише один раз для курсанта", async () => {
    assert.equal((await create(lesson())).status, 201);
    const res = await create(lesson({ date: "2026-06-16" }));
    assert.equal(res.status, 409);
    assert.match(res.body.message, /вже має вправу/);
  });

  test("заняття поза сіткою 08:00–21:00 не приймається", async () => {
    assert.equal((await create(lesson({ startTime: "07:30" }))).status, 400);
    // 2-годинна вправа о 20:00 закінчилась би о 22:00
    assert.equal((await create(lesson({ exerciseCode: "2.1", startTime: "20:00" }))).status, 400);
  });

  test("причіп не може бути основним ТЗ", async () => {
    const res = await create(lesson({ vehicleId: trailer._id.toString() }));
    assert.equal(res.status, 400);
  });

  test("при редагуванні заняття не конфліктує саме з собою", async () => {
    const created = await create(lesson());
    const res = await h
      .api()
      .put(`/api/admin/planned-schedule/${created.body.slot._id}`)
      .set(h.auth(admin))
      .send({ startTime: "10:30" });
    assert.equal(res.status, 200);
    assert.equal(res.body.slot.endTime, "11:30");
  });

  test("звіт по ТЗ: заняття, де ТЗ основне авто або причіп, з ПІБ інструктора", async () => {
    await create(lesson());
    await create(
      lesson({
        instructorId: ins2._id.toString(),
        studentId: st2._id.toString(),
        vehicleId: car2._id.toString(),
        trailerId: trailer._id.toString(),
        startTime: "12:00",
      })
    );
    // Заняття поза періодом не потрапляє у звіт
    await create(lesson({ exerciseCode: "1.2", date: "2026-07-20" }));

    const report = (vehicleId) =>
      h
        .api()
        .get("/api/admin/planned-schedule")
        .query({ vehicleId, startDate: "2026-06-01", endDate: "2026-06-30" })
        .set(h.auth(admin));

    const byCar = await report(car._id.toString());
    assert.equal(byCar.status, 200);
    assert.equal(byCar.body.schedules.length, 1);
    assert.equal(byCar.body.schedules[0].instructorId.fullName, "Іваненко І.І.");
    assert.equal(byCar.body.schedules[0].studentId.fullName, "Бойко А.");

    const byTrailer = await report(trailer._id.toString());
    assert.equal(byTrailer.body.schedules.length, 1);
    assert.equal(byTrailer.body.schedules[0].instructorId.fullName, "Коваль П.П.");

    const bad = await report("not-an-id");
    assert.equal(bad.status, 400);
  });

  test("плановий графік доступний лише адміну", async () => {
    const accountant = await h.staffToken("accountant");
    const res = await h
      .api()
      .get("/api/admin/planned-schedule")
      .query({ startDate: "2026-06-01", endDate: "2026-06-30" })
      .set(h.auth(accountant));
    assert.equal(res.status, 403);
  });
});
