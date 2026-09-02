const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/authMiddleware");

const Student = require("../models/Student");
const ExerciseCategory = require("../models/Exercise");
const PlannedSchedule = require("../models/PlannedSchedule");
const Vehicle = require("../models/Vehicle");

function getStudentStatus(startDateStr, endDateStr, targetDate = new Date()) {
  // Допоміжна функція для конвертації дати у Unix-секунди (з обнуленням годин до початку доби)
  const toUnixDayStart = (dateInput) => {
    if (!dateInput) return 0;
    const d = new Date(dateInput);
    // Встановлюємо годину, хвилину, секунду на 00:00:00 за UTC
    // або просто обнуляємо локальний час:
    d.setHours(0, 0, 0, 0);
    return Math.floor(d.getTime() / 1000); // Повертаємо секунди замість мілісекунд
  };

  const startSec = toUnixDayStart(startDateStr);
  const endSec = toUnixDayStart(endDateStr);
  const targetSec = toUnixDayStart(targetDate);

  // 1. Якщо навчання ще не почалося
  if (targetSec < startSec) {
    return "Очікує";
  }

  // 2. Якщо поточна дата в межах навчання
  if (targetSec >= startSec && targetSec <= endSec) {
    return "Активний";
  }

  // 3. Розраховуємо дату (endDate + 6 місяців) у секундах
  const endDateObj = new Date(endDateStr);
  endDateObj.setMonth(endDateObj.getMonth() + 6);
  const maxInactiveSec = toUnixDayStart(endDateObj);

  // 4. Якщо після endDate, але не пізніше ніж через 6 місяців -> Неактивний
  if (targetSec > endSec && targetSec <= maxInactiveSec) {
    return "Неактивний";
  }

  // 5. Якщо минуло більше ніж 6 місяців -> Архів
  return "Архів";
}

const parseMoney = (value) => {
  const parsed = parseFloat(value);
  if (isNaN(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100) / 100;
};
// ================= КУРСАНТИ =================

// Отримати всіх курсантів
router.get("/students", async (req, res) => {
  try {
    const { includeArchive, search } = req.query;
    const today = new Date();

    let query = {};
    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: "i" } },
        { group: { $regex: search, $options: "i" } },
      ];
    }

    const students = await Student.find(query).sort({ fullName: 1 }).lean();

    // Розраховуємо статус та фільтруємо
    const processedStudents = students
      .map((s) => ({
        ...s,
        status: getStudentStatus(s.startDate, s.endDate, today),
      }))
      .filter((s) => {
        if (includeArchive === "true") return true; // Пошук усіх (включаючи Архів)
        return s.status !== "Архів"; // За замовчуванням тільки Активні та Неактивні
      });

    // Сортування: Активні -> Неактивні -> Архів (всередині за ПІБ)
    const statusPriority = { Активний: 1, Неактивний: 2, Архів: 3 };
    processedStudents.sort((a, b) => {
      if (statusPriority[a.status] !== statusPriority[b.status]) {
        return statusPriority[a.status] - statusPriority[b.status];
      }
      return a.fullName.localeCompare(b.fullName, "uk");
    });

    res.status(200).json({
      success: true,
      students: processedStudents,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Створення курсанта
router.post("/students", authMiddleware, async (req, res) => {
  try {
    const {
      fullName,
      group,
      category,
      startDate,
      endDate,
      isPreparation,
      studyType,
      cost,
      prepayment,
      comment,
    } = req.body;

    // Визначаємо роль із розшифрованого JWT-токена
    const currentUserRole =
      req.user?.role === "accountant" ? "Accountant" : "Admin";

    // 🌟 БЕЗПЕЧНИЙ ПАРСИНГ КОПІЙОК
    const costVal = parseMoney(cost);
    const prepVal = parseMoney(prepayment);

    if (prepVal > costVal) {
      return res.status(400).json({
        success: false,
        message: "Передплата не може бути більшою за загальну вартість!",
      });
    }

    const prepaymentHistory = [];
    if (prepVal > 0) {
      prepaymentHistory.push({
        amount: prepVal,
        delta: prepVal,
        role: currentUserRole,
        createdAt: new Date(),
      });
    }

    const student = new Student({
      fullName,
      group,
      category,
      startDate,
      endDate,
      isPreparation: Boolean(isPreparation),
      studyType,
      cost: costVal,
      prepayment: prepVal,
      prepaymentHistory,
      comment: comment || "",
    });

    await student.save();
    res.status(201).json({ success: true, student });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Редагування курсанта
router.put("/students/:id", authMiddleware, async (req, res) => {
  try {
    const {
      fullName,
      group,
      category,
      startDate,
      endDate,
      isPreparation,
      studyType,
      cost,
      prepayment,
      comment,
    } = req.body;

    // 1. Отримуємо роль з авторизованого користувача (з токена)
    const currentUserRole =
      req.user?.role === "accountant" ? "Accountant" : "Admin";

    const existingStudent = await Student.findById(req.params.id);
    if (!existingStudent) {
      return res
        .status(404)
        .json({ success: false, message: "Студента не знайдено" });
    }

    // 🌟 БЕЗПЕЧНИЙ ПАРСИНГ КОПІЙОК
    const newCost = parseMoney(cost);
    const newPrep = parseMoney(prepayment);

    if (newPrep > newCost) {
      return res.status(400).json({
        success: false,
        message: "Передплата не може бути більшою за загальну вартість!",
      });
    }

    const history = existingStudent.prepaymentHistory || [];
    const oldPrep = parseMoney(existingStudent.prepayment || 0);

    // 🌟 ТОЧНИЙ РОЗРАХУНОК РІЗНИЦІ (без багів IEEE 754)
    const delta = Math.round((newPrep - oldPrep) * 100) / 100;

    // 2. Записуємо історію з ПРАВИЛЬНОЮ роллю
    if (delta !== 0) {
      history.push({
        amount: newPrep,
        delta: delta,
        role: currentUserRole,
        createdAt: new Date(),
      });
    }

    // 3. Якщо це Бухгалтер — оновлюємо ТІЛЬКИ фінансові поля та коментар
    if (req.user?.role === "accountant") {
      existingStudent.cost = newCost;
      existingStudent.prepayment = newPrep;
      existingStudent.prepaymentHistory = history;
      if (comment !== undefined) existingStudent.comment = comment;
    } else {
      // Якщо це Головний Адмін — оновлюємо всі поля
      existingStudent.fullName = fullName;
      existingStudent.group = group;
      existingStudent.category = category;
      existingStudent.startDate = startDate;
      existingStudent.endDate = endDate;
      existingStudent.isPreparation = Boolean(isPreparation);
      existingStudent.studyType = studyType;
      existingStudent.cost = newCost;
      existingStudent.prepayment = newPrep;
      existingStudent.prepaymentHistory = history;
      existingStudent.comment = comment || "";
    }

    await existingStudent.save();
    res.status(200).json({ success: true, student: existingStudent });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.delete("/students/:id", authMiddleware, async (req, res) => {
  try {
    // Додаткова перевірка: Бухгалтер не має права видаляти
    if (req.user?.role === "accountant") {
      return res.status(403).json({
        success: false,
        message: "Бухгалтер не має прав для видалення курсантів",
      });
    }

    const deletedStudent = await Student.findByIdAndDelete(req.params.id);
    if (!deletedStudent) {
      return res
        .status(404)
        .json({ success: false, message: "Студента не знайдено" });
    }

    // Також видаляємо всі заплановані заняття даного студента
    await PlannedSchedule.deleteMany({ studentId: req.params.id });

    res
      .status(200)
      .json({ success: true, message: "Студента успішно видалено" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ================= ВПРАВИ =================

// Отримати всі вправи по категоріях
router.get("/exercises", async (req, res) => {
  try {
    const exercises = await ExerciseCategory.find({});
    res.status(200).json({ success: true, exercises });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ================= ПЛАНОВИЙ ГРАФІК =================

// Отримати всі вже призначені вправи курсанта (по всьому графіку)
router.get("/student-schedules/:studentId", async (req, res) => {
  try {
    const { studentId } = req.params;
    const studentSchedules = await PlannedSchedule.find({ studentId });
    const exerciseCodes = studentSchedules.map((s) => s.exerciseCode);

    res.status(200).json({ success: true, exerciseCodes });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Отримати плановий графік
router.get("/planned-schedule", async (req, res) => {
  try {
    const { instructorId, startDate, endDate } = req.query;
    const filter = {};

    if (instructorId) filter.instructorId = instructorId;
    if (startDate && endDate) {
      filter.date = { $gte: startDate, $lte: endDate };
    }

    const schedules = await PlannedSchedule.find(filter)
      .populate("studentId")
      .populate("vehicleId")
      .populate("trailerId");

    res.status(200).json({ success: true, schedules });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Додати новий слот у плановий графік (із перевірками)
router.post("/planned-schedule", async (req, res) => {
  try {
    const {
      instructorId,
      studentId,
      category,
      exerciseCode,
      vehicleId,
      trailerId,
      date,
      timeSlot,
      startTime,
      endTime,
      hours,
      isAutodrome,
      isExam,
    } = req.body;

    // Допоміжна функція перевірки перетину часу [startA, endA) та [startB, endB)
    const isOverlapping = (startA, endA, startB, endB) =>
      startA < endB && startB < endA;

    // 1. УНІКАЛЬНІСТЬ ВПРАВИ: Перевірка чи не складав/планував курсант цю вправу раніше
    const existingExercise = await PlannedSchedule.findOne({
      studentId,
      exerciseCode,
    });
    if (existingExercise) {
      return res.status(400).json({
        success: false,
        message: `Курсант вже має вправу "${exerciseCode}" у плановому графіку!`,
      });
    }

    // 2. ПЕРЕВІРКА ПЕРЕТИНУ ЗА ЧАСОМ (ТЗ, Курсант, Інструктор) по всій БД
    const sameDateSlots = await PlannedSchedule.find({ date })
      .populate("instructorId")
      .populate("studentId")
      .populate("vehicleId");

    for (const slot of sameDateSlots) {
      if (isOverlapping(startTime, endTime, slot.startTime, slot.endTime)) {
        // Перевірка ТЗ у будь-якого інструктора
        if (slot.vehicleId && slot.vehicleId._id.toString() === vehicleId) {
          return res.status(400).json({
            success: false,
            message: `Транспортний засіб (${slot.vehicleId.brand}) вже зайнятий у цей час (${slot.startTime}-${slot.endTime}) у інструктора ${slot.instructorId?.fullName}!`,
          });
        }

        // Перевірка Курсанта у будь-якого інструктора
        if (slot.studentId && slot.studentId._id.toString() === studentId) {
          return res.status(400).json({
            success: false,
            message: `Курсант (${slot.studentId.fullName}) вже має заняття у цей час (${slot.startTime}-${slot.endTime}) у інструктора ${slot.instructorId?.fullName}!`,
          });
        }

        // Перевірка самого Інструктора (щоб не було накладання його власного часу)
        if (
          slot.instructorId &&
          slot.instructorId._id.toString() === instructorId
        ) {
          return res.status(400).json({
            success: false,
            message: `Інструктор ${slot.instructorId.fullName} вже має інше заняття у цей час (${slot.startTime}-${slot.endTime})!`,
          });
        }
      }
    }

    // 3. Збереження
    const newSlot = new PlannedSchedule({
      instructorId,
      studentId,
      category,
      exerciseCode,
      vehicleId,
      trailerId: trailerId || null,
      date,
      timeSlot,
      startTime,
      endTime,
      hours: Number(hours),
      isAutodrome: Boolean(isAutodrome),
      isExam: Boolean(isExam),
    });

    await newSlot.save();
    res.status(201).json({ success: true, slot: newSlot });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Редагувати існуюче заняття в графіку
router.put("/planned-schedule/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const updatedSchedule = await PlannedSchedule.findByIdAndUpdate(
      id,
      req.body,
      { new: true }
    );

    if (!updatedSchedule) {
      return res
        .status(404)
        .json({ success: false, message: "Запис не знайдено" });
    }

    return res.json({ success: true, slot: updatedSchedule });
  } catch (error) {
    console.error("Update schedule error:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
});

// Видалити заняття з графіка
router.delete("/planned-schedule/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deletedSchedule = await PlannedSchedule.findByIdAndDelete(id);

    if (!deletedSchedule) {
      return res
        .status(404)
        .json({ success: false, message: "Запис не знайдено" });
    }

    return res.json({ success: true, message: "Заняття успішно видалено" });
  } catch (error) {
    console.error("Delete schedule error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Помилка сервера при видаленні" });
  }
});

// GET: Доступні ресурси для графіка
router.get("/planned-schedule/available-resources", async (req, res) => {
  try {
    const {
      date,
      startTime,
      endTime,
      category,
      currentScheduleId,
      includeArchive,
    } = req.query;

    if (!date || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: "Обов'язкові параметри: date, startTime, endTime",
      });
    }

    // 1. Отримуємо зайняті слоти
    const daySchedules = await PlannedSchedule.find({ date });
    const occupiedStudentIds = new Set();
    const occupiedVehicleIds = new Set();

    const cleanCurrentId = currentScheduleId ? currentScheduleId.trim() : null;

    daySchedules.forEach((slot) => {
      if (cleanCurrentId && slot._id.toString() === cleanCurrentId) return;

      const isOverlapping =
        startTime < slot.endTime && slot.startTime < endTime;
      if (isOverlapping) {
        if (slot.studentId) occupiedStudentIds.add(slot.studentId.toString());
        if (slot.vehicleId) occupiedVehicleIds.add(slot.vehicleId.toString());
        if (slot.trailerId) occupiedVehicleIds.add(slot.trailerId.toString());
      }
    });

    // 2. Фільтр студентів: Включаємо ТІЛЬКИ напрямок "Практика"
    const studentFilter = {
      _id: { $nin: Array.from(occupiedStudentIds) },
      studyType: "Практика",
    };
    if (category) studentFilter.category = category;

    const candidateStudents = await Student.find(studentFilter).lean();

    // 3. Розрахунок статусу та сортування
    const availableStudents = candidateStudents
      .map((student) => ({
        ...student,
        status: getStudentStatus(student.startDate, student.endDate, date),
      }))
      .filter((student) => {
        if (includeArchive === "true") return true;
        return student.status !== "Архів";
      });

    const statusPriority = { Активний: 1, Неактивний: 2, Архів: 3 };
    availableStudents.sort((a, b) => {
      if (statusPriority[a.status] !== statusPriority[b.status]) {
        return statusPriority[a.status] - statusPriority[b.status];
      }
      return a.fullName.localeCompare(b.fullName, "uk");
    });

    // 4. Вільні авто
    const vehicleFilter = { _id: { $nin: Array.from(occupiedVehicleIds) } };
    if (category) vehicleFilter.category = { $in: [category] };

    const availableVehicles = await Vehicle.find(vehicleFilter);

    res.status(200).json({
      success: true,
      students: availableStudents,
      vehicles: availableVehicles,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET: Детальна статистика занять конкретного студента за вправами
router.get("/students/:id/details", async (req, res) => {
  try {
    const studentId = req.params.id;

    // 1. Знаходимо студента
    const student = await Student.findById(studentId);
    if (!student) {
      return res
        .status(404)
        .json({ success: false, message: "Курсанта не знайдено" });
    }

    // 2. Отримуємо категорію вправ за категорією студента
    const exerciseCategory = await ExerciseCategory.findOne({
      category: student.category,
      isPreparation: Boolean(student.isPreparation),
    });

    const exerciseList =
      exerciseCategory && Array.isArray(exerciseCategory.exercises)
        ? exerciseCategory.exercises
        : [];

    // 3. Отримуємо всі планові заняття цього студента
    const studentSchedules = await PlannedSchedule.find({ studentId })
      .populate("instructorId", "fullName")
      .populate("vehicleId", "brand plateNumber")
      .sort({ date: 1, startTime: 1 });

    // 4. Групуємо заняття за кодом вправи
    const exerciseDetails = exerciseList.map((ex) => {
      const records = studentSchedules.filter(
        (sch) => sch.exerciseCode === ex.code
      );

      const completedHours = records.reduce(
        (sum, item) => sum + (item.hours || 0),
        0
      );

      return {
        code: ex.code,
        requiredHours: ex.hours,
        isAutodrome: ex.isAutodrome,
        completedHours,
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

    res.status(200).json({
      success: true,
      student,
      exercises: exerciseDetails,
    });
  } catch (error) {
    console.error("Error fetching student details:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
