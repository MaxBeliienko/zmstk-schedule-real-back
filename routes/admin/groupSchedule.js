// Word-документ "Графік черговості навчання водінню" для групи (лише адмін).
// Дані збирає utils/groupSchedule.js, файл .docx будує utils/groupScheduleDocx.js.

const express = require("express");
const Student = require("../../models/Student");
const PlannedSchedule = require("../../models/PlannedSchedule");
const requireRole = require("../../middlewares/requireRole");
const { buildGroupSchedule } = require("../../utils/groupSchedule");
const { renderGroupScheduleDocx } = require("../../utils/groupScheduleDocx");
const { asyncHandler, badRequest, notFound, escapeRegex, asString } = require("../../utils/http");

const router = express.Router();

// Повертає файл .docx для групи з ?group=. У графік потрапляють курсанти
// "Практика" та всі, хто вже має заняття в плановому графіку
router.get(
  "/group-schedule/document",
  requireRole.admin,
  asyncHandler(async (req, res) => {
    const group = asString(req.query.group)?.trim();
    if (!group) throw badRequest("Вкажіть номер групи");
    if (group.length > 50) throw badRequest("Некоректний номер групи");

    // Пробіли навколо номера групи в старих записах не заважають пошуку
    const groupStudents = await Student.find({
      group: { $regex: `^\\s*${escapeRegex(group)}\\s*$` },
    })
      .select("fullName category startDate endDate studyType")
      .lean();

    const lessons = await PlannedSchedule.find({
      studentId: { $in: groupStudents.map((s) => s._id) },
    })
      .populate("instructorId", "fullName")
      .populate("vehicleId", "brand plateNumber")
      .populate("trailerId", "brand plateNumber")
      .lean();

    const withLessons = new Set(lessons.map((l) => l.studentId.toString()));
    const students = groupStudents.filter(
      (s) => s.studyType === "Практика" || withLessons.has(s._id.toString())
    );
    if (students.length === 0) {
      throw notFound(`У групі № ${group} немає курсантів практичного навчання`);
    }

    const model = buildGroupSchedule({ group, students, lessons });
    const buffer = await renderGroupScheduleDocx(model);

    const fileName = `Графік_гр_${group}_кат_${model.categories.join("_") || "—"}.docx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="group-${encodeURIComponent(group)}.docx"; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );
    res.send(buffer);
  })
);

module.exports = router;
