const mongoose = require("mongoose");

const InstructorSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  pinCode: { type: String, required: true },
});

module.exports = mongoose.model("Instructor", InstructorSchema);
