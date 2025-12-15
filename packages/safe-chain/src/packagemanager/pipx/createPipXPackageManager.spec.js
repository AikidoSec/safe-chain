import { test } from "node:test";
import assert from "node:assert";
import { createPipXPackageManager } from "./createPipXPackageManager.js";

test("createPipXPackageManager", async (t) => {
  await t.test("should create package manager with required interface", () => {
    const pm = createPipXPackageManager();
    
    assert.ok(pm);
    assert.strictEqual(typeof pm.runCommand, "function");
    assert.strictEqual(typeof pm.isSupportedCommand, "function");
    assert.strictEqual(typeof pm.getDependencyUpdatesForCommand, "function");
  });
});
