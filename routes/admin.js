const express = require("express");
const router = express.Router();

const Student = require("../models/Student");
const ExerciseCategory = require("../models/Exercise");
const PlannedSchedule = require("../models/PlannedSchedule");
const Vehicle = require("../models/Vehicle");

// ================= КУРСАНТИ =================

// Отримати всіх курсантів
router.get("/students", async (req, res) => {
  try {
    const students = await Student.find({}).sort({ group: 1, fullName: 1 });
    res.status(200).json({ success: true, students });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Додати нового курсанта
router.post("/students", async (req, res) => {
  try {
    const { fullName, group, category, startDate, endDate } = req.body;
    const student = new Student({
      fullName,
      group,
      category,
      startDate,
      endDate,
    });
    await student.save();
    res.status(201).json({ success: true, student });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.delete("/students/:id", async (req, res) => {
  try {
    const deletedStudent = await Student.findByIdAndDelete(req.params.id);
    if (!deletedStudent) {
      return res
        .status(404)
        .json({ success: false, message: "Студента не знайдено" });
    }

    // За бажанням: також можна видалити всі заплановані заняття даного студента
    await PlannedSchedule.deleteMany({ studentId: req.params.id });

    res
      .status(200)
      .json({ success: true, message: "Студента успішно видалено" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Редагувати курсанта
router.put("/students/:id", async (req, res) => {
  try {
    const { fullName, group, category, startDate, endDate } = req.body;

    // 1. Отримуємо поточний стан курсанта
    const existingStudent = await Student.findById(req.params.id);
    if (!existingStudent) {
      return res
        .status(404)
        .json({ success: false, message: "Студента не знайдено" });
    }

    // 2. Якщо категорія змінюється, перевіряємо наявність занять у графіку
    if (existingStudent.category !== category) {
      const activeSchedulesCount = await PlannedSchedule.countDocuments({
        studentId: req.params.id,
      });

      if (activeSchedulesCount > 0) {
        return res.status(400).json({
          success: false,
          message: `Неможливо змінити категорію з ${existingStudent.category} на ${category}! У курсанта вже є ${activeSchedulesCount} занять у графіку. Спочатку видаліть їх.`,
        });
      }
    }

    // 3. Якщо занять немає або категорія не змінювалася — оновлюємо
    const updatedStudent = await Student.findByIdAndUpdate(
      req.params.id,
      { fullName, group, category, startDate, endDate },
      { new: true, runValidators: true }
    );

    res.status(200).json({ success: true, student: updatedStudent });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
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

// GET: Отримати вільних курсантів та транспортні засоби на обрану дату та час
router.get("/planned-schedule/available-resources", async (req, res) => {
  try {
    const { date, startTime, endTime, category, currentScheduleId } = req.query;

    if (!date || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: "Обов'язкові параметри: date, startTime, endTime",
      });
    }

    // 1. Знаходимо ВСІ заняття по всіх інструкторах на цю дату
    const daySchedules = await PlannedSchedule.find({ date });

    // 2. Збираємо ID студентів та ТЗ, які перетинаються за часом
    const occupiedStudentIds = new Set();
    const occupiedVehicleIds = new Set();

    // Очищаємо ID від можливих пробілів
    const cleanCurrentId = currentScheduleId ? currentScheduleId.trim() : null;

    daySchedules.forEach((slot) => {
      // Ігноруємо поточний запис, якщо ми його редагуємо
      if (cleanCurrentId && slot._id.toString() === cleanCurrentId) {
        return;
      }

      // Перевірка перетину інтервалів часу: (StartA < EndB) && (StartB < EndA)
      const isOverlapping =
        startTime < slot.endTime && slot.startTime < endTime;

      if (isOverlapping) {
        if (slot.studentId) occupiedStudentIds.add(slot.studentId.toString());
        if (slot.vehicleId) occupiedVehicleIds.add(slot.vehicleId.toString());
        if (slot.trailerId) occupiedVehicleIds.add(slot.trailerId.toString());
      }
    });

    // 3. Шукаємо СТУДЕНТІВ необхідної категорії, які НЕ в переходять у список зайнятих
    const studentFilter = {
      _id: { $nin: Array.from(occupiedStudentIds) },
    };
    if (category) {
      studentFilter.category = category;
    }

    const availableStudents = await Student.find(studentFilter).sort({
      fullName: 1,
    });

    // 4. Шукаємо ТЗ необхідної категорії, які НЕ в переходять у список зайнятих
    const vehicleFilter = {
      _id: { $nin: Array.from(occupiedVehicleIds) },
    };
    if (category) {
      vehicleFilter.category = { $in: [category] };
    }

    const availableVehicles = await Vehicle.find(vehicleFilter);

    res.status(200).json({
      success: true,
      students: availableStudents,
      vehicles: availableVehicles,
    });
  } catch (error) {
    console.error("Error fetching available resources:", error);
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

    // 2. Отримуємо категорію вправ за категорією студента (наприклад, "B")
    const exerciseCategory = await ExerciseCategory.findOne({
      category: student.category,
    });

    // 🔑 Використовуємо поле `exercises` з вашої схеми
    const exerciseList =
      exerciseCategory && Array.isArray(exerciseCategory.exercises)
        ? exerciseCategory.exercises
        : [];

    // 3. Отримуємо всі планові заняття цього студента
    const studentSchedules = await PlannedSchedule.find({ studentId })
      .populate("instructorId", "fullName")
      .populate("vehicleId", "brand plateNumber")
      .sort({ date: 1, startTime: 1 });

    // 4. Групуємо заняття за кодом вправи (exerciseCode)
    const exerciseDetails = exerciseList.map((ex) => {
      // Знаходимо всі записи за цим кодом вправи (наприклад, "1.1", "6.4")
      const records = studentSchedules.filter(
        (sch) => sch.exerciseCode === ex.code
      );

      // Рахуємо сумарно пройдені години
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
