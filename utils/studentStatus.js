const { todayKyiv, addMonths, isValidDateStr } = require("./dates");

// Порядок статусів при сортуванні списків курсантів
const STATUS_PRIORITY = {
  Активний: 1,
  Очікує: 2,
  Неактивний: 3,
  Архів: 4,
};

// Розрахунок статусу курсанта відносно дат навчання.
// Усі дати — рядки YYYY-MM-DD, тож порівнюємо їх як рядки: це точно і не
// залежить від часового поясу сервера. targetDate за замовчуванням —
// сьогодні за Києвом.
function getStudentStatus(startDate, endDate, targetDate = todayKyiv()) {
  if (!isValidDateStr(startDate) || !isValidDateStr(endDate)) return "Архів";

  if (targetDate < startDate) return "Очікує";
  if (targetDate <= endDate) return "Активний";
  if (targetDate <= addMonths(endDate, 6)) return "Неактивний";
  return "Архів";
}

function compareByStatusThenName(a, b) {
  const diff =
    (STATUS_PRIORITY[a.status] || 99) - (STATUS_PRIORITY[b.status] || 99);
  if (diff !== 0) return diff;
  return (a.fullName || "").localeCompare(b.fullName || "", "uk");
}

module.exports = { getStudentStatus, compareByStatusThenName, STATUS_PRIORITY };
