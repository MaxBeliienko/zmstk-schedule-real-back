const mongoose = require("mongoose");

const instructorSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  pinCode: { type: String, required: true },
  certificate: [{ type: String }],
});

module.exports = mongoose.model("Instructor", instructorSchema);
