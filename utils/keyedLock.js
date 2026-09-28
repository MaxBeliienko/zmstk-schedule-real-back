const crypto = require("crypto");
const Lock = require("../models/Lock");
const { HttpError } = require("./http");

// Блокування за ключем для операцій "перевірити конфлікти -> зберегти"
// (одне авто / курсант / інструктор на той самий час). Реалізоване через
// колекцію locks у MongoDB, тож коректне і при кількох інстансах сервера.

// Страховка на випадок падіння процесу посеред операції. Операції під
// блокуванням — кілька швидких запитів до БД, тож 30 с з великим запасом.
const LOCK_TTL_MS = 30 * 1000;
const WAIT_TIMEOUT_MS = 10 * 1000; // скільки чекати на зайняте блокування
const RETRY_MIN_MS = 25;
const RETRY_MAX_MS = 100;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function acquire(key, owner) {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  for (;;) {
    try {
      await Lock.create({ _id: key, owner, expiresAt: new Date(Date.now() + LOCK_TTL_MS) });
      return;
    } catch (err) {
      if (err?.code !== 11000) throw err;
    }
    // Прострочене блокування (процес впав) забираємо, не чекаючи TTL-монітора
    await Lock.deleteOne({ _id: key, expiresAt: { $lt: new Date() } });
    if (Date.now() > deadline) {
      throw new HttpError(503, "Сервер зараз зайнятий цим записом. Спробуйте ще раз.");
    }
    await sleep(RETRY_MIN_MS + Math.random() * (RETRY_MAX_MS - RETRY_MIN_MS));
  }
}

async function withLock(key, fn) {
  const owner = crypto.randomUUID();
  await acquire(key, owner);
  try {
    // Навмисно без таймауту на fn: зняти блокування, поки операція ще
    // виконується, означало б знову відкрити гонку
    return await fn();
  } finally {
    await Lock.deleteOne({ _id: key, owner }).catch(() => {});
  }
}

// Блокує декілька ключів у стабільному порядку (без взаємних блокувань)
async function withLocks(keys, fn) {
  const unique = [...new Set(keys)].sort();
  const run = (index) =>
    index >= unique.length ? fn() : withLock(unique[index], () => run(index + 1));
  return run(0);
}

module.exports = { withLock, withLocks };
