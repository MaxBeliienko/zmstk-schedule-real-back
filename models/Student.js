const mongoose = require("mongoose");

const prepaymentHistorySchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  delta: { type: Number, required: true },
  role: { type: String, enum: ["Admin", "Accountant"], default: "Admin" },
  createdAt: { type: Date, default: Date.now },
});

const studentSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  phone: { type: String, default: "" },
  instructorIds: [
    { type: mongoose.Schema.Types.ObjectId, ref: "Instructor" },
  ],
  group: { type: String, required: true },
  category: { type: String, required: true },
  startDate: { type: String, required: true },
  endDate: { type: String, required: true },
  isPreparation: { type: Boolean, default: false },
  studyType: {
    type: String,
    enum: ["Теорія", "Практика"],
    required: true,
    default: "Теорія",
  },
  cost: { type: Number, required: true, default: 0 },
  prepayment: { type: Number, default: 0 },
  prepaymentHistory: [prepaymentHistorySchema],
  comment: { type: String, default: "" },
  examAttempt: { type: String, default: "" },
  details: { type: String, default: "" },
  reviewLeft: { type: Boolean, default: false },
  reviewPlatform: { type: String, default: "" },
},
// Одночасне редагування (напр. адмін і бухгалтер змінюють передплату) —
// друге збереження отримає 409, а не тихо перезапише перше
{ optimisticConcurrency: true });

studentSchema.index({ instructorIds: 1 });
studentSchema.index({ startDate: 1, endDate: 1 });

module.exports = mongoose.model("Student", studentSchema);
