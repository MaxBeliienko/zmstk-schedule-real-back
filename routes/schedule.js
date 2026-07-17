const express = require("express");
const router = express.Router();
const Schedule = require("../models/Schedule");

router.get("/instructor-day", async (req, res) => {
  const { date, instructorId } = req.query;
  if (!date || !instructorId) {
    return res
      .status(400)
      .json({ success: false, message: "Не вказано дату або ID інструктора" });
  }

  const timeSlots = [
    "07:00-08:00",
    "08:00-09:00",
    "09:00-10:00",
    "10:00-11:00",
    "11:00-12:00",
    "12:00-13:00",
    "13:00-14:00",
    "14:00-15:00",
    "15:00-16:00",
    "16:00-17:00",
    "17:00-18:00",
    "18:00-19:00",
    "19:00-20:00",
    "20:00-21:00",
  ];

  try {
    const records = await Schedule.find({ date, instructorId });
    const fullGrid = timeSlots.map((slot) => {
      const match = records.find((r) => r.timeSlot === slot);
      return {
        timeSlot: slot,
        vehicleId: match ? match.vehicleId : null,
        location: match ? match.location : "",
        studentName: match ? match.studentName : "",
      };
    });
    res.status(200).json({ success: true, slots: fullGrid });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/admin-day", async (req, res) => {
  const { date } = req.query;
  if (!date)
    return res.status(400).json({ success: false, message: "Вкажіть дату" });
  try {
    const schedules = await Schedule.find({ date })
      .populate("instructorId", "fullName")
      .populate("vehicleId");
    res.status(200).json({ success: true, schedules });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/save", async (req, res) => {
  const { date, instructorId, slots } = req.body;
  try {
    const errors = [];
    for (const slot of slots) {
      const hasVehicle = slot.vehicleId && slot.vehicleId.trim() !== "";
      const hasStudent = slot.studentName && slot.studentName.trim() !== "";

      if (!hasVehicle && !hasStudent) continue;

      const query = {
        date,
        timeSlot: slot.timeSlot,
        instructorId: { $ne: instructorId },
      };
      const orConditions = [];
      if (hasVehicle) orConditions.push({ vehicleId: slot.vehicleId });
      if (hasStudent)
        orConditions.push({
          studentName: {
            $regex: new RegExp(`^${slot.studentName.trim()}$`, "i"),
          },
        });
      query.$or = orConditions;

      const conflict = await Schedule.findOne(query)
        .populate("instructorId", "fullName")
        .populate("vehicleId");

      if (conflict) {
        let message = "";
        if (
          hasVehicle &&
          conflict.vehicleId &&
          conflict.vehicleId._id.toString() === slot.vehicleId
        ) {
          message = `Автомобіль ${conflict.vehicleId.brand} (${conflict.vehicleId.plateNumber}) вже використовується інструктором ${conflict.instructorId.fullName}`;
        } else if (
          hasStudent &&
          conflict.studentName.toLowerCase() ===
            slot.studentName.trim().toLowerCase()
        ) {
          message = `Курсант "${slot.studentName}" у цей час вже записаний до інструктора ${conflict.instructorId.fullName}`;
        }
        errors.push({ timeSlot: slot.timeSlot, message });
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Виявлено конфлікти бронювання!",
        errors,
      });
    }

    for (const slot of slots) {
      if (
        (!slot.vehicleId || slot.vehicleId.trim() === "") &&
        (!slot.studentName || slot.studentName.trim() === "")
      ) {
        await Schedule.findOneAndDelete({
          date,
          timeSlot: slot.timeSlot,
          instructorId,
        });
      } else {
        await Schedule.findOneAndUpdate(
          { date, timeSlot: slot.timeSlot, instructorId },
          {
            vehicleId: slot.vehicleId || null,
            location: slot.location || "",
            studentName: slot.studentName.trim(),
          },
          { upsert: true }
        );
      }
    }
    res
      .status(200)
      .json({ success: true, message: "Графік успішно збережено!" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Отримати графік ОДНОГО інструктора за ПЕРІОД дат
router.get("/admin-instructor-period", async (req, res) => {
  const { instructorId, startDate, endDate } = req.query;

  if (!instructorId || !startDate || !endDate) {
    return res.status(400).json({
      success: false,
      message: "Необхідно вказати ID інструктора, початкову та кінцеву дати.",
    });
  }

  try {
    const schedules = await Schedule.find({
      instructorId,
      date: { $gte: startDate, $lte: endDate }, // Пошук у діапазоні дат
    }).populate("vehicleId");

    res.status(200).json({ success: true, schedules });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
