// Транспортні засоби (/api/vehicles) — розділ МТБ. Після кожної зміни
// оновлюються автоматичні нагадування про страхування й техогляд.

const express = require("express");
const Vehicle = require("../models/Vehicle");
const Instructor = require("../models/Instructor");
const authMiddleware = require("../middlewares/authMiddleware");
const requireRole = require("../middlewares/requireRole");
const { syncVehicleReminders } = require("../utils/systemReminderSync");
const { withTransaction } = require("../utils/transaction");
const { isValidDateStr } = require("../utils/dates");
const {
  asyncHandler,
  badRequest,
  notFound,
  isObjectId,
  asString,
} = require("../utils/http");

const router = express.Router();

const { DRIVING_CATEGORIES: ALLOWED_CATEGORIES } = require("../config/categories");

router.use(authMiddleware);

// Список ТЗ потрібен усім ролям (кабінет інструктора, плановий графік, МТБ)
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

// Перевіряє поля ТЗ з запиту. requireAll — при створенні; інакше лише передані поля
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

// Новий ТЗ (адмін, бухгалтер)
router.post(
  "/",
  requireRole.staff,
  asyncHandler(async (req, res) => {
    const data = await parseVehicleBody(req.body, { requireAll: true });

    const vehicle = new Vehicle({
      ...data,
      responsibleAssignedAt: data.responsibleInstructorId ? new Date() : null,
    });

    await withTransaction(async () => {
      await vehicle.save();
      await syncVehicleReminders(vehicle);
    });
    res.status(201).json({ success: true, vehicle });
  })
);

// Редагування ТЗ (адмін, бухгалтер)
router.put(
  "/:id",
  requireRole.staff,
  asyncHandler(async (req, res) => {
    if (!isObjectId(req.params.id)) throw badRequest("Некоректний ID ТЗ");

    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) throw notFound("Транспортний засіб не знайдено");

    const data = await parseVehicleBody(req.body, { requireAll: false });

    // Дату призначення оновлюємо лише при зміні відповідального: від неї
    // залежить, яке авто інструктора основне
    if (data.responsibleInstructorId !== undefined) {
      const changed =
        String(vehicle.responsibleInstructorId || "") !==
        String(data.responsibleInstructorId || "");
      if (changed) {
        vehicle.responsibleAssignedAt = data.responsibleInstructorId
          ? new Date()
          : null;
      }
    }

    vehicle.set(data);
    // ТЗ і його нагадування про страхування й техогляд — разом або нічого
    await withTransaction(async () => {
      await vehicle.save();
      await syncVehicleReminders(vehicle);
    });
    res.status(200).json({ success: true, vehicle });
  })
);

module.exports = router;
