// Блокування за ключем для операцій "перевірити конфлікти -> зберегти" (одне
// авто / курсант / інструктор на той самий час). Тримається в колекції locks
// (models/Lock.js), тож коректне і при кількох інстансах сервера.
// Використовується в routes/schedule.js, routes/admin/plannedSchedule.js і міграціях.

const crypto = require("crypto");
const Lock = require("../models/Lock");
const { HttpError } = require("./http");

// Блокування саме зникне через 30 с, якщо процес упаде; чекати чуже — до 10 с
const LOCK_TTL_MS = 30 * 1000;
const WAIT_TIMEOUT_MS = 10 * 1000;
const RETRY_MIN_MS = 25;
const RETRY_MAX_MS = 100;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Захоплює блокування: створює запис з _id = key, а якщо він зайнятий —
// чекає з випадковою паузою. Прострочене блокування забирає одразу
async function acquire(key, owner) {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  for (;;) {
    try {
      await Lock.create({ _id: key, owner, expiresAt: new Date(Date.now() + LOCK_TTL_MS) });
      return;
    } catch (err) {
      if (err?.code !== 11000) throw err;
    }
    await Lock.deleteOne({ _id: key, expiresAt: { $lt: new Date() } });
    if (Date.now() > deadline) {
      throw new HttpError(503, "Сервер зараз зайнятий цим записом. Спробуйте ще раз.");
    }
    await sleep(RETRY_MIN_MS + Math.random() * (RETRY_MAX_MS - RETRY_MIN_MS));
  }
}

// Виконує fn під блокуванням і завжди знімає його після
async function withLock(key, fn) {
  const owner = crypto.randomUUID();
  await acquire(key, owner);
  try {
    return await fn();
  } finally {
    await Lock.deleteOne({ _id: key, owner }).catch(() => {});
  }
}

// Кілька блокувань у стабільному порядку (так дві операції не заблокують одна одну)
async function withLocks(keys, fn) {
  const unique = [...new Set(keys)].sort();
  const run = (index) =>
    index >= unique.length ? fn() : withLock(unique[index], () => run(index + 1));
  return run(0);
}

module.exports = { withLock, withLocks };
