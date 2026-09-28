const express = require("express");
const Schedule = require("../models/Schedule");
const Instructor = require("../models/Instructor");
const authMiddleware = require("../middlewares/authMiddleware");
const requireRole = require("../middlewares/requireRole");
const {
  REAL_TIME_SLOTS,
  INSTRUCTOR_EDIT_DAYS_BACK,
  MAX_GRID_RANGE_DAYS,
} = require("../config/timeSlots");
const {
  todayKyiv,
  addDays,
  isValidDateStr,
  dateRangeError,
} = require("../utils/dates");
const { withLock } = require("../utils/keyedLock");
const {
  asyncHandler,
  badRequest,
  forbidden,
  notFound,
  conflict,
  isObjectId,
  asString,
} = require("../utils/http");

const router = express.Router();

router.use(authMiddleware);

// Нормалізує ПІБ для порівняння (регістр і зайві пробіли не мають значення)
const normalizeName = (name) =>
  name.trim().replace(/\s+/g, " ").toLocaleLowerCase("uk");

// Інструктор працює лише зі своїм графіком; адмін/бухгалтер — з будь-яким
function assertCanAccessInstructor(user, instructorId) {
  if (user.role === "instructor" && user.id !== instructorId) {
    throw forbidden("Можна працювати лише з власним графіком");
  }
}

// Графік одного інструктора на день (повна сітка слотів)
router.get(
  "/instructor-day",
  requireRole("instructor", "admin", "accountant"),
  asyncHandler(async (req, res) => {
    const date = asString(req.query.date);
    const instructorId = asString(req.query.instructorId);
    if (!isValidDateStr(date) || !isObjectId(instructorId)) {
      throw badRequest("Не вказано дату або ID інструктора");
    }
    assertCanAccessInstructor(req.user, instructorId);

    const instructor = await Instructor.findById(instructorId)
      .select("fullName certificate")
      .lean();
    if (!instructor) throw notFound("Інструктора не знайдено");

    const records = await Schedule.find({ date, instructorId }).lean();
    const bySlot = new Map(records.map((r) => [r.timeSlot, r]));

    const slots = REAL_TIME_SLOTS.map((timeSlot) => {
      const match = bySlot.get(timeSlot);
      return {
        timeSlot,
        vehicleId: match?.vehicleId ?? null,
        location: match?.location ?? "",
        studentName: match?.studentName ?? "",
        isGarage: Boolean(match?.isGarage),
      };
    });

    res.status(200).json({
      success: true,
      slots,
      instructor: {
        id: instructor._id,
        fullName: instructor.fullName,
        certificate: instructor.certificate || [],
      },
    });
  })
);

// Зведений день по всіх інструкторах
router.get(
  "/admin-day",
  requireRole.staff,
  asyncHandler(async (req, res) => {
    const date = asString(req.query.date);
    if (!isValidDateStr(date)) throw badRequest("Вкажіть дату");

    const schedules = await Schedule.find({ date })
      .populate("instructorId", "fullName")
      .populate("vehicleId", "brand plateNumber")
      .lean();
    res.status(200).json({ success: true, schedules });
  })
);

// Графік одного інструктора за період
router.get(
  "/admin-instructor-period",
  requireRole.staff,
  asyncHandler(async (req, res) => {
    const instructorId = asString(req.query.instructorId);
    const startDate = asString(req.query.startDate);
    const endDate = asString(req.query.endDate);

    if (!isObjectId(instructorId)) throw badRequest("Некоректний ID інструктора");
    const rangeError = dateRangeError(startDate, endDate, MAX_GRID_RANGE_DAYS);
    if (rangeError) throw badRequest(rangeError);

    const schedules = await Schedule.find({
      instructorId,
      date: { $gte: startDate, $lte: endDate },
    })
      .populate("vehicleId", "brand plateNumber")
      .lean();

    res.status(200).json({ success: true, schedules });
  })
);

// Перетворює слот із запиту на нормалізований вигляд (або кидає 400)
function normalizeSlot(raw) {
  const timeSlot = asString(raw?.timeSlot);
  if (!REAL_TIME_SLOTS.includes(timeSlot)) {
    throw badRequest(`Некоректний часовий слот: ${timeSlot}`);
  }

  const isGarage = Boolean(raw.isGarage);
  const vehicleRaw = asString(raw.vehicleId)?.trim() || "";
  if (vehicleRaw && !isObjectId(vehicleRaw)) {
    throw badRequest(`Некоректне ТЗ у слоті ${timeSlot}`);
  }

  const studentName = isGarage
    ? ""
    : (asString(raw.studentName) || "").trim().replace(/\s+/g, " ").slice(0, 150);
  const location = isGarage ? "" : (asString(raw.location) || "").slice(0, 100);

  return {
    timeSlot,
    isGarage,
    vehicleId: vehicleRaw || null,
    studentName,
    location,
    isEmpty: !vehicleRaw && !studentName && !isGarage,
  };
}

// Збереження графіка інструктора на день
router.post(
  "/save",
  requireRole("instructor", "admin"),
  asyncHandler(async (req, res) => {
    const date = asString(req.body.date);
    const instructorId = asString(req.body.instructorId);
    const { slots } = req.body;

    if (!isValidDateStr(date) || !isObjectId(instructorId)) {
      throw badRequest("Некоректна дата або ID інструктора");
    }
    if (!Array.isArray(slots) || slots.length > REAL_TIME_SLOTS.length) {
      throw badRequest("Некоректний список слотів");
    }
    assertCanAccessInstructor(req.user, instructorId);

    // Та сама межа, що й у календарі кабінету: не раніше ніж позавчора
    if (req.user.role === "instructor") {
      const minDate = addDays(todayKyiv(), -INSTRUCTOR_EDIT_DAYS_BACK);
      if (date < minDate) {
        throw badRequest(
          "Редагувати графік можна лише за останні 2 дні та на майбутнє"
        );
      }
    }

    const normalized = slots.map(normalizeSlot);
    const timeSlots = normalized.map((s) => s.timeSlot);
    if (new Set(timeSlots).size !== timeSlots.length) {
      throw badRequest("Слоти в запиті повторюються");
    }

    // Перевірка конфліктів і збереження — атомарно відносно інших
    // збережень на цю ж дату (інакше два інструктори могли б одночасно
    // забронювати одне авто)
    await withLock(`real:${date}`, async () => {
      const others = await Schedule.find({
        date,
        timeSlot: { $in: timeSlots },
        instructorId: { $ne: instructorId },
      })
        .populate("instructorId", "fullName")
        .populate("vehicleId", "brand plateNumber")
        .lean();

      const errors = [];
      for (const slot of normalized) {
        if (slot.isEmpty) continue;
        const sameTime = others.filter((o) => o.timeSlot === slot.timeSlot);

        const vehicleConflict =
          slot.vehicleId &&
          sameTime.find((o) => o.vehicleId?._id?.toString() === slot.vehicleId);
        if (vehicleConflict) {
          errors.push({
            timeSlot: slot.timeSlot,
            message: `Автомобіль ${vehicleConflict.vehicleId.brand} (${vehicleConflict.vehicleId.plateNumber}) вже використовується інструктором ${vehicleConflict.instructorId?.fullName || "—"}`,
          });
          continue;
        }

        if (slot.studentName) {
          const target = normalizeName(slot.studentName);
          const studentConflict = sameTime.find(
            (o) => o.studentName && normalizeName(o.studentName) === target
          );
          if (studentConflict) {
            errors.push({
              timeSlot: slot.timeSlot,
              message: `Курсант "${slot.studentName}" у цей час вже записаний до інструктора ${studentConflict.instructorId?.fullName || "—"}`,
            });
          }
        }
      }

      if (errors.length > 0) {
        throw badRequest("Виявлено конфлікти бронювання!", { errors });
      }

      const operations = normalized.map((slot) => {
        const filter = { date, instructorId, timeSlot: slot.timeSlot };
        if (slot.isEmpty) return { deleteOne: { filter } };
        return {
          updateOne: {
            filter,
            update: {
              $set: {
                vehicleId: slot.vehicleId,
                location: slot.location,
                studentName: slot.studentName,
                isGarage: slot.isGarage,
              },
            },
            upsert: true,
          },
        };
      });

      if (operations.length > 0) {
        await Schedule.bulkWrite(operations).catch((err) => {
          // Спрацював унікальний індекс "одне авто на слот" — паралельне
          // збереження іншого інструктора встигло раніше
          if (err?.code === 11000) {
            throw conflict(
              "Авто щойно забронював інший інструктор. Оновіть сторінку й спробуйте ще раз."
            );
          }
          throw err;
        });
      }
    });

    res.status(200).json({ success: true, message: "Графік успішно збережено!" });
  })
);

module.exports = router;
