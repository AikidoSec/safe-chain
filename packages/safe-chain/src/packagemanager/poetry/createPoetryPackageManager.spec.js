import { test } from "node:test";
import assert from "node:assert";
import { createPoetryPackageManager } from "./createPoetryPackageManager.js";

test("createPoetryPackageManager", async (t) => {
  await t.test("should create package manager with required interface", () => {
    const pm = createPoetryPackageManager();
    
    assert.ok(pm);
    assert.strictEqual(typeof pm.runCommand, "function");
    assert.strictEqual(typeof pm.isSupportedCommand, "function");
    assert.strictEqual(typeof pm.getDependencyUpdatesForCommand, "function");
  });
});
