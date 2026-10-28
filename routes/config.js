const express = require("express");
const { DRIVING_CATEGORIES, PREP_CATEGORIES, STUDY_TYPES } = require("../config/categories");
const {
  REAL_TIME_SLOTS,
  INSTRUCTOR_EDIT_DAYS_BACK,
  PLANNED_DAY_START,
  PLANNED_DAY_END,
  MAX_GRID_RANGE_DAYS,
} = require("../config/timeSlots");
const { PASSWORD_MIN_LENGTH } = require("../config/passwords");
const { OFFSET_LABELS, REPEAT_LABELS } = require("../utils/reminderOffsets");

// Спільні налаштування для фронтенду (GET /api/config): категорії, години
// графіків, ліміти, вимоги до пароля, варіанти нагадувань. Бекенд — єдине
// джерело цих значень: фронтенд завантажує їх під час старту
// (src/components/common/ConfigGate.jsx) і не тримає власних копій.
// Доступно без входу: сторінці входу теж потрібні налаштування.
const router = express.Router();

const toOptions = (labels) => Object.entries(labels).map(([key, label]) => ({ key, label }));

// Збирає відповідь один раз: значення змінюються лише разом із кодом сервера
const CONFIG = Object.freeze({
  drivingCategories: DRIVING_CATEGORIES,
  prepCategories: PREP_CATEGORIES,
  studyTypes: STUDY_TYPES,
  realTimeSlots: REAL_TIME_SLOTS,
  plannedDayStart: PLANNED_DAY_START,
  plannedDayEnd: PLANNED_DAY_END,
  instructorEditDaysBack: INSTRUCTOR_EDIT_DAYS_BACK,
  maxGridRangeDays: MAX_GRID_RANGE_DAYS,
  passwordMinLength: PASSWORD_MIN_LENGTH,
  remindOptions: toOptions(OFFSET_LABELS),
  repeatOptions: toOptions(REPEAT_LABELS),
});

router.get("/", (req, res) => {
  res.status(200).json({ success: true, config: CONFIG });
});

module.exports = router;
