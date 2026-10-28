const { describe, test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const h = require("../helpers");
const Account = require("../../models/Account");
const Instructor = require("../../models/Instructor");
const { runMigrations } = require("../../migrations");

describe("Міграція на вхід за паролем", () => {
  before(h.startDb);
  after(h.stopDb);
  beforeEach(h.clearDb);

  test("інструктори зі старими PIN і персонал з .env отримують облікові записи", async () => {
    process.env.ADMIN_PASSWORD = "env-admin-pass";
    process.env.ACCOUNTANT_PASSWORD = "env-accountant-pass";

    // Як у бойовій базі до оновлення: PIN (bcrypt) прямо в картці інструктора
    const { insertedId } = await Instructor.collection.insertOne({
      fullName: "Іваненко І.І.",
      pinCode: await bcrypt.hash("654321", 4),
      tokenVersion: 2,
    });

    await runMigrations();
    await runMigrations();

    assert.equal(await Account.countDocuments({ role: "instructor" }), 1);
    assert.equal(await Account.countDocuments({ role: "admin" }), 1);
    assert.equal(await Account.countDocuments({ role: "accountant" }), 1);

    const raw = await Instructor.collection.findOne({ _id: insertedId });
    assert.equal(raw.pinCode, undefined);

    const instructor = await h.login("654321");
    assert.equal(instructor.status, 200);
    assert.equal(instructor.body.user.id, insertedId.toString());
    assert.equal((await h.login("env-admin-pass")).body.user.role, "admin");
    assert.equal((await h.login("env-accountant-pass")).body.user.role, "accountant");
  });
});
