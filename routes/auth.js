const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const Instructor = require("../models/Instructor");

const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret_key";

// 1. Авторизація Інструктора
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

    // Генерація токена для інструктора
    const token = jwt.sign(
      { id: instructor._id, role: "instructor", fullName: instructor.fullName },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(200).json({
      success: true,
      token,
      user: {
        id: instructor._id,
        fullName: instructor.fullName,
        role: "instructor",
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Авторизація Адміністратора
router.post("/admin-login", async (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res
      .status(400)
      .json({ success: false, message: "Введіть пароль адміністратора" });
  }

  if (password === process.env.ADMIN_PASSWORD) {
    const token = jwt.sign({ role: "admin", username: "Admin" }, JWT_SECRET, {
      expiresIn: "7d",
    });

    return res.status(200).json({
      success: true,
      message: "Вхід виконано",
      token,
      user: {
        username: "Адміністратор",
        role: "admin",
      },
    });
  }

  return res
    .status(401)
    .json({ success: false, message: "Невірний пароль адміністратора" });
});

// 3. 🆕 Авторизація Бухгалтера
router.post("/accountant-login", async (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res
      .status(400)
      .json({ success: false, message: "Введіть пароль бухгалтера" });
  }

  if (password === process.env.ACCOUNTANT_PASSWORD) {
    const token = jwt.sign(
      { role: "accountant", username: "Accountant" },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.status(200).json({
      success: true,
      message: "Вхід виконано успішно",
      token,
      user: {
        username: "Бухгалтер",
        role: "accountant",
      },
    });
  }

  return res
    .status(401)
    .json({ success: false, message: "Невірний пароль бухгалтера" });
});

module.exports = router;
