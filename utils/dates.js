// Робота з "чистими" календарними датами (рядки YYYY-MM-DD) та часом HH:MM.
//
// Бізнес працює за київським часом, а сервер може стояти в будь-якому поясі
// (найчастіше UTC). Тому:
//  - "сьогодні" завжди рахуємо через Intl з timeZone "Europe/Kyiv";
//  - арифметику над датами робимо через Date.UTC(), щоб перехід на
//    літній/зимовий час чи пояс сервера ніколи не зсували день.

const KYIV_TZ = "Europe/Kyiv";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseDateOnly(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDateOnly(date) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Перевіряє і формат, і те, що така дата існує (напр. відсікає 2026-02-30)
function isValidDateStr(value) {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  return formatDateOnly(parseDateOnly(value)) === value;
}

function isValidTimeStr(value) {
  return typeof value === "string" && TIME_RE.test(value);
}

// Поточна календарна дата за Києвом (YYYY-MM-DD)
function todayKyiv(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: KYIV_TZ }).format(now);
}

function addDays(dateStr, days) {
  const d = parseDateOnly(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return formatDateOnly(d);
}

function daysInMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

// Додає місяці, "притискаючи" день до кінця місяця:
// 31.01 + 1 міс. = 28/29.02, а не 03.03
function addMonths(dateStr, months, anchorDay) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const totalMonths = y * 12 + (m - 1) + months;
  const year = Math.floor(totalMonths / 12);
  const monthIndex = totalMonths % 12;
  const day = Math.min(anchorDay ?? d, daysInMonth(year, monthIndex));
  return formatDateOnly(new Date(Date.UTC(year, monthIndex, day)));
}

function diffDays(fromStr, toStr) {
  return Math.round((parseDateOnly(toStr) - parseDateOnly(fromStr)) / 86400000);
}

function diffMonths(fromStr, toStr) {
  const [fy, fm] = fromStr.split("-").map(Number);
  const [ty, tm] = toStr.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Перевірка діапазону дат із запиту; повертає текст помилки або null
function dateRangeError(startDate, endDate, maxDays) {
  if (!isValidDateStr(startDate) || !isValidDateStr(endDate)) {
    return "Вкажіть коректні початкову та кінцеву дати";
  }
  if (endDate < startDate) return "Початкова дата пізніша за кінцеву";
  if (maxDays && diffDays(startDate, endDate) + 1 > maxDays) {
    return `Максимальний період — ${maxDays} днів`;
  }
  return null;
}

module.exports = {
  dateRangeError,
  KYIV_TZ,
  parseDateOnly,
  formatDateOnly,
  isValidDateStr,
  isValidTimeStr,
  todayKyiv,
  addDays,
  addMonths,
  diffDays,
  diffMonths,
  timeToMinutes,
  minutesToTime,
};
