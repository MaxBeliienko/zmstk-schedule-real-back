const crypto = require("crypto");

// Єдине джерело правди для JWT-налаштувань.
//
// Запасного секрету немає: з відомим fallback-значенням будь-хто міг би
// підробити токен адміна. Без JWT_SECRET сервер просто не стартує.
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 16) {
  throw new Error(
    "JWT_SECRET не задано (або коротший за 16 символів). Додайте його в .env / змінні середовища."
  );
}

// Термін дії токена для всіх ролей
const JWT_EXPIRES_IN = "30d";
const JWT_ALGORITHM = "HS256";

// Версія токенів адміна / бухгалтера — похідна від пароля ролі. Зміна
// ADMIN_PASSWORD чи ACCOUNTANT_PASSWORD автоматично відкликає всі токени
// цієї ролі (без окремої змінної середовища).
function staffTokenVersion(role) {
  const password =
    role === "admin" ? process.env.ADMIN_PASSWORD : process.env.ACCOUNTANT_PASSWORD;
  return crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${role}:${password || ""}`)
    .digest("base64url")
    .slice(0, 16);
}

module.exports = { JWT_SECRET, JWT_EXPIRES_IN, JWT_ALGORITHM, staffTokenVersion };
