// Налаштування JWT-токенів сесії. Без JWT_SECRET сервер не стартує: запасного
// значення немає, бо з відомим секретом будь-хто міг би підробити токен.
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 16) {
  throw new Error(
    "JWT_SECRET не задано (або коротший за 16 символів). Додайте його в .env / змінні середовища."
  );
}

const JWT_EXPIRES_IN = "30d";
const JWT_ALGORITHM = "HS256";

module.exports = { JWT_SECRET, JWT_EXPIRES_IN, JWT_ALGORITHM };
