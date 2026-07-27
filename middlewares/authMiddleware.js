const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
  // Шукаємо токен у заголовку Authorization (формат: "Bearer <token>")
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Відсутній або невалідний токен авторизації",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    // Декодуємо токен (переконайтеся, що ключ відповідає тому, яким ви його підписуєте при логіні)
    const secretKey = process.env.JWT_SECRET || "your_jwt_secret_key"; // Замініть на свій секретний ключ, якщо використовуєте змінну середовища
    const decoded = jwt.verify(token, secretKey);

    // Зберігаємо дані користувача (включаючи role) у об'єкт запиту `req.user`
    req.user = decoded;

    next();
  } catch (error) {
    return res.status(403).json({
      success: false,
      message: "Недійсний або прострочений токен",
    });
  }
};

module.exports = authMiddleware;
