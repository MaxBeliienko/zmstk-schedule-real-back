// Довідник вправ водіння: для кожної категорії (і окремо для перепідготовки)
// список вправ з тривалістю. З нього плановий графік бере тривалість заняття
// та ознаку автодрому (routes/admin/plannedSchedule.js).

const mongoose = require("mongoose");

// Одна вправа: код (напр. "1.1" чи "Іспит"), години, чи на автодромі
const exerciseItemSchema = new mongoose.Schema({
  code: { type: String, required: true },
  hours: { type: Number, required: true },
  isAutodrome: { type: Boolean, default: false },
});

// Програма категорії: усі вправи та загальна кількість годин
const exerciseCategorySchema = new mongoose.Schema({
  category: { type: String, required: true },
  isPreparation: { type: Boolean, default: false, required: true },
  exercises: [exerciseItemSchema],
  totalHours: { type: Number, required: true },
});

exerciseCategorySchema.index(
  { category: 1, isPreparation: 1 },
  { unique: true }
);

module.exports = mongoose.model("ExerciseCategory", exerciseCategorySchema);
