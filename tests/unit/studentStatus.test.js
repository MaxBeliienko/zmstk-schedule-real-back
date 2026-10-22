const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  getStudentStatus,
  compareByStatusThenName,
} = require("../../utils/studentStatus");

const START = "2026-03-01";
const END = "2026-05-31";

test("статус курсанта залежить від дати відносно періоду навчання", () => {
  assert.equal(getStudentStatus(START, END, "2026-02-28"), "Очікує");
  assert.equal(getStudentStatus(START, END, "2026-03-01"), "Активний");
  assert.equal(getStudentStatus(START, END, "2026-05-31"), "Активний");
  assert.equal(getStudentStatus(START, END, "2026-06-01"), "Неактивний");
  // Рівно 6 місяців після закінчення — ще неактивний, далі — архів
  assert.equal(getStudentStatus(START, END, "2026-11-30"), "Неактивний");
  assert.equal(getStudentStatus(START, END, "2026-12-01"), "Архів");
});

test("некоректні дати дають статус Архів, а не падіння", () => {
  assert.equal(getStudentStatus("", END, "2026-04-01"), "Архів");
  assert.equal(getStudentStatus(START, undefined, "2026-04-01"), "Архів");
});

test("сортування: спершу за статусом, потім за ПІБ (українська абетка)", () => {
  const list = [
    { status: "Архів", fullName: "Авраменко" },
    { status: "Активний", fullName: "Яковенко" },
    { status: "Активний", fullName: "Євтушенко" },
    { status: "Очікує", fullName: "Борисенко" },
  ].sort(compareByStatusThenName);
  assert.deepEqual(
    list.map((s) => s.fullName),
    ["Євтушенко", "Яковенко", "Борисенко", "Авраменко"]
  );
});
