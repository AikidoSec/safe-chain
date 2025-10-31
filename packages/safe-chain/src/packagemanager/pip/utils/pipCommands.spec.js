import { test } from "node:test";
import assert from "node:assert";
import {
  getPipCommandForArgs,
  hasDryRunArg,
  pipInstallCommand,
  pipDownloadCommand,
  pipWheelCommand,
} from "./pipCommands.js";

test("getPipCommandForArgs", async (t) => {
  await t.test("should return null for empty args", () => {
    assert.strictEqual(getPipCommandForArgs([]), null);
  });

  await t.test("should return null for null args", () => {
    assert.strictEqual(getPipCommandForArgs(null), null);
  });

  await t.test("should return the first non-flag argument", () => {
    assert.strictEqual(getPipCommandForArgs(["install"]), "install");
  });

  await t.test("should skip flags and return command", () => {
    assert.strictEqual(
      getPipCommandForArgs(["-v", "--verbose", "install"]),
      "install"
    );
  });

  await t.test("should return install command", () => {
    assert.strictEqual(
      getPipCommandForArgs(["install", "requests"]),
      "install"
    );
  });

  await t.test("should return uninstall command", () => {
    assert.strictEqual(
      getPipCommandForArgs(["uninstall", "requests"]),
      "uninstall"
    );
  });

  await t.test("should return null if only flags", () => {
    assert.strictEqual(getPipCommandForArgs(["--version", "-v"]), null);
  });
});

test("hasDryRunArg", async (t) => {
  await t.test("should return false for empty args", () => {
    assert.strictEqual(hasDryRunArg([]), false);
  });

  await t.test("should return true if --dry-run is present", () => {
    assert.strictEqual(hasDryRunArg(["install", "--dry-run", "requests"]), true);
  });

  await t.test("should return false if --dry-run is not present", () => {
    assert.strictEqual(hasDryRunArg(["install", "requests"]), false);
  });

  await t.test("should return true for --dry-run with other flags", () => {
    assert.strictEqual(
      hasDryRunArg(["install", "-v", "--dry-run", "--upgrade", "requests"]),
      true
    );
  });
});

test("command constants", async (t) => {
  await t.test("should have correct install command", () => {
    assert.strictEqual(pipInstallCommand, "install");
  });

  await t.test("should have correct download command", () => {
    assert.strictEqual(pipDownloadCommand, "download");
  });

  await t.test("should have correct wheel command", () => {
    assert.strictEqual(pipWheelCommand, "wheel");
  });
});
