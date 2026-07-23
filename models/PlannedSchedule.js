const mongoose = require("mongoose");

const plannedScheduleSchema = new mongoose.Schema(
  {
    instructorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Instructor",
      required: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    category: { type: String, required: true },
    exerciseCode: { type: String, required: true },
    vehicleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vehicle",
      required: true,
    },
    trailerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vehicle",
      default: null,
    },
    date: { type: String, required: true },
    timeSlot: { type: String, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    hours: { type: Number, required: true },
    isAutodrome: { type: Boolean, default: false },
    isExam: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PlannedSchedule", plannedScheduleSchema);
