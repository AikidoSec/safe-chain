import { test, mock } from "node:test";
import assert from "node:assert";

test("createRushPackageManager", async (t) => {
  mock.module("../../api/npmApi.js", {
    namedExports: {
      resolvePackageVersion: async (name, version) => {
        if (name === "safe-chain-test") {
          return "0.0.1-security";
        }

        if (name === "@scope/tool") {
          return version || "2.0.0";
        }

        return null;
      },
    },
  });

  try {
    const { createRushPackageManager } = await import("./createRushPackageManager.js");

    await t.test("should create package manager with required interface", () => {
      const pm = createRushPackageManager();

      assert.ok(pm);
      assert.strictEqual(typeof pm.runCommand, "function");
      assert.strictEqual(typeof pm.isSupportedCommand, "function");
      assert.strictEqual(typeof pm.getDependencyUpdatesForCommand, "function");
    });

    await t.test("should scan rush add commands", () => {
      const pm = createRushPackageManager();

      assert.strictEqual(pm.isSupportedCommand(["add", "--package", "safe-chain-test"]), true);
      assert.strictEqual(pm.isSupportedCommand(["install"]), false);
    });

    await t.test("should parse rush add package specs and resolve versions", async () => {
      const pm = createRushPackageManager();

      const changes = await pm.getDependencyUpdatesForCommand([
        "add",
        "--package",
        "safe-chain-test",
        "--package=@scope/tool@1.2.3",
      ]);

      assert.deepStrictEqual(changes, [
        { name: "safe-chain-test", version: "0.0.1-security", type: "add" },
        { name: "@scope/tool", version: "1.2.3", type: "add" },
      ]);
    });

    await t.test("should return no changes for non-add commands", async () => {
      const pm = createRushPackageManager();

      const changes = await pm.getDependencyUpdatesForCommand(["install"]);

      assert.deepStrictEqual(changes, []);
    });
  } finally {
    mock.reset();
  }
});
