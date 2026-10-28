const express = require("express");
const Account = require("../models/Account");
const authMiddleware = require("../middlewares/authMiddleware");
const requireRole = require("../middlewares/requireRole");
const { setAccountPassword, saveAccount } = require("../utils/accounts");
const { asyncHandler, badRequest, notFound, isObjectId, asString } = require("../utils/http");

// Облікові записи персоналу (/api/accounts): адміністратори й бухгалтери.
// Керує ними лише адмін (сторінка "Користувачі" у фронтенді). Паролі
// інструкторів змінюються в розділі "Інструктори" (routes/instructors.js).
const router = express.Router();

router.use(authMiddleware, requireRole.admin);

const STAFF_ROLES = ["admin", "accountant"];

const toDto = (account, req) => ({
  _id: account._id,
  fullName: account.fullName,
  role: account.role,
  isActive: account.isActive,
  createdAt: account.createdAt,
  isSelf: account._id.toString() === req.user.accountId,
});

// Обліковий запис персоналу за id з URL або 404
async function loadStaffAccount(id) {
  if (!isObjectId(id)) throw badRequest("Некоректний ID користувача");
  const account = await Account.findOne({ _id: id, role: { $in: STAFF_ROLES } });
  if (!account) throw notFound("Користувача не знайдено");
  return account;
}

// Чи лишиться в системі хоча б один активний адмін, крім цього запису
const hasOtherActiveAdmin = (account) =>
  Account.exists({ _id: { $ne: account._id }, role: "admin", isActive: true });

function parseFullName(value) {
  const fullName = asString(value)?.trim().replace(/\s+/g, " ");
  if (!fullName) throw badRequest("Вкажіть ім'я користувача");
  return fullName.slice(0, 150);
}

function parseRole(value) {
  if (!STAFF_ROLES.includes(value)) throw badRequest("Оберіть роль: адміністратор або бухгалтер");
  return value;
}

// Список адміністраторів і бухгалтерів
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const accounts = await Account.find({ role: { $in: STAFF_ROLES } })
      .sort({ role: 1, fullName: 1 })
      .lean();
    res.status(200).json({ success: true, accounts: accounts.map((a) => toDto(a, req)) });
  })
);

// Новий адміністратор або бухгалтер
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const account = new Account({
      fullName: parseFullName(req.body.fullName),
      role: parseRole(req.body.role),
    });
    await setAccountPassword(account, asString(req.body.password));
    await saveAccount(account);
    res.status(201).json({ success: true, account: toDto(account, req) });
  })
);

// Зміна імені, ролі, пароля або блокування. Захищає від ситуації, коли в
// системі не лишиться жодного активного адміна (і від блокування самого себе).
router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const account = await loadStaffAccount(req.params.id);
    const isSelf = account._id.toString() === req.user.accountId;
    const body = req.body;

    if (body.fullName !== undefined) account.fullName = parseFullName(body.fullName);

    const nextRole = body.role !== undefined ? parseRole(body.role) : account.role;
    const nextActive = body.isActive !== undefined ? Boolean(body.isActive) : account.isActive;

    if (isSelf && (nextRole !== "admin" || !nextActive)) {
      throw badRequest("Не можна заблокувати власний обліковий запис або забрати в нього права адміністратора");
    }
    const losesAdmin =
      account.role === "admin" && account.isActive && (nextRole !== "admin" || !nextActive);
    if (losesAdmin && !(await hasOtherActiveAdmin(account))) {
      throw badRequest("У системі має лишатися хоча б один активний адміністратор");
    }

    const revokeSessions = nextRole !== account.role || (account.isActive && !nextActive);
    account.role = nextRole;
    account.isActive = nextActive;

    const password = asString(body.password);
    if (password) {
      await setAccountPassword(account, password);
    } else if (revokeSessions) {
      account.tokenVersion = (account.tokenVersion || 0) + 1;
    }

    await saveAccount(account);
    res.status(200).json({ success: true, account: toDto(account, req) });
  })
);

// Видалення облікового запису (не власного і не останнього адміна)
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const account = await loadStaffAccount(req.params.id);
    if (account._id.toString() === req.user.accountId) {
      throw badRequest("Не можна видалити власний обліковий запис");
    }
    if (account.role === "admin" && account.isActive && !(await hasOtherActiveAdmin(account))) {
      throw badRequest("У системі має лишатися хоча б один активний адміністратор");
    }
    await account.deleteOne();
    res.status(200).json({ success: true, message: "Користувача видалено" });
  })
);

module.exports = router;
