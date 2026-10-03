const express = require("express");
const Instructor = require("../models/Instructor");
const Student = require("../models/Student");
const PlannedSchedule = require("../models/PlannedSchedule");
const Schedule = require("../models/Schedule");
const Vehicle = require("../models/Vehicle");
const Reminder = require("../models/Reminder");
const authMiddleware = require("../middlewares/authMiddleware");
const requireRole = require("../middlewares/requireRole");
const { getStudentStatus } = require("../utils/studentStatus");
const {
  syncInstructorReminders,
  syncVehicleReminders,
} = require("../utils/systemReminderSync");
const { DRIVING_CATEGORIES } = require("../config/categories");
const { todayKyiv, addMonths, isValidDateStr } = require("../utils/dates");
const {
  asyncHandler,
  badRequest,
  forbidden,
  notFound,
  conflict,
  isObjectId,
  escapeRegex,
  asString,
} = require("../utils/http");

const router = express.Router();

// Публічний список (потрібен на сторінці входу): лише ПІБ та категорії,
// без pinCode
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const instructors = await Instructor.find({})
      .select("fullName certificate")
      .sort({ fullName: 1 })
      .lean();
    res.status(200).json({ success: true, instructors });
  })
);

const STAFF_FIELDS = "fullName certificate medicalExamUntil sanitaryBookUntil";

// Список для адміна / бухгалтера: разом зі строками документів (медогляд,
// санітарна книжка). Публічний список вище цих даних не віддає.
router.get(
  "/staff",
  authMiddleware,
  requireRole.staff,
  asyncHandler(async (req, res) => {
    const instructors = await Instructor.find({})
      .select(STAFF_FIELDS)
      .sort({ fullName: 1 })
      .lean();
    res.status(200).json({ success: true, instructors });
  })
);

const DOCUMENT_FIELDS = {
  medicalExamUntil: "медогляду",
  sanitaryBookUntil: "санітарної книжки",
};

// Поля картки інструктора з тіла запиту. ПІБ і PIN задаються лише при
// створенні (за ПІБ інструктор входить у кабінет); при редагуванні —
// категорії та строки документів, лише ті поля, що прийшли в запиті.
function parseInstructorBody(body, { isNew }) {
  const data = {};

  if (isNew) {
    const fullName = asString(body.fullName)?.trim().replace(/\s+/g, " ");
    if (!fullName) throw badRequest("Вкажіть ПІБ інструктора");
    data.fullName = fullName.slice(0, 150);

    const pinCode = asString(body.pinCode);
    if (!/^\d{6}$/.test(pinCode || "")) throw badRequest("PIN має складатися з 6 цифр");
    data.pinCode = pinCode;
  }

  if (body.certificate !== undefined || isNew) {
    const list = Array.isArray(body.certificate) ? body.certificate : [];
    // Порядок як у довіднику (A1, A, B, …), без дублів і невідомих значень
    data.certificate = DRIVING_CATEGORIES.filter((c) => list.includes(c));
  }

  for (const [field, label] of Object.entries(DOCUMENT_FIELDS)) {
    if (body[field] === undefined) continue;
    const value = asString(body[field]) ?? "";
    if (value && !isValidDateStr(value)) throw badRequest(`Некоректна дата ${label}`);
    data[field] = value;
  }

  return data;
}

const pickStaffFields = (instructor) => ({
  _id: instructor._id,
  fullName: instructor.fullName,
  certificate: instructor.certificate,
  medicalExamUntil: instructor.medicalExamUntil,
  sanitaryBookUntil: instructor.sanitaryBookUntil,
});

// Додати інструктора (адмін або бухгалтер)
router.post(
  "/",
  authMiddleware,
  requireRole.staff,
  asyncHandler(async (req, res) => {
    const data = parseInstructorBody(req.body, { isNew: true });

    // Вхід у кабінет — за ПІБ, тож однакових ПІБ бути не може
    const duplicate = await Instructor.exists({
      fullName: { $regex: `^\\s*${escapeRegex(data.fullName)}\\s*$`, $options: "i" },
    });
    if (duplicate) throw conflict(`Інструктор "${data.fullName}" вже існує`);

    const instructor = await Instructor.create(data);
    await syncInstructorReminders(instructor);
    res.status(201).json({ success: true, instructor: pickStaffFields(instructor) });
  })
);

// Редагувати категорії та строки документів (адмін або бухгалтер).
// Після збереження оновлюються автоматичні нагадування.
router.put(
  "/:id",
  authMiddleware,
  requireRole.staff,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!isObjectId(id)) throw badRequest("Некоректний ID інструктора");

    const data = parseInstructorBody(req.body, { isNew: false });
    const instructor = await Instructor.findByIdAndUpdate(id, { $set: data }, { new: true })
      .select(STAFF_FIELDS);
    if (!instructor) throw notFound("Інструктора не знайдено");

    await syncInstructorReminders(instructor);
    res.status(200).json({ success: true, instructor: pickStaffFields(instructor) });
  })
);

// Прибирає посилання на видаленого інструктора: з карток курсантів,
// відповідальних за ТЗ і з нагадувань. Минулі заняття в графіках
// лишаються як історія.
async function removeInstructorReferences(id) {
  const identity = `instructor:${id}`;

  await Student.updateMany({ instructorIds: id }, { $pull: { instructorIds: id } });

  const vehicles = await Vehicle.find({ responsibleInstructorId: id });
  for (const vehicle of vehicles) {
    vehicle.responsibleInstructorId = null;
    vehicle.responsibleAssignedAt = null;
    await vehicle.save();
    await syncVehicleReminders(vehicle);
  }

  await Reminder.deleteMany({
    $or: [{ sourceInstructorId: id }, { createdByIdentity: identity }],
  });
  await Reminder.updateMany(
    { assignees: identity },
    { $pull: { assignees: identity, viewerStates: { identity } } }
  );
  // Картки, у яких не лишилось жодного виконавця, нікому не потрібні
  await Reminder.deleteMany({ assignees: { $size: 0 } });
}

// Видалити інструктора — тільки адмін. Не можна, поки в нього є
// заплановані заняття від сьогодні (спочатку їх треба передати іншому).
router.delete(
  "/:id",
  authMiddleware,
  requireRole.admin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!isObjectId(id)) throw badRequest("Некоректний ID інструктора");

    const instructor = await Instructor.findById(id).select("fullName").lean();
    if (!instructor) throw notFound("Інструктора не знайдено");

    const today = todayKyiv();
    const [planned, real] = await Promise.all([
      PlannedSchedule.countDocuments({ instructorId: id, date: { $gte: today } }),
      Schedule.countDocuments({ instructorId: id, date: { $gte: today } }),
    ]);
    if (planned || real) {
      const parts = [];
      if (planned) parts.push(`у плановому графіку — ${planned}`);
      if (real) parts.push(`у реальному графіку — ${real}`);
      throw conflict(
        `У інструктора ${instructor.fullName} є майбутні заняття (${parts.join(", ")}). Передайте їх іншому інструктору або видаліть, тоді повторіть.`
      );
    }

    await Instructor.deleteOne({ _id: id });
    await removeInstructorReferences(id);
    res.status(200).json({ success: true, message: "Інструктора видалено" });
  })
);

// Заняття на автодромі в плановому графіку поточного інструктора на дату.
// Інструктор не має доступу до самого планового графіка — повертаємо лише
// час занять для попередження в кабінеті.
router.get(
  "/me/autodrome",
  authMiddleware,
  requireRole("instructor"),
  asyncHandler(async (req, res) => {
    const date = asString(req.query.date);
    if (!isValidDateStr(date)) throw badRequest("Некоректна дата");

    const records = await PlannedSchedule.find({
      instructorId: req.user.id,
      date,
      isAutodrome: true,
    })
      .select("startTime endTime -_id")
      .sort({ startTime: 1 })
      .lean();

    res.status(200).json({ success: true, slots: records });
  })
);

// Журнал студентів, закріплених за інструктором.
// Показуємо: Активних, тих хто Очікує, і Неактивних, якщо дата закінчення
// навчання була не більше ніж місяць тому. Інструктор бачить лише свій
// журнал, адмін — будь-який.
router.get(
  "/:id/students",
  authMiddleware,
  requireRole("instructor", "admin"),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!isObjectId(id)) throw badRequest("Некоректний ID інструктора");
    if (req.user.role === "instructor" && req.user.id !== id) {
      throw forbidden("Можна переглядати лише власний журнал");
    }

    const today = todayKyiv();
    const oneMonthAgo = addMonths(today, -1);

    const query = { instructorIds: id };
    const search = asString(req.query.search)?.trim();
    if (search) {
      const pattern = { $regex: escapeRegex(search), $options: "i" };
      query.$or = [{ fullName: pattern }, { phone: pattern }, { group: pattern }];
    }

    const students = await Student.find(query)
      .select(
        "fullName phone group category startDate endDate comment instructorIds studyType isPreparation"
      )
      .sort({ fullName: 1 })
      .lean();

    const journal = students
      .map((s) => ({
        ...s,
        status: getStudentStatus(s.startDate, s.endDate, today),
        // Перший інструктор у списку вважається основним для курсанта
        isPrimary: (s.instructorIds || [])[0]?.toString() === id,
      }))
      .filter((s) => {
        if (s.status === "Активний" || s.status === "Очікує") return true;
        if (s.status === "Неактивний") return s.endDate >= oneMonthAgo;
        return false;
      });

    res.status(200).json({ success: true, students: journal });
  })
);

module.exports = router;
