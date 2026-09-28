const express = require("express");
const Instructor = require("../models/Instructor");
const Student = require("../models/Student");
const PlannedSchedule = require("../models/PlannedSchedule");
const authMiddleware = require("../middlewares/authMiddleware");
const requireRole = require("../middlewares/requireRole");
const { getStudentStatus } = require("../utils/studentStatus");
const { todayKyiv, addMonths, isValidDateStr } = require("../utils/dates");
const {
  asyncHandler,
  badRequest,
  forbidden,
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
