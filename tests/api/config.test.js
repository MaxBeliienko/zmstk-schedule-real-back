// Тест спільних налаштувань для фронтенду (GET /api/config).

const { describe, test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const h = require("../helpers");
const { DRIVING_CATEGORIES } = require("../../config/categories");
const { REAL_TIME_SLOTS, MAX_GRID_RANGE_DAYS } = require("../../config/timeSlots");
const { PASSWORD_MIN_LENGTH } = require("../../config/passwords");

describe("Налаштування для фронтенду", () => {
  before(h.startDb);
  after(h.stopDb);

  test("доступні без входу і віддають значення з конфігурації сервера", async () => {
    const res = await h.api().get("/api/config");
    assert.equal(res.status, 200);
    const { config } = res.body;
    assert.deepEqual(config.drivingCategories, DRIVING_CATEGORIES);
    assert.deepEqual(config.realTimeSlots, REAL_TIME_SLOTS);
    assert.equal(config.maxGridRangeDays, MAX_GRID_RANGE_DAYS);
    assert.equal(config.passwordMinLength, PASSWORD_MIN_LENGTH);
    assert.deepEqual(config.remindOptions[0], { key: "1_day", label: "За день" });
    assert.equal(config.repeatOptions[0].key, "none");
  });
});
