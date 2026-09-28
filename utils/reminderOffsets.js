const {
  addDays,
  addMonths,
  diffDays,
  diffMonths,
  todayKyiv,
} = require("./dates");

// Підтримувані варіанти "нагадати за..." та відповідна кількість днів
const OFFSET_DAYS = {
  "1_day": 1,
  "1_week": 7,
  "2_weeks": 14,
  "1_month": 30,
};

const OFFSET_LABELS = {
  "1_day": "За день",
  "1_week": "За тиждень",
  "2_weeks": "За два тижні",
  "1_month": "За місяць",
};

// Варіанти повторення картки
const REPEAT_LABELS = {
  none: "Не повторювати",
  daily: "Кожен день",
  weekly: "Кожен тиждень",
  monthly: "Кожен місяць",
  yearly: "Кожен рік",
};

const MAX_OFFSET_DAYS = Math.max(...Object.values(OFFSET_DAYS));

// Скільки днів після дати події ще показуємо непідтверджене сповіщення
const EVENT_GRACE_DAYS = 31;

const isOffsetKey = (key) => typeof key === "string" && Object.hasOwn(OFFSET_DAYS, key);
const isRepeatKey = (key) => typeof key === "string" && Object.hasOwn(REPEAT_LABELS, key);

// Обчислює список дат-тригерів (YYYY-MM-DD) для події з датою `dateStr`
// та обраними варіантами випередження `remindBefore`
function computeTriggerDates(dateStr, remindBefore = []) {
  return remindBefore
    .filter(isOffsetKey)
    .map((key) => addDays(dateStr, -OFFSET_DAYS[key]));
}

// Усі дати настання повторюваної картки в діапазоні [from, to] (включно).
// Серія починається з seriesDate і ніколи не показується раніше за неї.
// Для "кожен місяць" / "кожен рік" день притискається до кінця місяця
// (31-ше число в лютому стане 28/29-м), але наступні місяці знову
// повертаються до 31-го — рахуємо завжди від початкової дати.
function occurrencesBetween(seriesDate, repeat, from, to) {
  if (to < seriesDate || from > to) return [];
  const start = from < seriesDate ? seriesDate : from;

  if (!repeat || repeat === "none") {
    return seriesDate >= from && seriesDate <= to ? [seriesDate] : [];
  }

  const result = [];

  if (repeat === "daily" || repeat === "weekly") {
    const step = repeat === "daily" ? 1 : 7;
    const offset = diffDays(seriesDate, start);
    let n = Math.ceil(offset / step);
    for (let d = addDays(seriesDate, n * step); d <= to; d = addDays(seriesDate, ++n * step)) {
      result.push(d);
    }
    return result;
  }

  const monthStep = repeat === "monthly" ? 1 : 12;
  const anchorDay = Number(seriesDate.slice(8, 10));
  let n = Math.max(0, Math.floor(diffMonths(seriesDate, start) / monthStep) - 1);
  for (;;) {
    const d = addMonths(seriesDate, n * monthStep, anchorDay);
    if (d > to) break;
    if (d >= start) result.push(d);
    n += 1;
  }
  return result;
}

// Дати подій, для яких сьогодні можуть спрацювати сповіщення — однаково
// для разових і повторюваних карток: події від EVENT_GRACE_DAYS днів тому
// (непідтверджене сповіщення ще показуємо) до найбільшого випередження вперед.
const relevantWindow = (today) => ({
  from: addDays(today, -EVENT_GRACE_DAYS),
  to: addDays(today, MAX_OFFSET_DAYS),
});

function relevantEventDates(reminder, today = todayKyiv()) {
  const { from, to } = relevantWindow(today);
  return occurrencesBetween(reminder.date, reminder.repeat || "none", from, to);
}

// Формує ідентифікатор поточного користувача на основі даних з JWT
function getIdentity(user) {
  if (user.role === "instructor") return `instructor:${user.id}`;
  return `role:${user.role}`;
}

module.exports = {
  isOffsetKey,
  isRepeatKey,
  relevantWindow,
  OFFSET_DAYS,
  OFFSET_LABELS,
  REPEAT_LABELS,
  computeTriggerDates,
  occurrencesBetween,
  relevantEventDates,
  todayStr: todayKyiv,
  getIdentity,
};
