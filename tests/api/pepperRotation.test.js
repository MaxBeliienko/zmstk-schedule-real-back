// Окремий файл (окремий процес): PASSWORD_PEPPER_OLD треба задати до
// підключення застосунку
process.env.PASSWORD_PEPPER_OLD = "old-pepper-at-least-16-chars";

const { describe, test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const h = require("../helpers");
const Account = require("../../models/Account");
const Setting = require("../../models/Setting");
const { derivePasswordKey, pepperFingerprint } = require("../../utils/passwords");
const { runMigrations } = require("../../migrations");

describe("Заміна PASSWORD_PEPPER через PASSWORD_PEPPER_OLD", () => {
  before(h.startDb);
  after(h.stopDb);
  beforeEach(h.clearDb);

  test("сервер приймає новий перець, а старі паролі діють і переводяться на новий", async () => {
    const oldPepper = process.env.PASSWORD_PEPPER_OLD;
    await Setting.create({ _id: "passwordPepperFingerprint", value: pepperFingerprint(oldPepper) });
    const account = await Account.create({
      role: "accountant",
      fullName: "Бухгалтер",
      passwordKey: await derivePasswordKey("my-old-password", oldPepper),
    });

    await runMigrations();
    const saved = await Setting.findById("passwordPepperFingerprint").lean();
    assert.equal(saved.value, pepperFingerprint());

    const res = await h.login("my-old-password");
    assert.equal(res.status, 200);
    const stored = await Account.findById(account._id).select("+passwordKey");
    assert.equal(stored.passwordKey, await derivePasswordKey("my-old-password"));
  });

  test("невідомий перець — сервер не стартує", async () => {
    await Setting.create({ _id: "passwordPepperFingerprint", value: "something-else" });
    await assert.rejects(runMigrations(), /PASSWORD_PEPPER/);
  });
});
