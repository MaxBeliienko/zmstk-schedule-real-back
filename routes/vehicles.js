const express = require("express");
const Vehicle = require("../models/Vehicle");
const Instructor = require("../models/Instructor");
const authMiddleware = require("../middlewares/authMiddleware");
const requireRole = require("../middlewares/requireRole");
const { syncVehicleReminders } = require("../utils/vehicleReminderSync");
const { isValidDateStr } = require("../utils/dates");
const {
  asyncHandler,
  badRequest,
  notFound,
  isObjectId,
  asString,
} = require("../utils/http");

const router = express.Router();

const ALLOWED_CATEGORIES = ["A1", "A", "B", "C", "C1", "CE", "D1", "D"];

router.use(authMiddleware);

// Список ТЗ потрібен усім авторизованим ролям (кабінет інструктора,
// плановий графік, МТБ)
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const vehicles = await Vehicle.find({})
      .sort({ brand: 1 })
      .populate("responsibleInstructorId", "fullName")
      .lean();
    res.status(200).json({ success: true, vehicles });
  })
);

// Перевіряє і нормалізує поля ТЗ з тіла запиту. Повертає лише ті поля,
// що були передані (для часткового оновлення).
async function parseVehicleBody(body, { requireAll }) {
  const data = {};

  if (body.brand !== undefined || requireAll) {
    const brand = asString(body.brand)?.trim();
    if (!brand) throw badRequest("Вкажіть марку ТЗ");
    data.brand = brand.slice(0, 100);
  }

  if (body.plateNumber !== undefined || requireAll) {
    const plate = asString(body.plateNumber)?.trim();
    if (!plate) throw badRequest("Вкажіть державний номер");
    data.plateNumber = plate.slice(0, 20);
  }

  if (body.category !== undefined || requireAll) {
    const list = (Array.isArray(body.category) ? body.category : [body.category])
      .filter((c) => typeof c === "string");
    const categories = [...new Set(list)].filter((c) =>
      ALLOWED_CATEGORIES.includes(c)
    );
    if (categories.length === 0) {
      throw badRequest("Оберіть хоча б одну категорію");
    }
    data.category = categories;
  }

  if (body.isTowbar !== undefined) data.isTowbar = Boolean(body.isTowbar);
  if (body.isTrailer !== undefined) data.isTrailer = Boolean(body.isTrailer);

  if (body.responsibleInstructorId !== undefined) {
    const id = body.responsibleInstructorId || null;
    if (id !== null) {
      if (!isObjectId(id)) throw badRequest("Некоректний відповідальний інструктор");
      const exists = await Instructor.exists({ _id: id });
      if (!exists) throw badRequest("Відповідального інструктора не знайдено");
    }
    data.responsibleInstructorId = id;
  }

  for (const field of ["insuranceUntil", "inspectionUntil"]) {
    if (body[field] === undefined) continue;
    const value = body[field] || "";
    if (value && !isValidDateStr(value)) {
      throw badRequest("Некоректна дата страхування / техогляду");
    }
    data[field] = value;
  }

  return data;
}

// Створення нового ТЗ (адмін або бухгалтер) — картка МТБ
router.post(
  "/",
  requireRole.staff,
  asyncHandler(async (req, res) => {
    const data = await parseVehicleBody(req.body, { requireAll: true });

    const vehicle = new Vehicle({
      ...data,
      responsibleAssignedAt: data.responsibleInstructorId ? new Date() : null,
    });

    await vehicle.save();
    await syncVehicleReminders(vehicle);
    res.status(201).json({ success: true, vehicle });
  })
);

// Редагування ТЗ, зокрема полів МТБ (адмін або бухгалтер)
router.put(
  "/:id",
  requireRole.staff,
  asyncHandler(async (req, res) => {
    if (!isObjectId(req.params.id)) throw badRequest("Некоректний ID ТЗ");

    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) throw notFound("Транспортний засіб не знайдено");

    const data = await parseVehicleBody(req.body, { requireAll: false });

    if (data.responsibleInstructorId !== undefined) {
      const changed =
        String(vehicle.responsibleInstructorId || "") !==
        String(data.responsibleInstructorId || "");
      // Оновлюємо момент призначення лише коли відповідальний ДІЙСНО змінився —
      // це визначає, яке авто "перше" (основне), якщо за інструктором закріплено декілька
      if (changed) {
        vehicle.responsibleAssignedAt = data.responsibleInstructorId
          ? new Date()
          : null;
      }
    }

    vehicle.set(data);
    await vehicle.save();
    await syncVehicleReminders(vehicle);
    res.status(200).json({ success: true, vehicle });
  })
);

module.exports = router;
