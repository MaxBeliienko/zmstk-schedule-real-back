const mongoose = require("mongoose");

const vehicleSchema = new mongoose.Schema({
  brand: { type: String, required: true },
  plateNumber: { type: String, required: true },
  category: [{ type: String, required: true }],
  isTowbar: { type: Boolean, default: false },
  isTrailer: { type: Boolean, default: false },

  responsibleInstructorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Instructor",
    default: null,
  },

  responsibleAssignedAt: { type: Date, default: null },
  insuranceUntil: { type: String, default: "" },
  inspectionUntil: { type: String, default: "" },
});

module.exports = mongoose.model("Vehicle", vehicleSchema);
