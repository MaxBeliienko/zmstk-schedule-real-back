const mongoose = require("mongoose");

// Транзакції MongoDB для операцій, що змінюють кілька записів одразу
// (видалення інструктора чи курсанта, збереження дня графіка тощо): або
// виконуються всі зміни, або жодна. Використовується в routes/.
//
// Режим transactionAsyncLocalStorage: усі запити Mongoose всередині
// withTransaction автоматично йдуть у транзакції, сесію не треба передавати
// в кожну функцію (напр. у utils/systemReminderSync.js).
mongoose.set("transactionAsyncLocalStorage", true);

let supported = null;

// Транзакції працюють лише на replica set (MongoDB Atlas — так). Для
// одиночного сервера (напр. локальний mongod) операції виконуються без
// транзакції, а в лог пишеться попередження.
async function transactionsSupported() {
  if (supported !== null) return supported;
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  supported = Boolean(hello.setName || hello.msg === "isdbgrid");
  if (!supported) {
    console.warn("⚠️  MongoDB без replica set: зміни кількох записів виконуються без транзакцій.");
  }
  return supported;
}

// Виконує fn у транзакції й повертає її результат. Будь-яка помилка всередині
// скасовує всі зміни. При тимчасовому конфлікті з іншою транзакцією MongoDB
// fn виконується повторно, тож у ній не повинно бути зовнішніх дій (листів,
// запитів до інших сервісів) — лише робота з БД.
async function withTransaction(fn) {
  if (!(await transactionsSupported())) return fn();
  let result;
  await mongoose.connection.transaction(async () => {
    result = await fn();
  });
  return result;
}

module.exports = { withTransaction };
