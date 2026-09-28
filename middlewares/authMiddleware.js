const jwt = require("jsonwebtoken");
const Instructor = require("../models/Instructor");
const { JWT_SECRET, JWT_ALGORITHM, staffTokenVersion } = require("../config/jwt");

const ROLES = ["admin", "accountant", "instructor"];

const unauthorized = (res) =>
  res.status(401).json({
    success: false,
    message: "Сесія завершилась. Увійдіть знову.",
  });

// Перевіряє JWT з заголовка "Authorization: Bearer <token>" і кладе
// розшифровані дані користувача (id, role, fullName) у req.user.
//
// Окрім підпису й терміну дії, звіряє версію токена (tv):
//  - інструктор: має існувати в БД, а tv — збігатися з його tokenVersion
//    (видалення інструктора або зміна PIN відкликає всі його сесії);
//  - адмін / бухгалтер: tv похідна від пароля ролі (зміна пароля
//    відкликає всі сесії цієї ролі).
// Відсутній / недійсний токен — завжди 401; 403 лишається для "немає прав".
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Відсутній або невалідний токен авторизації",
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(authHeader.slice(7), JWT_SECRET, {
      algorithms: [JWT_ALGORITHM],
    });
  } catch {
    return unauthorized(res);
  }
  if (!ROLES.includes(decoded.role)) return unauthorized(res);

  try {
    if (decoded.role === "instructor") {
      const instructor = await Instructor.findById(decoded.id)
        .select("tokenVersion")
        .lean();
      if (!instructor) return unauthorized(res);
      // Старі токени без tv приймаємо, поки версію ще жодного разу не змінювали
      if ((decoded.tv ?? 0) !== (instructor.tokenVersion || 0)) {
        return unauthorized(res);
      }
    } else if (decoded.tv !== staffTokenVersion(decoded.role)) {
      return unauthorized(res);
    }
  } catch (err) {
    return next(err);
  }

  req.user = decoded;
  next();
};

module.exports = authMiddleware;
