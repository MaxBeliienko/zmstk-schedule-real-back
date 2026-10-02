const { addDays, parseDateOnly } = require("./dates");

// Підготовка даних для документа "Графік черговості навчання водінню"
// групи: хто з курсантів на якому авто, які навчальні дні і що в кожній
// клітинці. Тут лише чиста логіка без форматування Word — її легко
// перевірити окремо (оформлення — utils/groupScheduleDocx.js).

// Робочі дні без жодного заняття, що йдуть підряд стільки разів і більше,
// вважаємо перервою в навчанні (канікули, літо) і не показуємо в таблиці
const BREAK_MIN_DAYS = 5;

const MONTHS_GENITIVE = [
  "СІЧНЯ", "ЛЮТОГО", "БЕРЕЗНЯ", "КВІТНЯ", "ТРАВНЯ", "ЧЕРВНЯ",
  "ЛИПНЯ", "СЕРПНЯ", "ВЕРЕСНЯ", "ЖОВТНЯ", "ЛИСТОПАДА", "ГРУДНЯ",
];

const idOf = (value) => (value ? (value._id || value).toString() : null);
const upper = (value) => String(value || "").toLocaleUpperCase("uk");

// "Гаврилюк Юлія Петрівна" -> "ГАВРИЛЮК Ю.П."; вже скорочені ініціали
// ("Гаврилюк Ю.П.") лишаються як є
function shortName(fullName) {
  const [surname, ...rest] = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (!surname) return "—";
  const initials = rest
    .map((part) =>
      part.includes(".")
        ? upper(part)
        : part.split("-").map((p) => `${upper(p[0])}.`).join("-")
    )
    .join("");
  return initials ? `${upper(surname)} ${initials}` : upper(surname);
}

// "15 ВЕРЕСНЯ 2026"
function formatLongDate(dateStr) {
  const [y, m, d] = dateStr.split("-");
  return `${d} ${MONTHS_GENITIVE[Number(m) - 1]} ${y}`;
}

// "2026-09-15" -> "15.09"
const formatDayMonth = (dateStr) => `${dateStr.slice(8, 10)}.${dateStr.slice(5, 7)}`;

// "10:00" -> "10", "08:30" -> "08.30"
const formatHour = (time) => (time.endsWith(":00") ? time.slice(0, 2) : time.replace(":", "."));
const formatTimeRange = (start, end) => `${formatHour(start)} - ${formatHour(end)}`;

const isWeekend = (dateStr) => [0, 6].includes(parseDateOnly(dateStr).getUTCDay());

const vehicleLabel = (vehicle) =>
  vehicle
    ? `${upper(vehicle.brand)}${vehicle.plateNumber ? ` (${vehicle.plateNumber})` : ""}`
    : "";

// Найчастіше значення (за рівної кількості — те, що трапилось раніше)
function mostFrequent(ids) {
  const counts = new Map();
  for (const id of ids) if (id) counts.set(id, (counts.get(id) || 0) + 1);
  let best = null;
  for (const [id, count] of counts) if (!best || count > counts.get(best)) best = id;
  return best;
}

// Навчальні дні таблиці: робочі дні періоду (і вихідні, якщо в них є
// заняття) без довгих перерв, коли в усієї групи немає жодного заняття
function buildStudyDays(periodStart, periodEnd, lessonDates) {
  const candidates = [];
  for (let d = periodStart; d <= periodEnd; d = addDays(d, 1)) {
    if (!isWeekend(d) || lessonDates.has(d)) candidates.push(d);
  }
  // Занять ще немає — порожній бланк на весь період
  if (lessonDates.size === 0) return candidates;

  const days = [];
  let emptyRun = [];
  for (const d of candidates) {
    if (lessonDates.has(d)) {
      if (emptyRun.length < BREAK_MIN_DAYS) days.push(...emptyRun);
      emptyRun = [];
      days.push(d);
    } else {
      emptyRun.push(d);
    }
  }
  if (emptyRun.length < BREAK_MIN_DAYS) days.push(...emptyRun);
  return days;
}

// students — курсанти групи (lean), lessons — їхні заняття з планового
// графіка з populate інструктора, ТЗ і причепа
function buildGroupSchedule({ group, students, lessons }) {
  const lessonsByStudent = new Map(students.map((s) => [s._id.toString(), []]));
  for (const lesson of lessons) {
    lessonsByStudent.get(idOf(lesson.studentId))?.push(lesson);
  }

  // Основне авто курсанта — на якому в нього найбільше занять
  const vehicleGroups = new Map();
  for (const student of students) {
    const own = lessonsByStudent
      .get(student._id.toString())
      .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
    const mainVehicleId = mostFrequent(own.map((l) => idOf(l.vehicleId)));
    const key = mainVehicleId || "none";
    if (!vehicleGroups.has(key)) {
      vehicleGroups.set(key, { mainVehicleId, students: [], lessons: [] });
    }
    const vg = vehicleGroups.get(key);
    vg.students.push({ student, lessons: own });
    vg.lessons.push(...own);
  }

  const vehicles = [...vehicleGroups.values()].map((vg) => {
    const onMain = vg.lessons.filter((l) => idOf(l.vehicleId) === vg.mainVehicleId);
    const vehicle = onMain[0]?.vehicleId || null;

    // Інструктори, які їздять на цьому авто (найактивніший — першим)
    const counts = new Map();
    const instructorsById = new Map();
    for (const l of onMain) {
      const id = idOf(l.instructorId);
      if (!id) continue;
      counts.set(id, (counts.get(id) || 0) + 1);
      instructorsById.set(id, l.instructorId);
    }
    const instructorIds = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a));

    // Причіп показуємо, якщо хоч одна вправа курсантів цього авто — з причепом
    const trailerId = mostFrequent(vg.lessons.map((l) => idOf(l.trailerId)));
    const trailer = trailerId
      ? vg.lessons.find((l) => idOf(l.trailerId) === trailerId).trailerId
      : null;

    return {
      mainVehicleId: vg.mainVehicleId,
      vehicleLabel: vehicleLabel(vehicle),
      trailerLabel: vehicleLabel(trailer),
      instructorIds: new Set(instructorIds),
      instructorNames: instructorIds.map((id) => shortName(instructorsById.get(id)?.fullName)),
      students: vg.students.sort((a, b) =>
        (a.student.fullName || "").localeCompare(b.student.fullName || "", "uk")
      ),
    };
  });

  // Групи з авто — за алфавітом першого курсанта, без занять — у кінці
  vehicles.sort((a, b) => {
    if (!a.mainVehicleId !== !b.mainVehicleId) return a.mainVehicleId ? -1 : 1;
    return (a.students[0].student.fullName || "").localeCompare(
      b.students[0].student.fullName || "",
      "uk"
    );
  });

  // Період навчання групи; заняття поза ним теж потрапляють у таблицю
  const lessonDates = new Set(lessons.map((l) => l.date));
  const periodStart = students.map((s) => s.startDate).sort()[0];
  const periodEnd = students.map((s) => s.endDate).sort().at(-1);
  const sortedLessonDates = [...lessonDates].sort();
  const days = buildStudyDays(
    [periodStart, sortedLessonDates[0]].filter(Boolean).sort()[0],
    [periodEnd, sortedLessonDates.at(-1)].filter(Boolean).sort().at(-1),
    lessonDates
  );

  // Клітинки: рядок часу і рядок вправи (з позначками) на кожен день
  let number = 0;
  const vehicleRows = vehicles.map((v) => ({
    vehicleLabel: v.vehicleLabel,
    trailerLabel: v.trailerLabel,
    instructorNames: v.instructorNames,
    students: v.students.map(({ student, lessons: own }) => {
      number += 1;
      const byDate = new Map();
      for (const l of own) {
        if (!byDate.has(l.date)) byDate.set(l.date, []);
        byDate.get(l.date).push(l);
      }
      const cells = {};
      for (const [date, dayLessons] of byDate) {
        cells[date] = {
          times: dayLessons.map((l) => formatTimeRange(l.startTime, l.endTime)),
          // Як у паперовому графіку: заняття з "чужим" інструктором — його
          // прізвище скорочено поруч з вправою ("2.2 СТЕБ"), на іншому авто —
          // марка нижче ("DACIA"), з причепом — "(з прич.)"
          exercises: dayLessons.map((l) => {
            let code = l.isExam ? "ІСПИТ" : l.exerciseCode;
            if (idOf(l.instructorId) && !v.instructorIds.has(idOf(l.instructorId))) {
              code += ` ${upper(l.instructorId.fullName).trim().split(/\s+/)[0].slice(0, 4)}`;
            }
            const notes = [];
            if (v.mainVehicleId && l.vehicleId && idOf(l.vehicleId) !== v.mainVehicleId) {
              notes.push(upper(l.vehicleId.brand).trim().split(/\s+/)[0]);
            }
            if (l.trailerId) notes.push("(з прич.)");
            return { code, notes };
          }),
        };
      }
      return { number, name: shortName(student.fullName), cells };
    }),
  }));

  const categories = [...new Set(students.map((s) => s.category).filter(Boolean))];

  return {
    group,
    categories,
    periodStart,
    periodEnd,
    periodLabel: { from: formatLongDate(periodStart), to: formatLongDate(periodEnd) },
    days: days.map((date) => ({ date, label: formatDayMonth(date) })),
    vehicles: vehicleRows,
  };
}

module.exports = {
  buildGroupSchedule,
  buildStudyDays,
  shortName,
  formatTimeRange,
  formatLongDate,
  BREAK_MIN_DAYS,
};
