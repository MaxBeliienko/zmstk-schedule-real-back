const express = require("express");
const router = express.Router();
const Instructor = require("../models/Instructor");

router.post("/instructor-login", async (req, res) => {
  const { fullName, pinCode } = req.body;
  try {
    if (!fullName || !pinCode) {
      return res
        .status(400)
        .json({ success: false, message: "Введіть ПІБ та пароль" });
    }
    const instructor = await Instructor.findOne({ fullName });
    if (!instructor) {
      return res
        .status(404)
        .json({ success: false, message: "Інструктора не знайдено" });
    }
    if (instructor.pinCode !== pinCode) {
      return res
        .status(401)
        .json({ success: false, message: "Невірний пароль" });
    }
    res.status(200).json({
      success: true,
      instructor: { id: instructor._id, fullName: instructor.fullName },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/admin-login", async (req, res) => {
  const { password } = req.body;
  if (password === process.env.ADMIN_PASSWORD) {
    return res.status(200).json({ success: true, message: "Вхід виконано" });
  }
  return res
    .status(401)
    .json({ success: false, message: "Невірний пароль адміністратора" });
});

module.exports = router;
