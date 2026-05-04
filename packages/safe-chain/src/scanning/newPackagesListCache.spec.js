import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert";
import fs from "fs";
import path from "path";
import os from "os";

let writeWarningCalls = [];
let ecosystem = "js";
let testHomeDir = "";

mock.module("../environment/userInteraction.js", {
  namedExports: {
    ui: {
      writeWarning: (msg) => writeWarningCalls.push(msg),
    },
  },
});

mock.module("../config/settings.js", {
  namedExports: {
    getEcoSystem: () => ecosystem,
    getMinimumPackageAgeHours: () => 24,
    getMalwareListBaseUrl: () => "https://malware-list.aikido.dev",
    ECOSYSTEM_JS: "js",
    ECOSYSTEM_PY: "py",
  },
});

const { readNewPackagesListFromLocalCache, writeNewPackagesListToLocalCache } =
  await import("./newPackagesListCache.js");

describe("newPackagesListCache", () => {
  beforeEach(() => {
    writeWarningCalls = [];
    ecosystem = "js";
    testHomeDir = path.join(
      os.tmpdir(),
      `safe-chain-list-cache-${process.pid}-${Date.now()}`
    );
    fs.rmSync(testHomeDir, { recursive: true, force: true });
    fs.mkdirSync(testHomeDir, { recursive: true });
    process.env.HOME = testHomeDir;
  });

  describe("readNewPackagesListFromLocalCache", () => {
    it("returns null for both fields when no cache file exists", () => {
      const result = readNewPackagesListFromLocalCache();

      assert.deepStrictEqual(result, { newPackagesList: null, version: null });
    });

    it("returns the list and version when both files exist", () => {
      const list = [{ package_name: "foo", version: "1.0.0" }];
      const safeChainDir = path.join(testHomeDir, ".safe-chain");
      fs.mkdirSync(safeChainDir, { recursive: true });
      fs.writeFileSync(
        path.join(safeChainDir, "newPackagesList_js.json"),
        JSON.stringify(list)
      );
      fs.writeFileSync(
        path.join(safeChainDir, "newPackagesList_version_js.txt"),
        "etag-42"
      );

      const result = readNewPackagesListFromLocalCache();

      assert.deepStrictEqual(result.newPackagesList, list);
      assert.strictEqual(result.version, "etag-42");
    });

    it("returns null version when version file is missing", () => {
      const list = [{ package_name: "foo", version: "1.0.0" }];
      const safeChainDir = path.join(testHomeDir, ".safe-chain");
      fs.mkdirSync(safeChainDir, { recursive: true });
      fs.writeFileSync(
        path.join(safeChainDir, "newPackagesList_js.json"),
        JSON.stringify(list)
      );

      const result = readNewPackagesListFromLocalCache();

      assert.deepStrictEqual(result.newPackagesList, list);
      assert.strictEqual(result.version, null);
    });

    it("trims whitespace from the version string", () => {
      const safeChainDir = path.join(testHomeDir, ".safe-chain");
      fs.mkdirSync(safeChainDir, { recursive: true });
      fs.writeFileSync(
        path.join(safeChainDir, "newPackagesList_js.json"),
        JSON.stringify([])
      );
      fs.writeFileSync(
        path.join(safeChainDir, "newPackagesList_version_js.txt"),
        "  etag-trimmed  \n"
      );

      const { version } = readNewPackagesListFromLocalCache();

      assert.strictEqual(version, "etag-trimmed");
    });

    it("uses the ecosystem name in the file path", () => {
      ecosystem = "py";
      const safeChainDir = path.join(testHomeDir, ".safe-chain");
      fs.mkdirSync(safeChainDir, { recursive: true });
      fs.writeFileSync(
        path.join(safeChainDir, "newPackagesList_py.json"),
        JSON.stringify([{ package_name: "requests", version: "2.0.0" }])
      );

      const result = readNewPackagesListFromLocalCache();

      assert.ok(result.newPackagesList !== null);
    });

    it("warns and returns nulls when the list file contains invalid JSON", () => {
      const safeChainDir = path.join(testHomeDir, ".safe-chain");
      fs.mkdirSync(safeChainDir, { recursive: true });
      fs.writeFileSync(
        path.join(safeChainDir, "newPackagesList_js.json"),
        "not-valid-json"
      );

      const result = readNewPackagesListFromLocalCache();

      assert.deepStrictEqual(result, { newPackagesList: null, version: null });
      assert.strictEqual(writeWarningCalls.length, 1);
      assert.ok(writeWarningCalls[0].includes("local cache"));
    });
  });

  describe("writeNewPackagesListToLocalCache", () => {
    it("writes the list and version to disk", () => {
      const safeChainDir = path.join(testHomeDir, ".safe-chain");
      fs.mkdirSync(safeChainDir, { recursive: true });

      const list = [{ package_name: "foo", version: "1.0.0" }];
      writeNewPackagesListToLocalCache(list, "etag-99");

      const writtenList = JSON.parse(
        fs.readFileSync(path.join(safeChainDir, "newPackagesList_js.json"), "utf8")
      );
      const writtenVersion = fs.readFileSync(
        path.join(safeChainDir, "newPackagesList_version_js.txt"),
        "utf8"
      );

      assert.deepStrictEqual(writtenList, list);
      assert.strictEqual(writtenVersion, "etag-99");
    });

    it("converts a numeric version to a string", () => {
      const safeChainDir = path.join(testHomeDir, ".safe-chain");
      fs.mkdirSync(safeChainDir, { recursive: true });

      writeNewPackagesListToLocalCache([], 42);

      const written = fs.readFileSync(
        path.join(safeChainDir, "newPackagesList_version_js.txt"),
        "utf8"
      );
      assert.strictEqual(written, "42");
    });

    it("warns when writing fails", () => {
      // Place a regular file at the .safe-chain path so getSafeChainDirectory
      // returns it as-is (existsSync is true) but writing a child path fails.
      const safeChainPath = path.join(testHomeDir, ".safe-chain");
      fs.writeFileSync(safeChainPath, "not-a-directory");

      writeNewPackagesListToLocalCache([], "etag-fail");

      assert.strictEqual(writeWarningCalls.length, 1);
      assert.ok(writeWarningCalls[0].includes("local cache"));
    });
  });
});
