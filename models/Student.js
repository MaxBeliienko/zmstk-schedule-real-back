const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  group: { type: String, required: true },
  category: { type: String, required: true },
  startDate: { type: String, required: true },
  endDate: { type: String, required: true },
});

module.exports = mongoose.model("Student", studentSchema);
