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
});

ScheduleSchema.index({ date: 1, timeSlot: 1 });

module.exports = mongoose.model("Schedule", ScheduleSchema);
