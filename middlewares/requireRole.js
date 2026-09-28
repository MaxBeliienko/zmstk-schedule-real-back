// Використовується ПІСЛЯ authMiddleware. Пропускає лише перелічені ролі,
// напр. requireRole("admin", "accountant").
const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) {
    return res.status(403).json({
      success: false,
      message: "Недостатньо прав для цієї дії",
    });
  }
  next();
};

// Готові комбінації ролей, щоб не дублювати списки по роутах
requireRole.admin = requireRole("admin");
requireRole.staff = requireRole("admin", "accountant");

module.exports = requireRole;
