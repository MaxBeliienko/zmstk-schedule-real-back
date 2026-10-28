// Перевірка ролі користувача. Використовується після authMiddleware, який
// кладе роль у req.user.

// Пропускає лише перелічені ролі, інакше 403. Напр. requireRole("admin", "accountant")
const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) {
    return res.status(403).json({
      success: false,
      message: "Недостатньо прав для цієї дії",
    });
  }
  next();
};

// Готові комбінації, щоб не повторювати списки ролей у роутах
requireRole.admin = requireRole("admin");
requireRole.staff = requireRole("admin", "accountant");

module.exports = requireRole;
