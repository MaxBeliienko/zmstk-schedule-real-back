// Тести транзакцій (utils/transaction.js): зміни кількох записів або
// зберігаються всі разом, або не зберігається жодна.

const { describe, test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const h = require("../helpers");
const Student = require("../../models/Student");
const Schedule = require("../../models/Schedule");
const Account = require("../../models/Account");
const PlannedSchedule = require("../../models/PlannedSchedule");
const { withTransaction } = require("../../utils/transaction");

describe("Транзакції", () => {
  before(h.startDb);
  after(h.stopDb);
  beforeEach(h.clearDb);

  test("помилка всередині скасовує всі зміни, зроблені до неї", async () => {
    await assert.rejects(
      withTransaction(async () => {
        await Student.create({
          fullName: "Тимчасовий",
          group: "1",
          category: "B",
          startDate: "2026-01-01",
          endDate: "2026-02-01",
        });
        throw new Error("збій посередині");
      }),
      /збій посередині/
    );
    assert.equal(await Student.countDocuments(), 0);
  });

  test("повертає результат функції", async () => {
    const result = await withTransaction(async () => 42);
    assert.equal(result, 42);
  });

  test("збереження дня графіка: конфлікт в одній годині не зберігає й інші", async () => {
    const ins1 = await h.createInstructor("Іваненко І.І.");
    const ins2 = await h.createInstructor("Коваль П.П.");
    const car = await h.createVehicle();
    await Schedule.create({ date: "2026-06-15", timeSlot: "09:00-10:00", instructorId: ins1._id, vehicleId: car._id });

    const ops = [
      { insertOne: { document: { date: "2026-06-15", timeSlot: "08:00-09:00", instructorId: ins2._id, studentName: "А" } } },
      // Те саме авто в ту саму годину — порушення унікального індексу
      { insertOne: { document: { date: "2026-06-15", timeSlot: "09:00-10:00", instructorId: ins2._id, vehicleId: car._id } } },
    ];
    await assert.rejects(withTransaction(() => Schedule.bulkWrite(ops)));
    assert.equal(await Schedule.countDocuments({ instructorId: ins2._id }), 0);
  });

  test("видалення інструктора прибирає картку, обліковий запис і посилання разом", async () => {
    const instructor = await h.createInstructor("Іваненко І.І.");
    const student = await h.createStudent({ instructorIds: [instructor._id] });
    const admin = await h.staffToken("admin");

    const res = await h.api().delete(`/api/instructors/${instructor._id}`).set(h.auth(admin));
    assert.equal(res.status, 200);
    assert.equal(await Account.exists({ instructorId: instructor._id }), null);
    const updated = await Student.findById(student._id).lean();
    assert.deepEqual(updated.instructorIds, []);
  });

  test("видалення курсанта прибирає і його заплановані заняття", async () => {
    const admin = await h.staffToken("admin");
    const instructor = await h.createInstructor();
    const car = await h.createVehicle({ category: ["B"] });
    await h.createExercises();
    const student = await h.createStudent();
    await PlannedSchedule.create({
      instructorId: instructor._id,
      studentId: student._id,
      category: "B",
      exerciseCode: "1.1",
      vehicleId: car._id,
      date: "2026-06-15",
      timeSlot: "08:00-09:00",
      startTime: "08:00",
      endTime: "09:00",
      hours: 1,
    });

    const res = await h.api().delete(`/api/admin/students/${student._id}`).set(h.auth(admin));
    assert.equal(res.status, 200);
    assert.equal(await PlannedSchedule.countDocuments({ studentId: student._id }), 0);
  });
});
