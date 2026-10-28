// Курсант: дані навчання, оплата та історія змін передплати.
// optimisticConcurrency: якщо двоє одночасно редагують курсанта, друге
// збереження отримає 409 замість тихого перезапису (middlewares/errorHandler.js).

const mongoose = require("mongoose");

// Запис історії передплати: нова сума, зміна і хто її вніс
const prepaymentHistorySchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  delta: { type: Number, required: true },
  role: { type: String, enum: ["Admin", "Accountant"], default: "Admin" },
  accountId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", default: null },
  byName: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
});

const studentSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  phone: { type: String, default: "" },
  // Закріплені інструктори; перший у списку вважається основним
  instructorIds: [
    { type: mongoose.Schema.Types.ObjectId, ref: "Instructor" },
  ],
  group: { type: String, required: true },
  category: { type: String, required: true },
  startDate: { type: String, required: true },
  endDate: { type: String, required: true },
  isPreparation: { type: Boolean, default: false },
  // Напрямок навчання: у плановий графік потрапляють лише курсанти "Практика"
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
{ optimisticConcurrency: true });

studentSchema.index({ instructorIds: 1 });
studentSchema.index({ startDate: 1, endDate: 1 });

module.exports = mongoose.model("Student", studentSchema);
