const mongoose = require("mongoose");

const exerciseItemSchema = new mongoose.Schema({
  code: { type: String, required: true },
  hours: { type: Number, required: true },
  isAutodrome: { type: Boolean, default: false },
});

const exerciseCategorySchema = new mongoose.Schema({
  category: { type: String, required: true, unique: true },
  exercises: [exerciseItemSchema],
  totalHours: { type: Number, required: true },
});

module.exports = mongoose.model("ExerciseCategory", exerciseCategorySchema);
