const express = require("express");
const jwt = require("jsonwebtoken");
const LoginAttempt = require("../models/LoginAttempt");
const authMiddleware = require("../middlewares/authMiddleware");
const { JWT_SECRET, JWT_EXPIRES_IN, JWT_ALGORITHM } = require("../config/jwt");
const { PASSWORD_MAX_LENGTH } = require("../config/passwords");
const { findAccountByPassword, publicUser } = require("../utils/accounts");
const { asyncHandler, badRequest, HttpError, asString } = require("../utils/http");

// Вхід у систему (/api/auth): один пароль для всіх ролей, роль визначає
// знайдений обліковий запис. Захист від підбору — ліміт невдалих спроб з
// однієї IP-адреси (лічильник у колекції loginattempts, спільний для всіх
// інстансів сервера).
const router = express.Router();

const MAX_FAILED_ATTEMPTS = 10;
const LOCK_MINUTES = 15;
const ATTEMPT_WINDOW_MINUTES = 15;

const minutesLeft = (date) => Math.max(1, Math.ceil((date - Date.now()) / 60000));
const lockedError = (minutes) =>
  new HttpError(429, `Забагато невдалих спроб входу. Спробуйте через ${minutes} хв.`);

// Дата, до якої вхід з цієї IP заблоковано, або null
async function getLockUntil(key) {
  const attempt = await LoginAttempt.findById(key).select("lockUntil").lean();
  return attempt?.lockUntil && attempt.lockUntil > new Date() ? attempt.lockUntil : null;
}

// Рахує невдалу спробу з IP. На MAX_FAILED_ATTEMPTS-й блокує IP на
// LOCK_MINUTES хвилин і повертає true.
async function registerFailedAttempt(key) {
  const now = Date.now();
  await LoginAttempt.deleteOne({ _id: key, expiresAt: { $lte: new Date(now) } });
  const updated = await LoginAttempt.findOneAndUpdate(
    { _id: key },
    {
      $inc: { count: 1 },
      $setOnInsert: { expiresAt: new Date(now + ATTEMPT_WINDOW_MINUTES * 60 * 1000) },
    },
    { upsert: true, new: true }
  );
  if (updated.count < MAX_FAILED_ATTEMPTS) return false;

  const lockUntil = new Date(now + LOCK_MINUTES * 60 * 1000);
  await LoginAttempt.updateOne(
    { _id: key },
    { $set: { count: 0, lockUntil, expiresAt: lockUntil } }
  );
  return true;
}

function signToken(account) {
  return jwt.sign(
    { aid: account._id.toString(), role: account.role, tv: account.tokenVersion || 0 },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN, algorithm: JWT_ALGORITHM }
  );
}

// Вхід за паролем. Приймає { password }; поле pinCode — для старих версій фронтенду.
const login = asyncHandler(async (req, res) => {
  const password = asString(req.body.password) ?? asString(req.body.pinCode);
  if (!password) throw badRequest("Введіть пароль");

  const ipKey = `ip:${req.ip}`;
  const lockUntil = await getLockUntil(ipKey);
  if (lockUntil) throw lockedError(minutesLeft(lockUntil));

  const account =
    password.length <= PASSWORD_MAX_LENGTH ? await findAccountByPassword(password) : null;

  if (!account) {
    const locked = await registerFailedAttempt(ipKey);
    if (locked) throw lockedError(LOCK_MINUTES);
    throw new HttpError(401, "Невірний пароль");
  }
  if (!account.isActive) {
    throw new HttpError(403, "Обліковий запис заблоковано. Зверніться до адміністратора.");
  }

  res.status(200).json({ success: true, token: signToken(account), user: publicUser(account) });
});

router.post("/login", login);

// Старі адреси входу — щоб вкладки зі старою версією фронтенду не ламалися
// одразу після оновлення сервера. Можна видалити згодом.
router.post("/staff-login", login);
router.post("/instructor-login", login);

// Дані поточного користувача (фронтенд перевіряє, чи сесія ще дійсна)
router.get("/me", authMiddleware, (req, res) => {
  res.status(200).json({ success: true, user: req.user });
});

module.exports = router;
