const express = require("express");
const authMiddleware = require("../../middlewares/authMiddleware");

// Усі маршрути /api/admin/* вимагають авторизації; права конкретних ролей
// перевіряються всередині кожного модуля.
const router = express.Router();

router.use(authMiddleware);
router.use(require("./students"));
router.use(require("./exercises"));
router.use(require("./plannedSchedule"));
router.use(require("./groupSchedule"));

module.exports = router;
