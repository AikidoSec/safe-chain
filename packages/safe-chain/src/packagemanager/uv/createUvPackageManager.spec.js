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

  await t.test("should use proxy-only approach (MITM)", () => {
    const pm = createUvPackageManager();
    
    // uv uses proxy-only approach, so it doesn't scan args
    assert.strictEqual(pm.isSupportedCommand(["pip", "install", "requests"]), false);
    assert.strictEqual(pm.isSupportedCommand(["add", "requests"]), false);
    assert.strictEqual(pm.isSupportedCommand([]), false);
  });

  await t.test("should return empty dependency updates", () => {
    const pm = createUvPackageManager();
    
    const result = pm.getDependencyUpdatesForCommand(["pip", "install", "requests"]);
    assert.deepStrictEqual(result, []);
  });
});
