// Захист від NoSQL-ін'єкцій: прибирає з body/query/params ключі, що
// починаються з "$" або містять ".". Інакше, напр., { "fullName": { "$ne": "" } }
// у тілі запиту перетворився б на оператор MongoDB у фільтрі.
function strip(value) {
  if (Array.isArray(value)) return value.map(strip);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    for (const key of Object.keys(value)) {
      if (key.startsWith("$") || key.includes(".")) {
        delete value[key];
      } else {
        value[key] = strip(value[key]);
      }
    }
  }
  return value;
}

const sanitize = (req, res, next) => {
  strip(req.body);
  strip(req.query);
  strip(req.params);
  next();
};

module.exports = sanitize;
