const Reminder = require("../models/Reminder");
const Vehicle = require("../models/Vehicle");

// Синхронізуємо системні нагадування про закінчення страхування/техогляду
// з тим самим графіком сповіщень, що й у звичайних карток: за місяць,
// за два тижні, за тиждень, за день.
const ALL_OFFSETS = ["1_day", "1_week", "2_weeks", "1_month"];
const SYSTEM_IDENTITY = "system";
const SYSTEM_NAME = "Система (МТБ)";

// Адмін і бухгалтер керують МТБ, тож обидва отримують ці нагадування
const STAFF_ASSIGNEES = ["role:admin", "role:accountant"];

async function syncOneReminder(vehicle, sourceType, dateValue) {
  const filter = { sourceType, sourceVehicleId: vehicle._id };

  if (!dateValue) {
    await Reminder.deleteOne(filter);
    return;
  }

  const assignees = [...STAFF_ASSIGNEES];
  if (vehicle.responsibleInstructorId) {
    assignees.push(`instructor:${vehicle.responsibleInstructorId}`);
  }

  const title =
    sourceType === "vehicle-insurance"
      ? `Закінчення страхування: ${vehicle.brand} (${vehicle.plateNumber})`
      : `Закінчення техогляду: ${vehicle.brand} (${vehicle.plateNumber})`;

  // Дату змінили — попередні "переглянуто / відкладено" вже не актуальні
  await Reminder.updateOne(
    { ...filter, date: { $ne: dateValue } },
    { $set: { viewerStates: [] } }
  );

  // Атомарний upsert: разом з унікальним індексом не створює дублікатів
  // навіть при одночасних збереженнях ТЗ
  await Reminder.findOneAndUpdate(
    filter,
    {
      $set: { title, date: dateValue, assignees, remindBefore: ALL_OFFSETS, repeat: "none" },
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
    return Reminder.updateOne(filter, {
      $set: { title, date: dateValue, assignees, remindBefore: ALL_OFFSETS, repeat: "none" },
    });
  });
}

// Викликати після кожного створення/редагування ТЗ
async function syncVehicleReminders(vehicle) {
  await syncOneReminder(vehicle, "vehicle-insurance", vehicle.insuranceUntil);
  await syncOneReminder(
    vehicle,
    "vehicle-inspection",
    vehicle.inspectionUntil
  );
}

// Перерахунок усіх системних карток (використовується в міграціях)
async function syncAllVehicleReminders() {
  const vehicles = await Vehicle.find({});
  for (const vehicle of vehicles) {
    await syncVehicleReminders(vehicle);
  }
}

module.exports = {
  syncVehicleReminders,
  syncAllVehicleReminders,
  SYSTEM_IDENTITY,
};
