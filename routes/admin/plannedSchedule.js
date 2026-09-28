const express = require("express");
const Student = require("../../models/Student");
const Instructor = require("../../models/Instructor");
const Vehicle = require("../../models/Vehicle");
const ExerciseCategory = require("../../models/Exercise");
const PlannedSchedule = require("../../models/PlannedSchedule");
const requireRole = require("../../middlewares/requireRole");
const {
  getStudentStatus,
  compareByStatusThenName,
} = require("../../utils/studentStatus");
const {
  isValidDateStr,
  isValidTimeStr,
  timeToMinutes,
  minutesToTime,
  addMonths,
  dateRangeError,
} = require("../../utils/dates");
const {
  PLANNED_DAY_START,
  PLANNED_DAY_END,
  MAX_GRID_RANGE_DAYS,
} = require("../../config/timeSlots");
const { withLocks } = require("../../utils/keyedLock");
const {
  asyncHandler,
  badRequest,
  notFound,
  conflict,
  isObjectId,
  asString,
} = require("../../utils/http");

const router = express.Router();

// Весь плановий графік — лише для адміністратора
router.use(requireRole.admin);

const EXAM_CODE = "Іспит";
const isExamCode = (code) => code === EXAM_CODE || code.toLowerCase().includes("іспит");

// Перетин інтервалів часу [startA, endA) та [startB, endB) у форматі HH:MM
const isOverlapping = (startA, endA, startB, endB) =>
  startA < endB && startB < endA;

const idOf = (value) => (value ? (value._id || value).toString() : null);

// Отримати всі вже призначені вправи курсанта (по всьому графіку)
router.get(
  "/student-schedules/:studentId",
  asyncHandler(async (req, res) => {
    const { studentId } = req.params;
    if (!isObjectId(studentId)) throw badRequest("Некоректний ID курсанта");

    const records = await PlannedSchedule.find({ studentId })
      .select("exerciseCode")
      .lean();
    res.status(200).json({
      success: true,
      exerciseCodes: records.map((s) => s.exerciseCode),
    });
  })
);

// Отримати плановий графік (фільтр за інструктором і діапазоном дат)
router.get(
  "/planned-schedule",
  asyncHandler(async (req, res) => {
    const instructorId = asString(req.query.instructorId);
    const startDate = asString(req.query.startDate);
    const endDate = asString(req.query.endDate);
    const filter = {};

    if (instructorId) {
      if (!isObjectId(instructorId)) throw badRequest("Некоректний ID інструктора");
      filter.instructorId = instructorId;
    }
    // Діапазон обов'язковий: без нього запит віддавав усю колекцію
    const rangeError = dateRangeError(startDate, endDate, MAX_GRID_RANGE_DAYS);
    if (rangeError) throw badRequest(rangeError);
    filter.date = { $gte: startDate, $lte: endDate };

    const schedules = await PlannedSchedule.find(filter)
      .populate("studentId", "fullName group category isPreparation")
      .populate("vehicleId", "brand plateNumber isTrailer isTowbar")
      .populate("trailerId", "brand plateNumber")
      .sort({ date: 1, startTime: 1 })
      .lean();

    res.status(200).json({ success: true, schedules });
  })
);

// Перевіряє конфлікти бронювання (ТЗ / причіп / курсант / інструктор) на
// певну дату. excludeId — поточний запис при редагуванні. Повертає текст
// помилки або null.
async function findConflict({
  date,
  startTime,
  endTime,
  vehicleId,
  trailerId,
  studentId,
  instructorId,
  excludeId,
}) {
  const filter = { date };
  if (excludeId) filter._id = { $ne: excludeId };

  const sameDate = await PlannedSchedule.find(filter)
    .populate("instructorId", "fullName")
    .populate("studentId", "fullName")
    .populate("vehicleId", "brand plateNumber")
    .populate("trailerId", "brand plateNumber")
    .lean();

  for (const slot of sameDate) {
    if (!isOverlapping(startTime, endTime, slot.startTime, slot.endTime)) continue;

    const time = `${slot.startTime}-${slot.endTime}`;
    const who = slot.instructorId?.fullName || "—";
    // ТЗ і причіп — з одного пулу транспорту: причіп не може бути
    // одночасно в двох заняттях, як і авто
    const busyTransport = [idOf(slot.vehicleId), idOf(slot.trailerId)];

    if (vehicleId && busyTransport.includes(vehicleId)) {
      const v = idOf(slot.vehicleId) === vehicleId ? slot.vehicleId : slot.trailerId;
      return `Транспортний засіб (${v?.brand || "—"}) вже зайнятий у цей час (${time}) у інструктора ${who}!`;
    }
    if (trailerId && busyTransport.includes(trailerId)) {
      const t = idOf(slot.trailerId) === trailerId ? slot.trailerId : slot.vehicleId;
      return `Причіп (${t?.brand || "—"}) вже зайнятий у цей час (${time}) у інструктора ${who}!`;
    }
    if (studentId && idOf(slot.studentId) === studentId) {
      return `Курсант (${slot.studentId?.fullName || "—"}) вже має заняття у цей час (${time}) у інструктора ${who}!`;
    }
    if (instructorId && idOf(slot.instructorId) === instructorId) {
      return `Інструктор ${who} вже має інше заняття у цей час (${time})!`;
    }
  }

  return null;
}

// Збирає і перевіряє повний запис заняття. Тривалість, автодром і час
// завершення беремо з довідника вправ (а не з клієнта), щоб у графік не
// потрапили некоректні години.
async function buildSlot(input) {
  const instructorId = asString(input.instructorId);
  const studentId = asString(input.studentId);
  const vehicleId = asString(input.vehicleId);
  const trailerId = asString(input.trailerId) || null;
  const exerciseCode = asString(input.exerciseCode)?.trim();
  const category = asString(input.category)?.trim();
  const date = asString(input.date);
  const startTime = asString(input.startTime);

  if (!isObjectId(instructorId)) throw badRequest("Некоректний інструктор");
  if (!isObjectId(studentId)) throw badRequest("Оберіть курсанта");
  if (!isObjectId(vehicleId)) throw badRequest("Оберіть транспортний засіб");
  if (trailerId && !isObjectId(trailerId)) throw badRequest("Некоректний причіп");
  if (!exerciseCode) throw badRequest("Оберіть вправу");
  if (!category) throw badRequest("Вкажіть категорію");
  if (!isValidDateStr(date)) throw badRequest("Некоректна дата");
  if (!isValidTimeStr(startTime)) {
    throw badRequest("Час початку має бути у форматі ГГ:ХХ (напр. 08:00)");
  }

  const [instructor, student, vehicle, trailer] = await Promise.all([
    Instructor.exists({ _id: instructorId }),
    Student.findById(studentId).select("isPreparation fullName").lean(),
    Vehicle.findById(vehicleId).select("isTrailer").lean(),
    trailerId ? Vehicle.findById(trailerId).select("isTrailer").lean() : null,
  ]);
  if (!instructor) throw badRequest("Інструктора не знайдено");
  if (!student) throw badRequest("Курсанта не знайдено");
  if (!vehicle) throw badRequest("Транспортний засіб не знайдено");
  if (vehicle.isTrailer) throw badRequest("Причіп не може бути основним транспортним засобом");
  if (trailerId && trailerId === vehicleId) throw badRequest("ТЗ і причіп мають бути різними");
  if (trailerId && !trailer?.isTrailer) throw badRequest("Обраний причіп не знайдено");

  const exerciseCategory = await ExerciseCategory.findOne({
    category,
    isPreparation: Boolean(student.isPreparation),
  }).lean();
  const exercise = exerciseCategory?.exercises.find((e) => e.code === exerciseCode);
  if (!exercise) {
    throw badRequest(`Вправу "${exerciseCode}" не знайдено для категорії ${category}`);
  }

  const endMinutes = timeToMinutes(startTime) + Math.round(exercise.hours * 60);
  if (
    timeToMinutes(startTime) < timeToMinutes(PLANNED_DAY_START) ||
    endMinutes > timeToMinutes(PLANNED_DAY_END)
  ) {
    throw badRequest(
      `Заняття має бути в межах ${PLANNED_DAY_START}–${PLANNED_DAY_END} (зараз закінчується о ${minutesToTime(endMinutes)})`
    );
  }
  const endTime = minutesToTime(endMinutes);

  return {
    instructorId,
    studentId,
    category,
    exerciseCode,
    vehicleId,
    trailerId,
    date,
    startTime,
    endTime,
    timeSlot: `${startTime}-${endTime}`,
    hours: exercise.hours,
    isAutodrome: Boolean(exercise.isAutodrome),
    isExam: isExamCode(exerciseCode) || Boolean(input.isExam),
  };
}

async function assertNoConflicts(slot, excludeId) {
  const duplicateExercise = await PlannedSchedule.exists({
    studentId: slot.studentId,
    exerciseCode: slot.exerciseCode,
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  });
  if (duplicateExercise) {
    throw conflict(`Курсант вже має вправу "${slot.exerciseCode}" у плановому графіку!`);
  }

  const message = await findConflict({ ...slot, excludeId });
  if (message) throw conflict(message);
}

// Дубль вправи, який "проскочив" попередню перевірку, відловить унікальний
// індекс — перетворюємо його на зрозуміле повідомлення
function rethrowDuplicate(err, exerciseCode) {
  if (err?.code === 11000) {
    throw conflict(`Курсант вже має вправу "${exerciseCode}" у плановому графіку!`);
  }
  throw err;
}

// Додати заняття
router.post(
  "/planned-schedule",
  asyncHandler(async (req, res) => {
    const slot = await buildSlot(req.body);

    const saved = await withLocks([`planned:${slot.date}`], async () => {
      await assertNoConflicts(slot);
      return PlannedSchedule.create(slot).catch((err) =>
        rethrowDuplicate(err, slot.exerciseCode)
      );
    });

    res.status(201).json({ success: true, slot: saved });
  })
);

// Редагувати заняття
router.put(
  "/planned-schedule/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!isObjectId(id)) throw badRequest("Некоректний ID заняття");

    const existing = await PlannedSchedule.findById(id).lean();
    if (!existing) throw notFound("Запис не знайдено");

    // Непередані поля беремо з наявного запису
    const merged = {
      instructorId: idOf(existing.instructorId),
      studentId: idOf(existing.studentId),
      vehicleId: idOf(existing.vehicleId),
      trailerId: idOf(existing.trailerId),
      category: existing.category,
      exerciseCode: existing.exerciseCode,
      date: existing.date,
      startTime: existing.startTime,
      isExam: existing.isExam,
    };
    for (const key of Object.keys(merged)) {
      if (req.body[key] !== undefined) merged[key] = req.body[key];
    }
    if (merged.trailerId === "") merged.trailerId = null;

    const slot = await buildSlot(merged);

    const updated = await withLocks(
      [`planned:${existing.date}`, `planned:${slot.date}`],
      async () => {
        await assertNoConflicts(slot, id);
        return PlannedSchedule.findByIdAndUpdate(id, slot, {
          new: true,
          runValidators: true,
        }).catch((err) => rethrowDuplicate(err, slot.exerciseCode));
      }
    );

    res.json({ success: true, slot: updated });
  })
);

// Видалити заняття
router.delete(
  "/planned-schedule/:id",
  asyncHandler(async (req, res) => {
    if (!isObjectId(req.params.id)) throw badRequest("Некоректний ID заняття");
    const deleted = await PlannedSchedule.findByIdAndDelete(req.params.id);
    if (!deleted) throw notFound("Запис не знайдено");
    res.json({ success: true, message: "Заняття успішно видалено" });
  })
);

// Вільні курсанти та ТЗ на заданий інтервал часу
router.get(
  "/planned-schedule/available-resources",
  asyncHandler(async (req, res) => {
    const date = asString(req.query.date);
    const startTime = asString(req.query.startTime);
    const endTime = asString(req.query.endTime);
    const category = asString(req.query.category);
    const currentScheduleId = asString(req.query.currentScheduleId)?.trim();
    const includeArchive = req.query.includeArchive === "true";

    if (!isValidDateStr(date) || !isValidTimeStr(startTime) || !isValidTimeStr(endTime)) {
      throw badRequest("Обов'язкові параметри: date, startTime, endTime (ГГ:ХХ)");
    }

    // 1. Зайняті курсанти й транспорт на цей час
    const daySchedules = await PlannedSchedule.find({ date }).lean();
    const occupiedStudentIds = new Set();
    const occupiedVehicleIds = new Set();

    for (const slot of daySchedules) {
      if (currentScheduleId && slot._id.toString() === currentScheduleId) continue;
      if (!isOverlapping(startTime, endTime, slot.startTime, slot.endTime)) continue;
      if (slot.studentId) occupiedStudentIds.add(slot.studentId.toString());
      if (slot.vehicleId) occupiedVehicleIds.add(slot.vehicleId.toString());
      if (slot.trailerId) occupiedVehicleIds.add(slot.trailerId.toString());
    }

    // 2. Курсанти лише напрямку "Практика"
    const studentFilter = {
      _id: { $nin: [...occupiedStudentIds] },
      studyType: "Практика",
    };
    // Архівних (завершили навчання > 6 міс. тому) відсікаємо ще в БД
    if (!includeArchive) studentFilter.endDate = { $gte: addMonths(date, -6) };
    if (category) studentFilter.category = category;

    const candidates = await Student.find(studentFilter)
      .select("fullName group category isPreparation startDate endDate studyType")
      .lean();

    const students = candidates
      .map((s) => ({ ...s, status: getStudentStatus(s.startDate, s.endDate, date) }))
      .filter((s) => includeArchive || s.status !== "Архів")
      .sort(compareByStatusThenName);

    // 3. Вільний транспорт
    const vehicleFilter = { _id: { $nin: [...occupiedVehicleIds] } };
    if (category) vehicleFilter.category = { $in: [category] };
    const vehicles = await Vehicle.find(vehicleFilter).lean();

    res.status(200).json({ success: true, students, vehicles });
  })
);

module.exports = router;
