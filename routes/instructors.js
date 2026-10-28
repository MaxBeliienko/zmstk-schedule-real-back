// Інструктори (/api/instructors): картки, пароль для входу (зберігається в
// обліковому записі Account), журнал курсантів і заняття на автодромі для
// кабінету інструктора.

const express = require("express");
const Instructor = require("../models/Instructor");
const Account = require("../models/Account");
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
const { setAccountPassword, saveAccount } = require("../utils/accounts");
const { withTransaction } = require("../utils/transaction");
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

// Список інструкторів (ПІБ і категорії) для будь-якого авторизованого користувача
router.get(
  "/",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const instructors = await Instructor.find({})
      .select("fullName certificate")
      .sort({ fullName: 1 })
      .lean();
    res.status(200).json({ success: true, instructors });
  })
);

const STAFF_FIELDS = "fullName certificate medicalExamUntil sanitaryBookUntil";

// Список для адміна / бухгалтера разом зі строками документів
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

// Поля картки з тіла запиту. При створенні обов'язкові ПІБ і пароль; при
// редагуванні змінюються лише передані поля. Пароль повертається окремо,
// бо зберігається в обліковому записі (Account), а не в картці
function parseInstructorBody(body, { isNew }) {
  const data = {};

  if (isNew || body.fullName !== undefined) {
    const fullName = asString(body.fullName)?.trim().replace(/\s+/g, " ");
    if (!fullName) throw badRequest("Вкажіть ПІБ інструктора");
    data.fullName = fullName.slice(0, 150);
  }

  const password = asString(body.password) || undefined;
  if (isNew && !password) throw badRequest("Вкажіть пароль інструктора");

  if (body.certificate !== undefined || isNew) {
    const list = Array.isArray(body.certificate) ? body.certificate : [];
    data.certificate = DRIVING_CATEGORIES.filter((c) => list.includes(c));
  }

  for (const [field, label] of Object.entries(DOCUMENT_FIELDS)) {
    if (body[field] === undefined) continue;
    const value = asString(body[field]) ?? "";
    if (value && !isValidDateStr(value)) throw badRequest(`Некоректна дата ${label}`);
    data[field] = value;
  }

  return { data, password };
}

// Чи є інструктор з таким ПІБ (без урахування регістру), крім exceptId
const fullNameTaken = (fullName, exceptId) =>
  Instructor.exists({
    fullName: { $regex: `^\\s*${escapeRegex(fullName)}\\s*$`, $options: "i" },
    ...(exceptId ? { _id: { $ne: exceptId } } : {}),
  });

// Поля картки для відповіді персоналу
const pickStaffFields = (instructor) => ({
  _id: instructor._id,
  fullName: instructor.fullName,
  certificate: instructor.certificate,
  medicalExamUntil: instructor.medicalExamUntil,
  sanitaryBookUntil: instructor.sanitaryBookUntil,
});

// Додати інструктора разом з обліковим записом для входу (адмін, бухгалтер).
// Пароль перевіряється до збереження картки, щоб не лишити інструктора без входу
router.post(
  "/",
  authMiddleware,
  requireRole.staff,
  asyncHandler(async (req, res) => {
    const { data, password } = parseInstructorBody(req.body, { isNew: true });
    if (await fullNameTaken(data.fullName)) {
      throw conflict(`Інструктор "${data.fullName}" вже існує`);
    }

    const instructor = new Instructor(data);
    const account = new Account({
      role: "instructor",
      fullName: instructor.fullName,
      instructorId: instructor._id,
    });
    await setAccountPassword(account, password);

    // Картка, обліковий запис і нагадування — разом або нічого
    await withTransaction(async () => {
      await instructor.save();
      await saveAccount(account);
      await syncInstructorReminders(instructor);
    });
    res.status(201).json({ success: true, instructor: pickStaffFields(instructor) });
  })
);

// Редагувати ПІБ, категорії, строки документів і пароль (адмін, бухгалтер).
// Новий пароль завершує всі сесії інструктора; після збереження оновлюються
// автоматичні нагадування
router.put(
  "/:id",
  authMiddleware,
  requireRole.staff,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!isObjectId(id)) throw badRequest("Некоректний ID інструктора");

    const { data, password } = parseInstructorBody(req.body, { isNew: false });
    const instructor = await Instructor.findById(id);
    if (!instructor) throw notFound("Інструктора не знайдено");
    if (data.fullName && (await fullNameTaken(data.fullName, id))) {
      throw conflict(`Інструктор "${data.fullName}" вже існує`);
    }

    const account =
      (await Account.findOne({ instructorId: id })) ||
      new Account({ role: "instructor", fullName: instructor.fullName, instructorId: id });
    if (password) await setAccountPassword(account, password);

    instructor.set(data);
    account.fullName = instructor.fullName;
    await withTransaction(async () => {
      await instructor.save();
      await saveAccount(account);
      await syncInstructorReminders(instructor);
    });
    res.status(200).json({
      success: true,
      instructor: pickStaffFields(instructor),
      passwordChanged: Boolean(password),
    });
  })
);

// Прибирає посилання на видаленого інструктора з курсантів, ТЗ і нагадувань.
// Минулі заняття в графіках лишаються як історія
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
  // Картки без жодного виконавця нікому не потрібні
  await Reminder.deleteMany({ assignees: { $size: 0 } });
}

// Видалити інструктора (лише адмін). Не можна, поки є майбутні заняття:
// їх спершу треба передати іншому інструктору
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

    // Картка, обліковий запис і всі посилання прибираються разом або нічого
    await withTransaction(async () => {
      await Instructor.deleteOne({ _id: id });
      await Account.deleteOne({ instructorId: id });
      await removeInstructorReferences(id);
    });
    res.status(200).json({ success: true, message: "Інструктора видалено" });
  })
);

// Час занять на автодромі в плановому графіку поточного інструктора —
// для попередження в кабінеті (сам плановий графік інструктору недоступний)
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

// Журнал курсантів інструктора: активні, ті, що очікують, і ті, хто закінчив
// не більше місяця тому. Інструктор бачить лише свій журнал
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
        // Перший інструктор у списку курсанта — основний
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
