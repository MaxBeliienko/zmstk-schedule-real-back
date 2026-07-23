const mongoose = require("mongoose");

const vehicleSchema = new mongoose.Schema({
  brand: { type: String, required: true },
  plateNumber: { type: String, required: true },
  category: [{ type: String, required: true }],
  isTowbar: { type: Boolean, default: false },
  isTrailer: { type: Boolean, default: false },
});

module.exports = mongoose.model("Vehicle", vehicleSchema);
