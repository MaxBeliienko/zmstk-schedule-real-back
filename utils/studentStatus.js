// Статус курсанта за датами навчання. Використовується в списках курсантів,
// журналі інструктора та при виборі курсанта в плановий графік.
// Та сама логіка є у фронтенді (src/config/studentStatus.js).

const { todayKyiv, addMonths, isValidDateStr } = require("./dates");

// Порядок сортування статусів у списках
const STATUS_PRIORITY = {
  Активний: 1,
  Очікує: 2,
  Неактивний: 3,
  Архів: 4,
};

// Очікує — навчання ще не почалось; Активний — триває; Неактивний — закінчилось
// менше ніж 6 міс. тому; Архів — давніше (або дати некоректні)
function getStudentStatus(startDate, endDate, targetDate = todayKyiv()) {
  if (!isValidDateStr(startDate) || !isValidDateStr(endDate)) return "Архів";

  if (targetDate < startDate) return "Очікує";
  if (targetDate <= endDate) return "Активний";
  if (targetDate <= addMonths(endDate, 6)) return "Неактивний";
  return "Архів";
}

// Сортування: спершу за статусом, потім за ПІБ (українська абетка)
function compareByStatusThenName(a, b) {
  const diff =
    (STATUS_PRIORITY[a.status] || 99) - (STATUS_PRIORITY[b.status] || 99);
  if (diff !== 0) return diff;
  return (a.fullName || "").localeCompare(b.fullName || "", "uk");
}

module.exports = { getStudentStatus, compareByStatusThenName, STATUS_PRIORITY };
