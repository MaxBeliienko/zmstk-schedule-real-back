const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  computeTriggerDates,
  occurrencesBetween,
  relevantEventDates,
  getIdentity,
} = require("../../utils/reminderOffsets");

test("дати тригерів «нагадати за…» рахуються від дати події", () => {
  assert.deepEqual(
    computeTriggerDates("2026-06-15", ["1_day", "1_week", "2_weeks", "1_month"]),
    ["2026-06-14", "2026-06-08", "2026-06-01", "2026-05-16"]
  );
  // Невідомі значення ігноруються
  assert.deepEqual(computeTriggerDates("2026-06-15", ["5_years", "1_day"]), ["2026-06-14"]);
});

test("разова картка з'являється лише у своїй даті", () => {
  assert.deepEqual(occurrencesBetween("2026-06-15", "none", "2026-06-01", "2026-06-30"), [
    "2026-06-15",
  ]);
  assert.deepEqual(occurrencesBetween("2026-06-15", "none", "2026-07-01", "2026-07-31"), []);
});

test("щотижнева серія не показується раніше за дату початку", () => {
  assert.deepEqual(occurrencesBetween("2026-06-10", "weekly", "2026-06-01", "2026-06-30"), [
    "2026-06-10",
    "2026-06-17",
    "2026-06-24",
  ]);
});

test("щомісячна серія з 31-го: лютий — останній день, березень — знову 31-ше", () => {
  assert.deepEqual(occurrencesBetween("2026-01-31", "monthly", "2026-01-01", "2026-04-30"), [
    "2026-01-31",
    "2026-02-28",
    "2026-03-31",
    "2026-04-30",
  ]);
});

test("щорічна серія з 29 лютого у невисокосні роки — 28 лютого", () => {
  assert.deepEqual(occurrencesBetween("2028-02-29", "yearly", "2029-01-01", "2032-12-31"), [
    "2029-02-28",
    "2030-02-28",
    "2031-02-28",
    "2032-02-29",
  ]);
});

test("щоденна серія за великий діапазон дає правильну кількість подій", () => {
  const dates = occurrencesBetween("2026-01-01", "daily", "2026-01-01", "2026-12-31");
  assert.equal(dates.length, 365);
  assert.equal(dates.at(-1), "2026-12-31");
});

test("relevantEventDates бере події від місяця тому до місяця вперед", () => {
  const reminder = { date: "2026-01-01", repeat: "monthly" };
  assert.deepEqual(relevantEventDates(reminder, "2026-06-15"), [
    "2026-06-01",
    "2026-07-01",
  ]);
});

test("ідентифікатор користувача для нагадувань", () => {
  assert.equal(getIdentity({ role: "admin" }), "role:admin");
  assert.equal(getIdentity({ role: "instructor", id: "abc" }), "instructor:abc");
});
