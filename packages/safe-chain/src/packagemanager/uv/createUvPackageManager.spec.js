import { test } from "node:test";
import assert from "node:assert";
import { createUvPackageManager } from "./createUvPackageManager.js";

test("createUvPackageManager", async (t) => {
  await t.test("should create package manager with required interface", () => {
    const pm = createUvPackageManager();
    
    assert.ok(pm);
    assert.strictEqual(typeof pm.runCommand, "function");
    assert.strictEqual(typeof pm.isSupportedCommand, "function");
    assert.strictEqual(typeof pm.getDependencyUpdatesForCommand, "function");
  });
});
