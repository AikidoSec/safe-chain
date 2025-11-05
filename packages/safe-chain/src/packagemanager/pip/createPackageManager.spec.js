import { test } from "node:test";
import assert from "node:assert";
import { createPipPackageManager } from "./createPackageManager.js";

test("createPipPackageManager", async (t) => {
  await t.test("should create package manager with required interface", () => {
    const pm = createPipPackageManager();
    
    assert.ok(pm);
    assert.strictEqual(typeof pm.runCommand, "function");
    assert.strictEqual(typeof pm.isSupportedCommand, "function");
    assert.strictEqual(typeof pm.getDependencyUpdatesForCommand, "function");
  });

  await t.test("should accept pip3 as command parameter", () => {
    const pm = createPipPackageManager("pip3");
    assert.ok(pm);
  });

  await t.test("should support install, download, and wheel commands", () => {
    const pm = createPipPackageManager();
    // MITM-only approach, pip does not scan args
    assert.strictEqual(pm.isSupportedCommand(["install", "requests"]), false);
    assert.strictEqual(pm.isSupportedCommand(["download", "requests"]), false);
    assert.strictEqual(pm.isSupportedCommand(["wheel", "requests"]), false);
  });

  await t.test("should not support uninstall and info commands", () => {
    const pm = createPipPackageManager();
    
    assert.strictEqual(pm.isSupportedCommand(["uninstall", "requests"]), false);
    assert.strictEqual(pm.isSupportedCommand(["list"]), false);
    assert.strictEqual(pm.isSupportedCommand(["show", "requests"]), false);
  });

  await t.test("should extract packages from install command", () => {
    const pm = createPipPackageManager();
    const result = pm.getDependencyUpdatesForCommand(["install", "requests==2.28.0"]);
    assert.ok(Array.isArray(result));
    assert.strictEqual(result.length, 0);
  });

  await t.test("should return empty array for unsupported commands", () => {
    const pm = createPipPackageManager();
    
    const result = pm.getDependencyUpdatesForCommand(["uninstall", "requests"]);
    assert.ok(Array.isArray(result));
    assert.strictEqual(result.length, 0);
  });

  await t.test("should handle empty args gracefully", () => {
    const pm = createPipPackageManager();
    
    assert.strictEqual(pm.isSupportedCommand([]), false);
    assert.deepStrictEqual(pm.getDependencyUpdatesForCommand([]), []);
  });
});
