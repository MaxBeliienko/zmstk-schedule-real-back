// Календар і нагадування (/api/reminders): картки на дату з повторенням,
// виконавці, спливаючі сповіщення "за день / тиждень / ..." та їх
// підтвердження. Розрахунок дат — utils/reminderOffsets.js.

const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const Reminder = require("../models/Reminder");
const Instructor = require("../models/Instructor");
const {
  OFFSET_DAYS,
  OFFSET_LABELS,
  REPEAT_LABELS,
  computeTriggerDates,
  occurrencesBetween,
  relevantEventDates,
  relevantWindow,
  isOffsetKey,
  isRepeatKey,
  todayStr,
  getIdentity,
} = require("../utils/reminderOffsets");
const { isValidDateStr, diffDays } = require("../utils/dates");
const {
  asyncHandler,
  badRequest,
  forbidden,
  notFound,
  isObjectId,
  asString,
} = require("../utils/http");

const router = express.Router();

router.use(authMiddleware);

// Ролі, яким можна призначити картку (крім конкретних інструкторів)
const ASSIGNABLE_ROLES = ["admin", "accountant"];
const MAX_RANGE_DAYS = 400;
const REPEATING = ["daily", "weekly", "monthly", "yearly"];

// ПІБ інструкторів-виконавців для всіх карток одним запитом
async function loadInstructorNames(reminders) {
  const ids = new Set();
  for (const r of reminders) {
    for (const a of r.assignees) {
      if (a.startsWith("instructor:")) ids.add(a.slice("instructor:".length));
    }
  }
  const validIds = [...ids].filter(isObjectId);
  if (validIds.length === 0) return {};
  const found = await Instructor.find({ _id: { $in: validIds } })
    .select("fullName")
    .lean();
  return Object.fromEntries(found.map((i) => [i._id.toString(), i.fullName]));
}

// Людська назва виконавця для картки
function assigneeName(identity, instructorsById) {
  if (identity === "role:admin") return "Адміністратор";
  if (identity === "role:accountant") return "Бухгалтер";
  return instructorsById[identity.replace("instructor:", "")] || "Інструктор";
}

// Поля картки з запиту. requireAll — при створенні; інакше лише передані
async function parseReminderBody(body, { requireAll }) {
  const data = {};

  if (body.title !== undefined || requireAll) {
    const title = asString(body.title)?.trim();
    if (!title) throw badRequest("Вкажіть заголовок");
    data.title = title.slice(0, 200);
  }
  if (body.description !== undefined) {
    data.description = (asString(body.description) || "").slice(0, 2000);
  }
  if (body.date !== undefined || requireAll) {
    if (!isValidDateStr(body.date)) throw badRequest("Вкажіть коректну дату");
    data.date = body.date;
  }
  if (body.remindBefore !== undefined) {
    if (!Array.isArray(body.remindBefore)) throw badRequest("Некоректне поле «Нагадати за»");
    data.remindBefore = [...new Set(body.remindBefore)].filter(
      isOffsetKey
    );
  }
  if (body.repeat !== undefined) {
    if (!isRepeatKey(body.repeat)) throw badRequest("Некоректне поле «Повторювати»");
    data.repeat = body.repeat;
  }

  if (
    requireAll ||
    body.assigneeRoles !== undefined ||
    body.assigneeInstructorIds !== undefined
  ) {
    const roles = (Array.isArray(body.assigneeRoles) ? body.assigneeRoles : []).filter(
      (r) => ASSIGNABLE_ROLES.includes(r)
    );
    const instructorIds = (
      Array.isArray(body.assigneeInstructorIds) ? body.assigneeInstructorIds : []
    ).filter(isObjectId);

    let existingIds = [];
    if (instructorIds.length > 0) {
      const found = await Instructor.find({ _id: { $in: instructorIds } })
        .select("_id")
        .lean();
      existingIds = found.map((i) => i._id.toString());
    }

    const assignees = [
      ...new Set([
        ...roles.map((r) => `role:${r}`),
        ...existingIds.map((id) => `instructor:${id}`),
      ]),
    ];
    if (assignees.length === 0) throw badRequest("Оберіть хоча б одного виконавця");
    data.assignees = assignees;
  }

  return data;
}

// Картка, яку поточний користувач може змінити: лише власна і не системна
async function loadOwnEditableReminder(req, action) {
  if (!isObjectId(req.params.id)) throw badRequest("Некоректний ID картки");
  const reminder = await Reminder.findById(req.params.id);
  if (!reminder) throw notFound("Картку не знайдено");

  if (reminder.sourceType) {
    const [section, data] = reminder.sourceType.startsWith("instructor-")
      ? ["'Інструктори'", "інструктора"]
      : ["'МТБ: Транспортні засоби'", "ТЗ"];
    throw forbidden(
      action === "edit"
        ? `Ця картка згенерована автоматично — редагуйте дані ${data} у розділі ${section}`
        : `Ця картка згенерована автоматично — приберіть дату в даних ${data}, щоб її прибрати`
    );
  }
  if (reminder.createdByIdentity !== getIdentity(req.user)) {
    throw forbidden(
      action === "edit"
        ? "Редагувати картку може лише її автор"
        : "Видалити картку може лише її автор"
    );
  }
  return reminder;
}

// Картки на діапазон дат, де користувач автор або виконавець.
// series — дані кожної картки один раз; occurrences — легкі записи { _id, date }
// на кожну дату (щоденна серія на рік не дублює опис 365 разів)
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const startDate = asString(req.query.startDate);
    const endDate = asString(req.query.endDate);
    if (!isValidDateStr(startDate) || !isValidDateStr(endDate) || endDate < startDate) {
      throw badRequest("Вкажіть коректні startDate та endDate");
    }
    if (diffDays(startDate, endDate) > MAX_RANGE_DAYS) {
      throw badRequest("Завеликий діапазон дат");
    }

    const identity = getIdentity(req.user);

    const reminders = await Reminder.find({
      $and: [
        { $or: [{ assignees: identity }, { createdByIdentity: identity }] },
        {
          $or: [
            { date: { $gte: startDate, $lte: endDate } },
            { repeat: { $in: REPEATING }, date: { $lte: endDate } },
          ],
        },
      ],
    })
      .sort({ date: 1 })
      .lean();

    const instructorsById = await loadInstructorNames(reminders);

    const series = [];
    const occurrences = [];
    for (const r of reminders) {
      const repeat = r.repeat || "none";
      const dates = occurrencesBetween(r.date, repeat, startDate, endDate);
      if (dates.length === 0) continue;
      series.push({
        _id: r._id,
        title: r.title,
        description: r.description,
        seriesDate: r.date,
        repeat,
        repeatLabel: REPEAT_LABELS[repeat],
        remindBefore: r.remindBefore,
        remindBeforeLabels: r.remindBefore.map((k) => OFFSET_LABELS[k]),
        assignees: r.assignees,
        assigneeNames: r.assignees.map((a) => assigneeName(a, instructorsById)),
        createdByIdentity: r.createdByIdentity,
        createdByName: r.createdByName,
        isMine: r.createdByIdentity === identity,
        sourceType: r.sourceType || null,
      });
      for (const date of dates) occurrences.push({ _id: r._id, date });
    }

    occurrences.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    res.status(200).json({ success: true, series, occurrences });
  })
);

// Кого можна обрати виконавцем: ролі та інструктори
router.get(
  "/assignee-options",
  asyncHandler(async (req, res) => {
    const instructors = await Instructor.find({})
      .select("fullName")
      .sort({ fullName: 1 })
      .lean();
    res.status(200).json({
      success: true,
      roles: [
        { identity: "role:admin", name: "Адміністратор" },
        { identity: "role:accountant", name: "Бухгалтер" },
      ],
      instructors: instructors.map((i) => ({
        identity: `instructor:${i._id}`,
        name: i.fullName,
      })),
    });
  })
);

// Нова картка; автор — поточний користувач
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = await parseReminderBody(req.body, { requireAll: true });

    const createdByName = req.user.fullName;

    const reminder = await Reminder.create({
      description: "",
      remindBefore: [],
      repeat: "none",
      ...data,
      createdByIdentity: getIdentity(req.user),
      createdByName,
    });

    res.status(201).json({ success: true, reminder });
  })
);

// Редагування власної картки. Якщо змінились дата чи графік показу,
// попередні "переглянуто / відкладено" скидаються
router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const reminder = await loadOwnEditableReminder(req, "edit");
    const data = await parseReminderBody(req.body, { requireAll: false });

    const scheduleChanged =
      (data.date !== undefined && data.date !== reminder.date) ||
      (data.repeat !== undefined && data.repeat !== reminder.repeat);

    reminder.set(data);
    if (scheduleChanged) reminder.viewerStates = [];

    await reminder.save();
    res.status(200).json({ success: true, reminder });
  })
);

// Видалення власної картки
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const reminder = await loadOwnEditableReminder(req, "delete");
    await reminder.deleteOne();
    res.status(200).json({ success: true, message: "Картку видалено" });
  })
);

// Сповіщення, які треба показати зараз: настала дата "нагадати за...", і
// користувач його ще не підтвердив і не відклав. Для повторюваних карток
// кожна подія має свої дати, тож підтвердження однієї не ховає наступних
router.get(
  "/due",
  asyncHandler(async (req, res) => {
    const identity = getIdentity(req.user);
    const today = todayStr();
    const now = new Date();

    const candidates = await Reminder.find({
      assignees: identity,
      "remindBefore.0": { $exists: true },
      $or: [
        { repeat: { $in: REPEATING } },
        { date: { $gte: relevantWindow(today).from } },
      ],
    }).lean();

    const due = [];
    for (const reminder of candidates) {
      const viewerState = reminder.viewerStates.find(
        (v) => v.identity === identity
      ) || { lastAcknowledgedTriggerDate: "", snoozeUntil: null };

      if (viewerState.snoozeUntil && new Date(viewerState.snoozeUntil) > now) {
        continue;
      }

      let best = null;
      for (const eventDate of relevantEventDates(reminder, today)) {
        for (const td of computeTriggerDates(eventDate, reminder.remindBefore)) {
          if (td > today || td <= viewerState.lastAcknowledgedTriggerDate) continue;
          if (!best || td > best.triggerDate) best = { triggerDate: td, eventDate };
        }
      }

      if (best) {
        due.push({
          _id: reminder._id,
          title: reminder.title,
          description: reminder.description,
          date: best.eventDate,
          repeat: reminder.repeat || "none",
          createdByName: reminder.createdByName,
          sourceType: reminder.sourceType || null,
          triggerDate: best.triggerDate,
        });
      }
    }

    res.status(200).json({ success: true, due });
  })
);

// Стан сповіщення поточного виконавця (створює, якщо його ще немає)
function upsertViewerState(reminder, identity) {
  let state = reminder.viewerStates.find((v) => v.identity === identity);
  if (!state) {
    reminder.viewerStates.push({
      identity,
      lastAcknowledgedTriggerDate: "",
      snoozeUntil: null,
    });
    state = reminder.viewerStates[reminder.viewerStates.length - 1];
  }
  return state;
}

// Картка, призначена поточному користувачу, або 403/404
async function loadAssignedReminder(req) {
  if (!isObjectId(req.params.id)) throw badRequest("Некоректний ID картки");
  const reminder = await Reminder.findById(req.params.id);
  if (!reminder) throw notFound("Картку не знайдено");
  if (!reminder.assignees.includes(getIdentity(req.user))) {
    throw forbidden("Ця картка вам не призначена");
  }
  return reminder;
}

// "Переглянуто": запам'ятовує останню підтверджену дату сповіщення.
// Майбутню дату не приймаємо — інакше можна заглушити всю серію наперед
router.post(
  "/:id/acknowledge",
  asyncHandler(async (req, res) => {
    const triggerDate = asString(req.body.triggerDate);
    if (!isValidDateStr(triggerDate)) throw badRequest("Не вказано triggerDate");
    if (triggerDate > todayStr()) throw badRequest("Це сповіщення ще не настало");

    const reminder = await loadAssignedReminder(req);
    const state = upsertViewerState(reminder, getIdentity(req.user));

    if (triggerDate > state.lastAcknowledgedTriggerDate) {
      state.lastAcknowledgedTriggerDate = triggerDate;
    }
    state.snoozeUntil = null;

    await reminder.save();
    res.status(200).json({ success: true });
  })
);

// "Нагадати пізніше": ховає сповіщення на годину
router.post(
  "/:id/snooze",
  asyncHandler(async (req, res) => {
    const reminder = await loadAssignedReminder(req);
    const state = upsertViewerState(reminder, getIdentity(req.user));
    state.snoozeUntil = new Date(Date.now() + 60 * 60 * 1000);

    await reminder.save();
    res.status(200).json({ success: true, snoozeUntil: state.snoozeUntil });
  })
);

module.exports = router;
