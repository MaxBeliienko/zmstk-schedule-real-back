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
  { date: 1, instructorId: 1, timeSlot: 1 },
  { unique: true }
);

// Одне авто — лише в одного інструктора на слот (гарантія на рівні БД,
// навіть якщо два збереження прийшли одночасно на різні інстанси)
ScheduleSchema.index(
  { date: 1, timeSlot: 1, vehicleId: 1 },
  { unique: true, partialFilterExpression: { vehicleId: { $type: "objectId" } } }
);
ScheduleSchema.index({ instructorId: 1, date: 1 });

module.exports = mongoose.model("Schedule", ScheduleSchema);
