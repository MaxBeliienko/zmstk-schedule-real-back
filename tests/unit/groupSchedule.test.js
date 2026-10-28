// Модульні тести Word-графіка групи: модель (utils/groupSchedule.js) і
// створення .docx (utils/groupScheduleDocx.js).

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  buildGroupSchedule,
  buildStudyDays,
  shortName,
  formatTimeRange,
  formatLongDate,
} = require("../../utils/groupSchedule");
const { renderGroupScheduleDocx } = require("../../utils/groupScheduleDocx");

test("shortName скорочує ПІБ до прізвища з ініціалами", () => {
  assert.equal(shortName("Гаврилюк Юлія Петрівна"), "ГАВРИЛЮК Ю.П.");
  assert.equal(shortName("Гаврилюк Ю.П."), "ГАВРИЛЮК Ю.П.");
  assert.equal(shortName("Петренко Анна-Марія"), "ПЕТРЕНКО А.-М.");
  assert.equal(shortName(""), "—");
});

test("формат часу й дат як у паперовому графіку", () => {
  assert.equal(formatTimeRange("10:00", "12:00"), "10 - 12");
  assert.equal(formatTimeRange("08:30", "09:00"), "08.30 - 09");
  assert.equal(formatLongDate("2026-09-15"), "15 ВЕРЕСНЯ 2026");
});

test("навчальні дні: без вихідних і без довгих перерв, але з вихідним, якщо в ньому заняття", () => {
  const days = buildStudyDays("2026-06-01", "2026-06-26", new Set(["2026-06-01", "2026-06-26"]));
  assert.deepEqual(days, ["2026-06-01", "2026-06-26"]);

  const short = buildStudyDays("2026-06-01", "2026-06-05", new Set(["2026-06-01", "2026-06-05"]));
  assert.equal(short.length, 5);

  const withSaturday = buildStudyDays("2026-06-05", "2026-06-08", new Set(["2026-06-06"]));
  assert.deepEqual(withSaturday, ["2026-06-05", "2026-06-06", "2026-06-08"]);
});

// Тестова група: курсанти, авто, інструктори та заняття
function sampleData() {
  const car = { _id: "v1", brand: "Renault Logan", plateNumber: "BA1111AA" };
  const truck = { _id: "v2", brand: "MAN TGL", plateNumber: "BA2222AA" };
  const trailer = { _id: "t1", brand: "Причіп", plateNumber: "BA3333XT" };
  const main = { _id: "i1", fullName: "Стебловський Олег Іванович" };
  const other = { _id: "i2", fullName: "Коваль Петро" };

  const students = [
    { _id: "s1", fullName: "Бойко Андрій Олегович", category: "B", startDate: "2026-06-01", endDate: "2026-06-05" },
    { _id: "s2", fullName: "Антоненко Віра", category: "B", startDate: "2026-06-01", endDate: "2026-06-05" },
  ];
  const lesson = (studentId, date, startTime, endTime, extra = {}) => ({
    studentId,
    date,
    startTime,
    endTime,
    exerciseCode: "1.1",
    vehicleId: car,
    instructorId: main,
    trailerId: null,
    isAutodrome: false,
    isExam: false,
    ...extra,
  });
  const lessons = [
    lesson("s1", "2026-06-01", "08:00", "09:00"),
    lesson("s1", "2026-06-02", "08:00", "10:00", { exerciseCode: "2.1", isAutodrome: true }),
    lesson("s2", "2026-06-01", "09:00", "10:00"),
    lesson("s2", "2026-06-03", "10:00", "11:00", { vehicleId: truck, trailerId: trailer, instructorId: other }),
    lesson("s2", "2026-06-04", "10:00", "10:30", { exerciseCode: "Іспит", isExam: true }),
  ];
  return { students, lessons };
}

test("buildGroupSchedule групує курсантів за основним авто та формує клітинки", () => {
  const model = buildGroupSchedule({ group: "12", ...sampleData() });

  assert.deepEqual(model.categories, ["B"]);
  assert.equal(model.periodLabel.from, "01 ЧЕРВНЯ 2026");
  assert.equal(model.days.length, 5);

  assert.equal(model.vehicles.length, 1);
  const group = model.vehicles[0];
  assert.equal(group.vehicleLabel, "RENAULT LOGAN (BA1111AA)");
  assert.deepEqual(group.instructorNames, ["СТЕБЛОВСЬКИЙ О.І."]);
  assert.deepEqual(group.students.map((s) => [s.number, s.name]), [
    [1, "АНТОНЕНКО В."],
    [2, "БОЙКО А.О."],
  ]);

  const boyko = group.students[1];
  assert.equal(boyko.cells["2026-06-02"].isAutodrome, true);
  assert.deepEqual(boyko.cells["2026-06-02"].times, ["08 - 10"]);

  const antonenko = group.students[0];
  assert.deepEqual(antonenko.cells["2026-06-03"].exercises, [
    { code: "1.1 КОВА", notes: ["MAN", "(з прич.)"] },
  ]);
  assert.deepEqual(antonenko.cells["2026-06-04"].exercises, [{ code: "ІСПИТ", notes: [] }]);
});

test("renderGroupScheduleDocx формує коректний .docx (zip-архів)", async () => {
  const model = buildGroupSchedule({ group: "12", ...sampleData() });
  const buffer = await renderGroupScheduleDocx(model);
  assert.ok(buffer.length > 1000);
  assert.equal(buffer.subarray(0, 2).toString(), "PK");
});
