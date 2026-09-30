import { describe, it } from "node:test";
import assert from "node:assert";
import { createPnpmPackageManager } from "./createPackageManager.js";

describe("pnpm commandNeedsProxy", () => {
  const pnpm = createPnpmPackageManager();

  const withoutProxy = [
    ["publish"],
    ["publish", "--access", "public", "--no-git-checks", "--dry-run"],
    ["-r", "publish"],
    ["--dir", "/tmp/x", "publish"],
    ["-C", "x", "publish"],
    ["--filter", "pkg", "publish"],
    ["--filter=pkg", "publish"],
    ["run", "build"],
    ["--filter", "pkg", "run", "test"],
    ["--dir", "x", "test"],
  ];

  const withProxy = [
    [],
    ["install"],
    ["add", "axios"],
    ["add", "publish"],
    ["--dir", "x", "add", "axios"],
    ["--filter", "pkg", "install"],
    ["--filter", "publish", "install"],
    ["dlx", "foo"],
  ];

  for (const args of withoutProxy) {
    it(`does not need the proxy for: pnpm ${args.join(" ")}`, () => {
      assert.equal(pnpm.commandNeedsProxy(args), false);
    });
  }

  for (const args of withProxy) {
    it(`needs the proxy for: pnpm ${args.join(" ")}`, () => {
      assert.equal(pnpm.commandNeedsProxy(args), true);
    });
  }
});
