const express = require("express");
const ExerciseCategory = require("../../models/Exercise");
const requireRole = require("../../middlewares/requireRole");
const { asyncHandler } = require("../../utils/http");

const router = express.Router();

// Довідник вправ по категоріях (потрібен для планового графіка)
router.get(
  "/exercises",
  requireRole.admin,
  asyncHandler(async (req, res) => {
    const exercises = await ExerciseCategory.find({}).lean();
    res.status(200).json({ success: true, exercises });
  })
);

module.exports = router;
