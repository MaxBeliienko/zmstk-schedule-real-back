const mongoose = require("mongoose");

const VehicleSchema = new mongoose.Schema({
  brand: { type: String, required: true },
  plateNumber: { type: String, required: true },
});

VehicleSchema.virtual("displayName").get(function () {
  return `${this.brand} (${this.plateNumber})`;
});

VehicleSchema.set("toJSON", { virtuals: true });
VehicleSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Vehicle", VehicleSchema);
