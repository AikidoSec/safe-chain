import { test } from "node:test";
import assert from "node:assert";
import { createPdmPackageManager } from "./createPdmPackageManager.js";

test("createPdmPackageManager", async (t) => {
  await t.test("should create package manager with required interface", () => {
    const pm = createPdmPackageManager();

    assert.ok(pm);
    assert.strictEqual(typeof pm.runCommand, "function");
    assert.strictEqual(typeof pm.isSupportedCommand, "function");
    assert.strictEqual(typeof pm.getDependencyUpdatesForCommand, "function");
  });
});
