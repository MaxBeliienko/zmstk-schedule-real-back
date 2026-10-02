const Reminder = require("../models/Reminder");
const Vehicle = require("../models/Vehicle");
const Instructor = require("../models/Instructor");

// Системні нагадування про закінчення строків: страхування й техогляду ТЗ
// (МТБ), медогляду й санітарної книжки інструкторів. Графік сповіщень той
// самий, що й у звичайних карток: за місяць, за два тижні, за тиждень, за день.
const ALL_OFFSETS = ["1_day", "1_week", "2_weeks", "1_month"];
const SYSTEM_IDENTITY = "system";
const SYSTEM_NAME = "Система";

// Адмін і бухгалтер отримують усі системні нагадування
const STAFF_ASSIGNEES = ["role:admin", "role:accountant"];

// filter — однозначно визначає картку (тип + джерело). Без дати картку
// прибираємо, інакше — створюємо або оновлюємо.
async function upsertSystemReminder(filter, { date, title, extraAssignees = [] }) {
  if (!date) {
    await Reminder.deleteOne(filter);
    return;
  }

  const assignees = [...STAFF_ASSIGNEES, ...extraAssignees];

  // Дату змінили — попередні "переглянуто / відкладено" вже не актуальні
  await Reminder.updateOne({ ...filter, date: { $ne: date } }, { $set: { viewerStates: [] } });

  const fields = { title, date, assignees, remindBefore: ALL_OFFSETS, repeat: "none" };

  // Атомарний upsert: разом з унікальним індексом не створює дублікатів
  // навіть при одночасних збереженнях
  await Reminder.findOneAndUpdate(
    filter,
    {
      $set: fields,
      $setOnInsert: {
        description: "",
        createdByIdentity: SYSTEM_IDENTITY,
        createdByName: SYSTEM_NAME,
      },
    },
    { upsert: true, runValidators: true }
  ).catch((err) => {
    // Паралельний upsert встиг першим — запис уже є, повторюємо як оновлення
    if (err?.code !== 11000) throw err;
    return Reminder.updateOne(filter, { $set: fields });
  });
}

// ================= ТЗ (МТБ) =================

// Викликати після кожного створення/редагування ТЗ
async function syncVehicleReminders(vehicle) {
  const label = `${vehicle.brand} (${vehicle.plateNumber})`;
  const extraAssignees = vehicle.responsibleInstructorId
    ? [`instructor:${vehicle.responsibleInstructorId}`]
    : [];
  const source = { sourceVehicleId: vehicle._id, sourceInstructorId: null };

  await upsertSystemReminder(
    { sourceType: "vehicle-insurance", ...source },
    { date: vehicle.insuranceUntil, title: `Закінчення страхування: ${label}`, extraAssignees }
  );
  await upsertSystemReminder(
    { sourceType: "vehicle-inspection", ...source },
    { date: vehicle.inspectionUntil, title: `Закінчення техогляду: ${label}`, extraAssignees }
  );
}

async function syncAllVehicleReminders() {
  const vehicles = await Vehicle.find({});
  for (const vehicle of vehicles) {
    await syncVehicleReminders(vehicle);
  }
}

// ================= ІНСТРУКТОРИ =================

// Викликати після зміни дат документів інструктора. Нагадування бачать
// адмін, бухгалтер і сам інструктор.
async function syncInstructorReminders(instructor) {
  const source = { sourceInstructorId: instructor._id, sourceVehicleId: null };
  const extraAssignees = [`instructor:${instructor._id}`];

  await upsertSystemReminder(
    { sourceType: "instructor-medical", ...source },
    {
      date: instructor.medicalExamUntil,
      title: `Закінчення медогляду: ${instructor.fullName}`,
      extraAssignees,
    }
  );
  await upsertSystemReminder(
    { sourceType: "instructor-sanitary", ...source },
    {
      date: instructor.sanitaryBookUntil,
      title: `Закінчення санітарної книжки: ${instructor.fullName}`,
      extraAssignees,
    }
  );
}

async function syncAllInstructorReminders() {
  const instructors = await Instructor.find({}).select(
    "fullName medicalExamUntil sanitaryBookUntil"
  );
  for (const instructor of instructors) {
    await syncInstructorReminders(instructor);
  }
}

module.exports = {
  syncVehicleReminders,
  syncAllVehicleReminders,
  syncInstructorReminders,
  syncAllInstructorReminders,
  SYSTEM_IDENTITY,
};
