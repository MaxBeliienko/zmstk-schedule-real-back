// Робота з календарними датами як з рядками YYYY-MM-DD та часом ГГ:ХХ.
// Уся арифметика — через UTC, тож переходи на літній/зимовий час не
// гублять і не дублюють днів. "Сьогодні" — завжди за Києвом.
// Та сама логіка є у фронтенді (src/utils/date.js).

const KYIV_TZ = "Europe/Kyiv";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// "2026-09-15" -> Date (опівніч UTC)
function parseDateOnly(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

// Date -> "2026-09-15"
function formatDateOnly(date) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Чи є рядок реальною датою ("2026-02-30" — ні)
function isValidDateStr(value) {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  return formatDateOnly(parseDateOnly(value)) === value;
}

// Чи є рядок часом ГГ:ХХ (00:00–23:59)
function isValidTimeStr(value) {
  return typeof value === "string" && TIME_RE.test(value);
}

// Поточна дата за Києвом, незалежно від часового поясу сервера
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

// Додає місяці з "притисканням" до кінця місяця (31.01 + 1 міс. = 28/29.02).
// anchorDay — бажаний день місяця для повторюваних серій (див. reminderOffsets.js)
function addMonths(dateStr, months, anchorDay) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const totalMonths = y * 12 + (m - 1) + months;
  const year = Math.floor(totalMonths / 12);
  const monthIndex = totalMonths % 12;
  const day = Math.min(anchorDay ?? d, daysInMonth(year, monthIndex));
  return formatDateOnly(new Date(Date.UTC(year, monthIndex, day)));
}

// Різниця в днях (to - from)
function diffDays(fromStr, toStr) {
  return Math.round((parseDateOnly(toStr) - parseDateOnly(fromStr)) / 86400000);
}

// Різниця в календарних місяцях без урахування днів
function diffMonths(fromStr, toStr) {
  const [fy, fm] = fromStr.split("-").map(Number);
  const [ty, tm] = toStr.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

// "08:30" -> 510 (хвилин від початку доби)
function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

// 510 -> "08:30"
function minutesToTime(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Перевірка діапазону дат із запиту: текст помилки або null.
// maxDays — найбільша дозволена довжина періоду
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
