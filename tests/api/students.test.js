// Інтеграційні тести курсантів: створення, оплати та історія передплат,
// права адміна й бухгалтера, видалення разом із заняттями.

const { describe, test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const h = require("../helpers");
const PlannedSchedule = require("../../models/PlannedSchedule");

const studentBody = (overrides = {}) => ({
  fullName: "Бойко Андрій",
  group: "12",
  category: "B",
  startDate: "2026-01-10",
  endDate: "2026-04-10",
  studyType: "Практика",
  cost: 10000,
  prepayment: 2000,
  ...overrides,
});

describe("Курсанти й оплати", () => {
  let admin;
  let accountant;

  before(h.startDb);
  after(h.stopDb);
  beforeEach(async () => {
    await h.clearDb();
    admin = await h.staffToken("admin");
    accountant = await h.staffToken("accountant");
  });

  const createStudent = (token, body) =>
    h.api().post("/api/admin/students").set(h.auth(token)).send(body);

  test("кожна зміна передплати записується в історію з роллю", async () => {
    const created = await createStudent(admin, studentBody());
    assert.equal(created.status, 201);
    const id = created.body.student._id;
    assert.equal(created.body.student.prepaymentHistory.length, 1);

    const res = await h
      .api()
      .put(`/api/admin/students/${id}`)
      .set(h.auth(accountant))
      .send({ prepayment: "3500,50" });
    assert.equal(res.status, 200);
    const history = res.body.student.prepaymentHistory;
    assert.equal(history.length, 2);
    assert.equal(history[1].amount, 3500.5);
    assert.equal(history[1].delta, 1500.5);
    assert.equal(history[1].role, "Accountant");
  });

  test("передплата більша за вартість або від'ємна — 400", async () => {
    assert.equal((await createStudent(admin, studentBody({ prepayment: 20000 }))).status, 400);
    assert.equal((await createStudent(admin, studentBody({ cost: -1 }))).status, 400);
  });

  test("дата завершення не може бути раніше за дату початку", async () => {
    const res = await createStudent(
      admin,
      studentBody({ startDate: "2026-05-01", endDate: "2026-04-01" })
    );
    assert.equal(res.status, 400);
  });

  test("часткове оновлення не зачіпає інші поля", async () => {
    const created = await createStudent(admin, studentBody({ comment: "старий" }));
    const res = await h
      .api()
      .put(`/api/admin/students/${created.body.student._id}`)
      .set(h.auth(admin))
      .send({ phone: "+380501234567" });
    assert.equal(res.status, 200);
    assert.equal(res.body.student.comment, "старий");
    assert.equal(res.body.student.prepayment, 2000);
  });

  test("бухгалтер не може видаляти курсантів, адмін — може (разом із заняттями)", async () => {
    const created = await createStudent(admin, studentBody());
    const id = created.body.student._id;
    const instructor = await h.createInstructor();
    const vehicle = await h.createVehicle();
    await PlannedSchedule.create({
      instructorId: instructor._id,
      studentId: id,
      vehicleId: vehicle._id,
      category: "B",
      exerciseCode: "1.1",
      date: "2026-02-01",
      timeSlot: "10:00-11:00",
      startTime: "10:00",
      endTime: "11:00",
      hours: 1,
    });

    const byAccountant = await h.api().delete(`/api/admin/students/${id}`).set(h.auth(accountant));
    assert.equal(byAccountant.status, 403);

    const byAdmin = await h.api().delete(`/api/admin/students/${id}`).set(h.auth(admin));
    assert.equal(byAdmin.status, 200);
    assert.equal(await PlannedSchedule.countDocuments({ studentId: id }), 0);
  });

  test("фільтр за датою закінчення навчання включає архівних курсантів", async () => {
    await createStudent(admin, studentBody({ fullName: "Давній", startDate: "2020-01-01", endDate: "2020-03-01" }));
    await createStudent(admin, studentBody({ fullName: "Інший рік", startDate: "2021-01-01", endDate: "2021-03-01" }));

    const res = await h
      .api()
      .get("/api/admin/students")
      .query({ endFrom: "2020-01-01", endTo: "2020-12-31" })
      .set(h.auth(admin));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.students.map((s) => s.fullName), ["Давній"]);
    assert.equal(res.body.students[0].status, "Архів");
  });
});
