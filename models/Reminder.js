const mongoose = require("mongoose");

const viewerStateSchema = new mongoose.Schema(
  {
    // "role:admin" | "role:accountant" | "instructor:<id>"
    identity: { type: String, required: true },
    lastAcknowledgedTriggerDate: { type: String, default: "" },
    snoozeUntil: { type: Date, default: null },
  },
  { _id: false }
);

const reminderSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: "" },
    date: { type: String, required: true },
    remindBefore: [
      {
        type: String,
        enum: ["1_day", "1_week", "2_weeks", "1_month"],
      },
    ],

    repeat: {
      type: String,
      enum: ["none", "daily", "weekly", "monthly", "yearly"],
      default: "none",
    },

    assignees: [{ type: String, required: true }],
    createdByIdentity: { type: String, required: true },
    createdByName: { type: String, required: true },
    viewerStates: [viewerStateSchema],

    sourceType: {
      type: String,
      enum: [
        null,
        "vehicle-insurance",
        "vehicle-inspection",
        "instructor-medical",
        "instructor-sanitary",
      ],
      default: null,
    },
    sourceVehicleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vehicle",
      default: null,
    },
    sourceInstructorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Instructor",
      default: null,
    },
  },
  { timestamps: true }
);

reminderSchema.index({ assignees: 1 });
reminderSchema.index({ createdByIdentity: 1 });
// Одна системна картка на тип і джерело (ТЗ або інструктора). Попередній
// індекс system_card_unique (лише ТЗ) прибирає міграція
reminderSchema.index(
  { sourceType: 1, sourceVehicleId: 1, sourceInstructorId: 1 },
  {
    name: "system_card_unique_v2",
    unique: true,
    partialFilterExpression: { sourceType: { $type: "string" } },
  }
);

module.exports = mongoose.model("Reminder", reminderSchema);
