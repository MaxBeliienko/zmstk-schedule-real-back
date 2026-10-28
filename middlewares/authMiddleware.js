const jwt = require("jsonwebtoken");
const Account = require("../models/Account");
const { JWT_SECRET, JWT_ALGORITHM } = require("../config/jwt");
const { isObjectId } = require("../utils/http");

const unauthorized = (res, message = "Сесія завершилась. Увійдіть знову.") =>
  res.status(401).json({ success: false, message });

// Перевіряє токен з заголовка "Authorization: Bearer <token>" і кладе дані
// користувача в req.user = { id, accountId, role, fullName }.
// Окрім підпису, звіряє токен з обліковим записом у БД: видалений чи
// заблокований запис, змінений пароль або роль — і токен більше не діє.
// Для інструктора req.user.id — це id інструктора (з ним працюють графіки).
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return unauthorized(res, "Відсутній або невалідний токен авторизації");
  }

  let decoded;
  try {
    decoded = jwt.verify(authHeader.slice(7), JWT_SECRET, { algorithms: [JWT_ALGORITHM] });
  } catch {
    return unauthorized(res);
  }
  if (!isObjectId(decoded.aid)) return unauthorized(res);

  try {
    const account = await Account.findById(decoded.aid)
      .select("role fullName instructorId isActive tokenVersion")
      .lean();
    if (
      !account ||
      !account.isActive ||
      account.role !== decoded.role ||
      (account.tokenVersion || 0) !== decoded.tv
    ) {
      return unauthorized(res);
    }

    const accountId = account._id.toString();
    req.user = {
      id: account.role === "instructor" ? account.instructorId.toString() : accountId,
      accountId,
      role: account.role,
      fullName: account.fullName,
    };
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = authMiddleware;
