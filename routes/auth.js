const express = require("express");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const Instructor = require("../models/Instructor");
const authMiddleware = require("../middlewares/authMiddleware");
const {
  JWT_SECRET,
  JWT_EXPIRES_IN,
  JWT_ALGORITHM,
  staffTokenVersion,
} = require("../config/jwt");
const { asyncHandler, badRequest, HttpError, asString } = require("../utils/http");

const router = express.Router();

// Захист від перебору паролів: не більше 10 НЕВДАЛИХ спроб за 15 хв з
// одного IP (успішні входи не рахуються — щоб кілька інструкторів з одного
// офісного IP не блокували одне одного).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Забагато невдалих спроб входу. Спробуйте через 15 хвилин.",
  },
});

const { isBcryptHash } = Instructor;

// Блокування акаунта інструктора після серії невдалих спроб — захищає PIN
// від перебору навіть з різних IP (ліміт за IP цього не покриває)
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

// Хеш-"пустушка": якщо ПІБ не знайдено, все одно робимо bcrypt.compare,
// щоб за часом відповіді не можна було визначити, чи існує такий інструктор
const DUMMY_HASH = bcrypt.hashSync("dummy-pin-for-timing", 10);

// Порівняння паролів за сталий час (без витоку довжини/збігу префікса)
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !b) return false;
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const STAFF_USERS = {
  admin: { role: "admin", username: "Адміністратор" },
  accountant: { role: "accountant", username: "Бухгалтер" },
};

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    algorithm: JWT_ALGORITHM,
  });
}

const minutesLeft = (date) => Math.max(1, Math.ceil((date - Date.now()) / 60000));

async function registerFailedAttempt(instructorId) {
  const updated = await Instructor.findByIdAndUpdate(
    instructorId,
    { $inc: { failedLoginAttempts: 1 } },
    { new: true }
  ).select("failedLoginAttempts");
  if (updated && updated.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
    await Instructor.updateOne(
      { _id: instructorId },
      {
        $set: {
          failedLoginAttempts: 0,
          lockUntil: new Date(Date.now() + LOCK_MINUTES * 60 * 1000),
        },
      }
    );
    return true;
  }
  return false;
}

function staffLoginResponse(res, role) {
  const user = STAFF_USERS[role];
  const token = signToken({
    role: user.role,
    username: user.username,
    tv: staffTokenVersion(role),
  });
  return res.status(200).json({ success: true, token, user });
}

// Визначає роль за паролем (адмін або бухгалтер) — або null
function resolveStaffRole(password) {
  if (safeEqual(password, process.env.ADMIN_PASSWORD)) return "admin";
  if (safeEqual(password, process.env.ACCOUNTANT_PASSWORD)) return "accountant";
  return null;
}

// 1. Авторизація інструктора
router.post(
  "/instructor-login",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const fullName = asString(req.body.fullName)?.trim();
    const pinCode = asString(req.body.pinCode);

    if (!fullName || !pinCode) throw badRequest("Введіть ПІБ та пароль");

    const instructor = await Instructor.findOne({ fullName });

    if (!instructor) {
      await bcrypt.compare(pinCode, DUMMY_HASH);
      throw new HttpError(401, "Невірне ПІБ або пароль");
    }

    if (instructor.lockUntil && instructor.lockUntil > new Date()) {
      throw new HttpError(
        429,
        `Забагато невдалих спроб. Вхід для цього інструктора заблоковано на ${minutesLeft(
          instructor.lockUntil
        )} хв.`
      );
    }

    // Підтримуємо як вже захешовані PIN-коди (bcrypt), так і старі
    // збережені у відкритому вигляді — після успішного входу такий PIN
    // автоматично перехешовується (лінива міграція).
    let isValidPin;
    if (isBcryptHash(instructor.pinCode)) {
      isValidPin = await bcrypt.compare(pinCode, instructor.pinCode);
    } else {
      isValidPin = safeEqual(pinCode, instructor.pinCode);
      if (isValidPin) {
        // Хешуємо явно: присвоєння того самого рядка Mongoose не вважає
        // зміною, тож pre-save хук раніше не спрацьовував і PIN лишався
        // відкритим текстом. PIN той самий — сесії не відкликаємо.
        instructor.pinCode = await bcrypt.hash(pinCode, 10);
        instructor.$locals.keepTokenVersion = true;
      }
    }

    if (!isValidPin) {
      const locked = await registerFailedAttempt(instructor._id);
      throw new HttpError(
        locked ? 429 : 401,
        locked
          ? `Забагато невдалих спроб. Вхід для цього інструктора заблоковано на ${LOCK_MINUTES} хв.`
          : "Невірне ПІБ або пароль"
      );
    }

    if (instructor.failedLoginAttempts || instructor.lockUntil) {
      instructor.failedLoginAttempts = 0;
      instructor.lockUntil = null;
    }
    if (instructor.isModified()) await instructor.save();

    const user = {
      id: instructor._id.toString(),
      fullName: instructor.fullName,
      role: "instructor",
    };
    const token = signToken({ ...user, tv: instructor.tokenVersion || 0 });

    res.status(200).json({ success: true, token, user });
  })
);

// 2. Єдиний вхід для адміністратора / бухгалтера: роль визначається за
// паролем. Один запит замість двох — rate limit рахується коректно, а
// мережеві помилки більше не маскуються під "невірний пароль".
router.post(
  "/staff-login",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const password = asString(req.body.password);
    if (!password) throw badRequest("Введіть пароль");

    const role = resolveStaffRole(password);
    if (!role) throw new HttpError(401, "Невірний пароль доступу");

    return staffLoginResponse(res, role);
  })
);

// Старі окремі ендпоінти лишаємо для сумісності (на випадок, якщо бекенд
// оновиться раніше за фронтенд). Нові клієнти використовують /staff-login.
router.post(
  "/admin-login",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const password = asString(req.body.password);
    if (!password) throw badRequest("Введіть пароль адміністратора");
    if (resolveStaffRole(password) !== "admin") {
      throw new HttpError(401, "Невірний пароль адміністратора");
    }
    return staffLoginResponse(res, "admin");
  })
);

router.post(
  "/accountant-login",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const password = asString(req.body.password);
    if (!password) throw badRequest("Введіть пароль бухгалтера");
    if (resolveStaffRole(password) !== "accountant") {
      throw new HttpError(401, "Невірний пароль бухгалтера");
    }
    return staffLoginResponse(res, "accountant");
  })
);

// Перевірка поточної сесії: фронтенд викликає при старті, щоб одразу
// розлогінити користувача з простроченим токеном
router.get("/me", authMiddleware, (req, res) => {
  const { id, role, fullName, username } = req.user;
  res.status(200).json({
    success: true,
    user: role === "instructor" ? { id, role, fullName } : { role, username },
  });
});

module.exports = router;
