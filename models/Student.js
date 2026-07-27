const mongoose = require("mongoose");

const prepaymentHistorySchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  delta: { type: Number, required: true },
  role: { type: String, enum: ["Admin", "Accountant"], default: "Admin" },
  createdAt: { type: Date, default: Date.now },
});

const studentSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
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
});

module.exports = mongoose.model("Student", studentSchema);
