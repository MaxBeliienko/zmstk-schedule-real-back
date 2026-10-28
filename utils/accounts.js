const bcrypt = require("bcryptjs");
const Account = require("../models/Account");
const {
  derivePasswordKey,
  deriveOldPasswordKey,
  passwordProblem,
  LEGACY_PIN_RE,
} = require("./passwords");
const { badRequest, conflict } = require("./http");

// Робота з обліковими записами: пошук за паролем, зміна пароля, збереження.
// Використовується в routes/auth.js, routes/accounts.js, routes/instructors.js
// та в міграціях.

const PASSWORD_TAKEN_MESSAGE = "Такий пароль уже використовується. Придумайте інший.";

// Знаходить обліковий запис за введеним паролем або повертає null.
// Порядок пошуку:
//  1) ключ з поточним перцем;
//  2) ключ з попереднім перцем (PASSWORD_PEPPER_OLD, під час заміни перцю) —
//     при збігу ключ перераховується з новим перцем;
//  3) старі 6-значні PIN інструкторів (bcrypt) — при збігу теж переводяться
//     на новий ключ.
async function findAccountByPassword(password) {
  const key = await derivePasswordKey(password);
  const account = await Account.findOne({ passwordKey: key });
  if (account) return account;

  const oldKey = await deriveOldPasswordKey(password);
  if (oldKey) {
    const rekeyed = await Account.findOne({ passwordKey: oldKey });
    if (rekeyed) {
      rekeyed.passwordKey = key;
      await saveAccount(rekeyed);
      return rekeyed;
    }
  }

  if (!LEGACY_PIN_RE.test(password)) return null;

  const legacyAccounts = await Account.find({
    passwordKey: null,
    legacyPinHash: { $type: "string" },
  }).select("+legacyPinHash");

  const matches = [];
  for (const candidate of legacyAccounts) {
    if (await bcrypt.compare(password, candidate.legacyPinHash)) matches.push(candidate);
  }
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    throw conflict(
      "Цей PIN однаковий у кількох інструкторів. Попросіть адміністратора змінити вам пароль."
    );
  }

  const [migrated] = matches;
  migrated.passwordKey = key;
  migrated.legacyPinHash = null;
  await saveAccount(migrated);
  return migrated;
}

// Перевіряє новий пароль і записує його в обліковий запис (без збереження).
// Пароль має бути унікальним серед усіх облікових записів. Для наявного
// запису збільшує tokenVersion — усі його сесії завершуються.
async function setAccountPassword(account, password) {
  const problem = passwordProblem(password);
  if (problem) throw badRequest(problem);

  const key = await derivePasswordKey(password);
  // Під час заміни перцю пароль ще не переведених користувачів зберігається
  // зі старим перцем — перевіряємо збіг і з ним
  const oldKey = await deriveOldPasswordKey(password);
  const taken = await Account.exists({
    passwordKey: { $in: oldKey ? [key, oldKey] : [key] },
    _id: { $ne: account._id },
  });
  if (taken) throw conflict(PASSWORD_TAKEN_MESSAGE);

  account.passwordKey = key;
  account.legacyPinHash = null;
  if (!account.isNew) account.tokenVersion = (account.tokenVersion || 0) + 1;
}

// Зберігає обліковий запис. Якщо паралельно хтось встиг зберегти такий самий
// пароль, унікальний індекс поверне помилку — показуємо зрозуміле повідомлення.
async function saveAccount(account) {
  try {
    return await account.save();
  } catch (err) {
    if (err?.code === 11000 && err.keyPattern?.passwordKey) {
      throw conflict(PASSWORD_TAKEN_MESSAGE);
    }
    throw err;
  }
}

// Дані користувача, які отримує фронтенд після входу та в /api/auth/me.
// id — це id інструктора для інструктора або id облікового запису для персоналу.
function publicUser(account) {
  const accountId = account._id.toString();
  return {
    id: account.role === "instructor" ? account.instructorId.toString() : accountId,
    accountId,
    role: account.role,
    fullName: account.fullName,
  };
}

module.exports = {
  findAccountByPassword,
  setAccountPassword,
  saveAccount,
  publicUser,
};
