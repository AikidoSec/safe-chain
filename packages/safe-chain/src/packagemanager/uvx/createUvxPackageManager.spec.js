import { test } from "node:test";
import assert from "node:assert";
import { createUvxPackageManager } from "./createUvxPackageManager.js";

test("createUvxPackageManager returns valid package manager interface", () => {
  const pm = createUvxPackageManager();

  assert.ok(pm);
  assert.strictEqual(typeof pm.runCommand, "function");
  assert.strictEqual(typeof pm.isSupportedCommand, "function");
  assert.strictEqual(typeof pm.getDependencyUpdatesForCommand, "function");
  assert.strictEqual(pm.isSupportedCommand(), false);
  assert.deepStrictEqual(pm.getDependencyUpdatesForCommand(), []);
});
