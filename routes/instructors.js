const express = require("express");
const router = express.Router();
const Instructor = require("../models/Instructor");

router.get("/", async (req, res) => {
  try {
    // Отримуємо fullName та certificate (без pinCode з міркувань безпеки)
    const instructors = await Instructor.find({}).select(
      "fullName certificate"
    );
    res.status(200).json({ success: true, instructors });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
