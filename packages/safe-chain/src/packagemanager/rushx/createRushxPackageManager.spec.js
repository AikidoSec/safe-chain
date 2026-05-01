import { test } from "node:test";
import assert from "node:assert";
import { createRushxPackageManager } from "./createRushxPackageManager.js";

test("createRushxPackageManager returns valid package manager interface", () => {
  const pm = createRushxPackageManager();

  assert.ok(pm);
  assert.strictEqual(typeof pm.runCommand, "function");
  assert.strictEqual(typeof pm.isSupportedCommand, "function");
  assert.strictEqual(typeof pm.getDependencyUpdatesForCommand, "function");
  assert.strictEqual(pm.isSupportedCommand(), false);
  assert.deepStrictEqual(pm.getDependencyUpdatesForCommand(), []);
});
