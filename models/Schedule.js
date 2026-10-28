// Реальний графік: що інструктор фактично робив у кожну годину дня (ТЗ,
// місце, курсант або "у гаражі"). Заповнює сам інструктор у кабінеті
// (routes/schedule.js).

const mongoose = require("mongoose");

const ScheduleSchema = new mongoose.Schema({
  date: { type: String, required: true },
  timeSlot: { type: String, required: true },
  instructorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Instructor",
    required: true,
  },
  vehicleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Vehicle",
    default: null,
  },
  location: { type: String, default: "" },
  studentName: { type: String, default: "" },
  isGarage: { type: Boolean, default: false },
});

ScheduleSchema.index({ date: 1, timeSlot: 1 });

ScheduleSchema.index(
  // Один запис на інструктора на годину
  { date: 1, instructorId: 1, timeSlot: 1 },
  { unique: true }
);

ScheduleSchema.index(
  // Одне авто в одну годину — лише в одного інструктора (гарантія на рівні БД)
  { date: 1, timeSlot: 1, vehicleId: 1 },
  { unique: true, partialFilterExpression: { vehicleId: { $type: "objectId" } } }
);
ScheduleSchema.index({ instructorId: 1, date: 1 });

module.exports = mongoose.model("Schedule", ScheduleSchema);
