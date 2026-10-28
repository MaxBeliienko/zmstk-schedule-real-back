// Маршрути /api/admin/*: курсанти, довідник вправ, плановий графік і Word-графік групи.
// Усі вимагають входу; права конкретних ролей перевіряє кожен модуль.

const express = require("express");
const authMiddleware = require("../../middlewares/authMiddleware");

const router = express.Router();

router.use(authMiddleware);
router.use(require("./students"));
router.use(require("./exercises"));
router.use(require("./plannedSchedule"));
router.use(require("./groupSchedule"));

module.exports = router;
