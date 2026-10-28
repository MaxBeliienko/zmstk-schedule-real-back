// Налаштування паролів. "Перець" (PASSWORD_PEPPER) — секрет сервера, з яким
// хешуються всі паролі (utils/passwords.js). Без нього сервер не стартує.
//
// Як змінити перець, не втративши паролі: новий записати в PASSWORD_PEPPER,
// а попередній — у PASSWORD_PEPPER_OLD. Користувачі входять як завжди, і
// при вході їхній пароль автоматично переводиться на новий перець. Коли всі
// хоча б раз увійдуть, PASSWORD_PEPPER_OLD можна прибрати.
// Якщо перець втрачено зовсім — див. scripts/resetAdminPassword.js.
const PASSWORD_PEPPER = process.env.PASSWORD_PEPPER;
const PASSWORD_PEPPER_OLD = process.env.PASSWORD_PEPPER_OLD || null;

if (!PASSWORD_PEPPER || PASSWORD_PEPPER.length < 16) {
  throw new Error(
    "PASSWORD_PEPPER не задано (або коротший за 16 символів). Додайте його в .env / змінні середовища."
  );
}

// Вимоги до нових паролів (старі 6-значні PIN діють, доки їх не змінять)
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

module.exports = {
  PASSWORD_PEPPER,
  PASSWORD_PEPPER_OLD,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
};
