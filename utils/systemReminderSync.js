// Системні нагадування про закінчення строків: страхування й техогляду ТЗ,
// медогляду й санітарної книжки інструкторів. Створюються й оновлюються
// автоматично після кожної зміни ТЗ (routes/vehicles.js) чи інструктора
// (routes/instructors.js). Бачать їх адмін, бухгалтер і причетний інструктор.

const Reminder = require("../models/Reminder");
const Vehicle = require("../models/Vehicle");
const Instructor = require("../models/Instructor");

// Сповіщення за місяць, два тижні, тиждень і день
const ALL_OFFSETS = ["1_day", "1_week", "2_weeks", "1_month"];
const SYSTEM_IDENTITY = "system";
const SYSTEM_NAME = "Система";

const STAFF_ASSIGNEES = ["role:admin", "role:accountant"];

// Створює або оновлює одну системну картку (filter — тип і джерело).
// Без дати картка видаляється. Якщо дата змінилась, попередні "переглянуто /
// відкладено" скидаються. Upsert разом з унікальним індексом не створює
// дублів навіть при одночасних збереженнях
async function upsertSystemReminder(filter, { date, title, extraAssignees = [] }) {
  if (!date) {
    await Reminder.deleteOne(filter);
    return;
  }

  const assignees = [...STAFF_ASSIGNEES, ...extraAssignees];

  await Reminder.updateOne({ ...filter, date: { $ne: date } }, { $set: { viewerStates: [] } });

  const fields = { title, date, assignees, remindBefore: ALL_OFFSETS, repeat: "none" };

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
    if (err?.code !== 11000) throw err;
    return Reminder.updateOne(filter, { $set: fields });
  });
}

// Картки страхування й техогляду для одного ТЗ
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

// Перерахунок для всіх ТЗ (використовується в міграціях)
async function syncAllVehicleReminders() {
  const vehicles = await Vehicle.find({});
  for (const vehicle of vehicles) {
    await syncVehicleReminders(vehicle);
  }
}

// Картки медогляду й санітарної книжки для одного інструктора
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

// Перерахунок для всіх інструкторів
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
