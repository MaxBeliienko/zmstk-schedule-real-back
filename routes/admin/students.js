const express = require("express");
const Student = require("../../models/Student");
const Instructor = require("../../models/Instructor");
const ExerciseCategory = require("../../models/Exercise");
const PlannedSchedule = require("../../models/PlannedSchedule");
const requireRole = require("../../middlewares/requireRole");
const {
  getStudentStatus,
  compareByStatusThenName,
} = require("../../utils/studentStatus");
const { isValidDateStr, todayKyiv, addMonths } = require("../../utils/dates");
const {
  asyncHandler,
  badRequest,
  notFound,
  isObjectId,
  escapeRegex,
  asString,
} = require("../../utils/http");

const router = express.Router();

const STUDY_TYPES = ["Теорія", "Практика"];
const HISTORY_ROLE = { admin: "Admin", accountant: "Accountant" };

// Гроші зберігаємо з точністю до копійки. Від'ємні / нечислові значення —
// помилка, а не мовчазний 0 (раніше так можна було випадково обнулити суму)
function parseMoney(value, label) {
  if (value === "" || value === null || value === undefined) return 0;
  const parsed = Number(String(value).replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw badRequest(`Некоректна сума: ${label}`);
  }
  return Math.round(parsed * 100) / 100;
}

async function parseInstructorIds(value) {
  if (!Array.isArray(value)) return [];
  const ids = [...new Set(value.filter(isObjectId))];
  if (ids.length === 0) return [];
  const existing = await Instructor.find({ _id: { $in: ids } }).select("_id").lean();
  const existingSet = new Set(existing.map((i) => i._id.toString()));
  // Зберігаємо порядок: перший інструктор — основний
  return ids.filter((id) => existingSet.has(id));
}

// Поля, які можна змінювати в картці курсанта. Для PUT беремо лише ті,
// що прийшли в запиті — поля, яких немає в тілі, лишаються без змін.
async function parseStudentBody(body, { requireAll }) {
  const data = {};
  const has = (field) => body[field] !== undefined || requireAll;

  if (has("fullName")) {
    const fullName = asString(body.fullName)?.trim().replace(/\s+/g, " ");
    if (!fullName) throw badRequest("Вкажіть ПІБ курсанта");
    data.fullName = fullName.slice(0, 150);
  }
  if (has("group")) {
    const group = asString(body.group)?.trim();
    if (!group) throw badRequest("Вкажіть групу");
    data.group = group.slice(0, 50);
  }
  if (has("category")) {
    const category = asString(body.category)?.trim();
    if (!category) throw badRequest("Вкажіть категорію");
    data.category = category;
  }
  if (has("startDate")) {
    if (!isValidDateStr(body.startDate)) throw badRequest("Некоректна дата початку");
    data.startDate = body.startDate;
  }
  if (has("endDate")) {
    if (!isValidDateStr(body.endDate)) throw badRequest("Некоректна дата завершення");
    data.endDate = body.endDate;
  }
  if (has("studyType")) {
    if (!STUDY_TYPES.includes(body.studyType)) {
      throw badRequest("Некоректний напрямок навчання");
    }
    data.studyType = body.studyType;
  }

  if (body.phone !== undefined) data.phone = (asString(body.phone) || "").slice(0, 30);
  if (body.isPreparation !== undefined) data.isPreparation = Boolean(body.isPreparation);
  if (body.reviewLeft !== undefined) data.reviewLeft = Boolean(body.reviewLeft);
  for (const field of ["comment", "examAttempt", "details", "reviewPlatform"]) {
    if (body[field] !== undefined) {
      data[field] = (asString(body[field]) || "").slice(0, 2000);
    }
  }
  if (body.instructorIds !== undefined) {
    data.instructorIds = await parseInstructorIds(body.instructorIds);
  }
  if (body.cost !== undefined || requireAll) data.cost = parseMoney(body.cost, "вартість");
  if (body.prepayment !== undefined) {
    data.prepayment = parseMoney(body.prepayment, "передплата");
  }

  return data;
}

function assertStudentConsistency(student) {
  if (student.endDate <= student.startDate) {
    throw badRequest("Дата завершення має бути пізнішою за дату початку навчання!");
  }
  if ((student.prepayment || 0) > (student.cost || 0)) {
    throw badRequest("Передплата не може бути більшою за загальну вартість!");
  }
}

// ================= КУРСАНТИ =================

// Список курсантів (адмін і бухгалтер)
router.get(
  "/students",
  requireRole.staff,
  asyncHandler(async (req, res) => {
    const includeArchive = req.query.includeArchive === "true";
    const search = asString(req.query.search)?.trim();
    const today = todayKyiv();

    const query = {};
    if (search) {
      const pattern = { $regex: escapeRegex(search), $options: "i" };
      query.$or = [{ fullName: pattern }, { group: pattern }];
    }
    // Архів (завершили навчання > 6 міс. тому) відсікаємо ще в БД
    if (!includeArchive) query.endDate = { $gte: addMonths(today, -6) };

    const students = await Student.find(query)
      .populate("instructorIds", "fullName")
      .lean();

    const processed = students
      .map((s) => ({ ...s, status: getStudentStatus(s.startDate, s.endDate, today) }))
      .filter((s) => includeArchive || s.status !== "Архів")
      .sort(compareByStatusThenName);

    res.status(200).json({ success: true, students: processed });
  })
);

// Створення курсанта (адмін і бухгалтер)
router.post(
  "/students",
  requireRole.staff,
  asyncHandler(async (req, res) => {
    const data = await parseStudentBody(req.body, { requireAll: true });
    data.prepayment = data.prepayment ?? 0;
    assertStudentConsistency(data);

    data.prepaymentHistory =
      data.prepayment > 0
        ? [
            {
              amount: data.prepayment,
              delta: data.prepayment,
              role: HISTORY_ROLE[req.user.role],
              createdAt: new Date(),
            },
          ]
        : [];

    const student = await Student.create(data);
    res.status(201).json({ success: true, student });
  })
);

// Редагування курсанта (адмін і бухгалтер мають рівні права; бухгалтеру
// заборонене лише видалення)
router.put(
  "/students/:id",
  requireRole.staff,
  asyncHandler(async (req, res) => {
    if (!isObjectId(req.params.id)) throw badRequest("Некоректний ID курсанта");

    const student = await Student.findById(req.params.id);
    if (!student) throw notFound("Студента не знайдено");

    const data = await parseStudentBody(req.body, { requireAll: false });
    const oldPrep = student.prepayment || 0;

    student.set(data);
    assertStudentConsistency(student);

    // Точний розрахунок різниці в копійках (без похибок IEEE 754)
    const delta = Math.round(((student.prepayment || 0) - oldPrep) * 100) / 100;
    if (delta !== 0) {
      student.prepaymentHistory.push({
        amount: student.prepayment,
        delta,
        role: HISTORY_ROLE[req.user.role],
        createdAt: new Date(),
      });
    }

    await student.save();
    res.status(200).json({ success: true, student });
  })
);

// Видалення курсанта — тільки адмін
router.delete(
  "/students/:id",
  requireRole.admin,
  asyncHandler(async (req, res) => {
    if (!isObjectId(req.params.id)) throw badRequest("Некоректний ID курсанта");

    const deleted = await Student.findByIdAndDelete(req.params.id);
    if (!deleted) throw notFound("Студента не знайдено");

    // Також видаляємо всі заплановані заняття цього курсанта
    await PlannedSchedule.deleteMany({ studentId: req.params.id });

    res.status(200).json({ success: true, message: "Студента успішно видалено" });
  })
);

// Зведена таблиця курсантів за період: курсанти напрямку "Практика", у
// яких період навчання (startDate–endDate) перетинається з обраним
// діапазоном. Тільки адмін.
router.get(
  "/students-summary",
  requireRole.admin,
  asyncHandler(async (req, res) => {
    const startDate = asString(req.query.startDate);
    const endDate = asString(req.query.endDate);
    if (!isValidDateStr(startDate) || !isValidDateStr(endDate)) {
      throw badRequest("Вкажіть початкову та кінцеву дати діапазону");
    }

    const students = await Student.find({
      studyType: "Практика",
      startDate: { $lte: endDate },
      endDate: { $gte: startDate },
    })
      .sort({ fullName: 1 })
      .populate("instructorIds", "fullName")
      .lean();

    res.status(200).json({ success: true, students });
  })
);

// Детальна статистика занять курсанта за вправами
router.get(
  "/students/:id/details",
  requireRole.staff,
  asyncHandler(async (req, res) => {
    const studentId = req.params.id;
    if (!isObjectId(studentId)) throw badRequest("Некоректний ID курсанта");

    const student = await Student.findById(studentId).lean();
    if (!student) throw notFound("Курсанта не знайдено");

    const [exerciseCategory, studentSchedules] = await Promise.all([
      ExerciseCategory.findOne({
        category: student.category,
        isPreparation: Boolean(student.isPreparation),
      }).lean(),
      PlannedSchedule.find({ studentId })
        .populate("instructorId", "fullName")
        .populate("vehicleId", "brand plateNumber")
        .sort({ date: 1, startTime: 1 })
        .lean(),
    ]);

    const exerciseList = exerciseCategory?.exercises || [];

    const exercises = exerciseList.map((ex) => {
      const records = studentSchedules.filter((s) => s.exerciseCode === ex.code);
      return {
        code: ex.code,
        requiredHours: ex.hours,
        isAutodrome: ex.isAutodrome,
        completedHours: records.reduce((sum, item) => sum + (item.hours || 0), 0),
        sessions: records.map((r) => ({
          id: r._id,
          date: r.date,
          startTime: r.startTime,
          hours: r.hours,
          instructorName: r.instructorId?.fullName || "—",
          vehicle: r.vehicleId
            ? `${r.vehicleId.brand} (${r.vehicleId.plateNumber})`
            : "Без ТЗ",
        })),
      };
    });

    res.status(200).json({ success: true, student, exercises });
  })
);

module.exports = router;
