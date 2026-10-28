// Модульні тести utils/dates.js: арифметика дат, межі місяців, перевірки формату.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  isValidDateStr,
  isValidTimeStr,
  addDays,
  addMonths,
  diffDays,
  todayKyiv,
  dateRangeError,
  timeToMinutes,
  minutesToTime,
} = require("../../utils/dates");

test("isValidDateStr відсікає неіснуючі дати й неправильний формат", () => {
  assert.equal(isValidDateStr("2026-02-28"), true);
  assert.equal(isValidDateStr("2028-02-29"), true);
  assert.equal(isValidDateStr("2026-02-29"), false);
  assert.equal(isValidDateStr("2026-02-30"), false);
  assert.equal(isValidDateStr("2026-13-01"), false);
  assert.equal(isValidDateStr("26-01-01"), false);
  assert.equal(isValidDateStr(undefined), false);
  assert.equal(isValidDateStr(["2026-01-01"]), false);
});

test("isValidTimeStr приймає лише ГГ:ХХ у межах доби", () => {
  assert.equal(isValidTimeStr("08:00"), true);
  assert.equal(isValidTimeStr("23:59"), true);
  assert.equal(isValidTimeStr("24:00"), false);
  assert.equal(isValidTimeStr("8:00"), false);
});

test("addDays коректно переходить через місяць, рік і перехід на літній час", () => {
  assert.equal(addDays("2026-01-31", 1), "2026-02-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(addDays("2026-03-28", 1), "2026-03-29");
  assert.equal(addDays("2026-03-29", 1), "2026-03-30");
});

test("addMonths притискає день до кінця місяця", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2028-01-31", 1), "2028-02-29");
  assert.equal(addMonths("2026-03-15", -6), "2025-09-15");
  assert.equal(addMonths("2026-01-31", 2, 31), "2026-03-31");
});

test("diffDays рахує різницю в календарних днях", () => {
  assert.equal(diffDays("2026-01-01", "2026-01-31"), 30);
  assert.equal(diffDays("2026-01-31", "2026-01-01"), -30);
});

test("todayKyiv рахує дату за Києвом, а не за поясом сервера", () => {
  assert.equal(todayKyiv(new Date("2026-12-31T22:30:00Z")), "2027-01-01");
  assert.equal(todayKyiv(new Date("2026-12-31T20:30:00Z")), "2026-12-31");
});

test("dateRangeError перевіряє діапазон і максимальну довжину", () => {
  assert.equal(dateRangeError("2026-01-01", "2026-01-31", 62), null);
  assert.match(dateRangeError("2026-02-01", "2026-01-01"), /пізніша/);
  assert.match(dateRangeError("2026-01-01", "2026-03-15", 62), /62 днів/);
  assert.match(dateRangeError("bad", "2026-01-01"), /коректні/);
});

test("timeToMinutes / minutesToTime взаємно обернені", () => {
  assert.equal(timeToMinutes("08:30"), 510);
  assert.equal(minutesToTime(510), "08:30");
  assert.equal(minutesToTime(timeToMinutes("20:00") + 90), "21:30");
});
