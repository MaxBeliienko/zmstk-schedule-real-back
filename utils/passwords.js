const crypto = require("crypto");
const { promisify } = require("util");
const {
  PASSWORD_PEPPER,
  PASSWORD_PEPPER_OLD,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} = require("../config/passwords");

// Хешування паролів для входу "лише за паролем".
//
// Вхід не має логіна, тож обліковий запис шукається за самим паролем. Для
// цього хеш має бути детермінованим (однаковий пароль -> однаковий ключ),
// тому замість bcrypt з випадковою сіллю використовується scrypt із
// секретним "перцем" сервера. Ключ зберігається в Account.passwordKey з
// унікальним індексом — він же гарантує, що двох однакових паролів немає.

const scrypt = promisify(crypto.scrypt);
const SCRYPT_OPTIONS = { N: 2 ** 14, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

// Ключ пароля для пошуку й збереження в Account.passwordKey
async function derivePasswordKey(password, pepper = PASSWORD_PEPPER) {
  const key = await scrypt(password.normalize("NFC"), pepper, 32, SCRYPT_OPTIONS);
  return key.toString("base64url");
}

// Ключ пароля з попереднім перцем (під час заміни перцю) або null
const deriveOldPasswordKey = (password) =>
  PASSWORD_PEPPER_OLD ? derivePasswordKey(password, PASSWORD_PEPPER_OLD) : Promise.resolve(null);

// Текст помилки, якщо новий пароль не відповідає вимогам, інакше null
function passwordProblem(password) {
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
    return `Пароль має містити щонайменше ${PASSWORD_MIN_LENGTH} символів`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Пароль має бути не довшим за ${PASSWORD_MAX_LENGTH} символів`;
  }
  if (password.trim() !== password) {
    return "Пароль не може починатися або закінчуватися пробілом";
  }
  return null;
}

// Відбиток перцю: зберігається в БД і дозволяє помітити, що сервер
// запустили з іншим PASSWORD_PEPPER (тоді жоден пароль не підійде)
function pepperFingerprint(pepper = PASSWORD_PEPPER) {
  return crypto
    .createHmac("sha256", pepper)
    .update("zmstk-pepper-check")
    .digest("base64url")
    .slice(0, 16);
}

const oldPepperFingerprint = () =>
  PASSWORD_PEPPER_OLD ? pepperFingerprint(PASSWORD_PEPPER_OLD) : null;

// bcrypt-хеш старого PIN (до переходу на вхід за паролем)
const isBcryptHash = (value) => typeof value === "string" && /^\$2[aby]\$/.test(value);

// Старі PIN інструкторів — рівно 6 цифр
const LEGACY_PIN_RE = /^\d{6}$/;

module.exports = {
  derivePasswordKey,
  deriveOldPasswordKey,
  passwordProblem,
  pepperFingerprint,
  oldPepperFingerprint,
  isBcryptHash,
  LEGACY_PIN_RE,
};
