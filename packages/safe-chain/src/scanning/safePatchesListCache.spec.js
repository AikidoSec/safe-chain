import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert";
import fs from "fs";
import path from "path";
import os from "os";

let writeWarningCalls = [];
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
    getEcoSystem: () => "js",
    getMalwareListBaseUrl: () => "https://malware-list.aikido.dev",
    ECOSYSTEM_JS: "js",
    ECOSYSTEM_PY: "py",
    defaultMalwareListBaseUrl: "https://malware-list.aikido.dev",
    getMinimumPackageAgeHours: () => 48,
    getVersion: () => "0.0.0",
  },
});

const {
  readSafePatchesListFromLocalCache,
  writeSafePatchesListToLocalCache,
} = await import("./safePatchesListCache.js");

describe("safePatchesListCache", () => {
  beforeEach(() => {
    writeWarningCalls = [];
    testHomeDir = path.join(
      os.tmpdir(),
      `safe-chain-safe-patches-cache-${process.pid}-${Date.now()}`
    );
    fs.rmSync(testHomeDir, { recursive: true, force: true });
    fs.mkdirSync(testHomeDir, { recursive: true });
    process.env.HOME = testHomeDir;
  });

  describe("readSafePatchesListFromLocalCache", () => {
    it("returns null for both fields when no cache file exists", () => {
      const result = readSafePatchesListFromLocalCache();

      assert.deepStrictEqual(result, { safePatchesList: null, version: null });
    });

    it("returns the list and version when both files exist", () => {
      const list = [
        { package_name: "proxy-addr", version: "2.0.8", ecosystem: "npm" },
      ];
      const safeChainDir = path.join(testHomeDir, ".safe-chain");
      fs.mkdirSync(safeChainDir, { recursive: true });
      fs.writeFileSync(
        path.join(safeChainDir, "safePatchesList.json"),
        JSON.stringify(list)
      );
      fs.writeFileSync(
        path.join(safeChainDir, "safePatchesList_version.txt"),
        "etag-42"
      );

      const result = readSafePatchesListFromLocalCache();

      assert.deepStrictEqual(result.safePatchesList, list);
      assert.strictEqual(result.version, "etag-42");
    });

    it("returns null version when version file is missing", () => {
      const list = [
        { package_name: "proxy-addr", version: "2.0.8", ecosystem: "npm" },
      ];
      const safeChainDir = path.join(testHomeDir, ".safe-chain");
      fs.mkdirSync(safeChainDir, { recursive: true });
      fs.writeFileSync(
        path.join(safeChainDir, "safePatchesList.json"),
        JSON.stringify(list)
      );

      const result = readSafePatchesListFromLocalCache();

      assert.deepStrictEqual(result.safePatchesList, list);
      assert.strictEqual(result.version, null);
    });

    it("trims whitespace from the version string", () => {
      const safeChainDir = path.join(testHomeDir, ".safe-chain");
      fs.mkdirSync(safeChainDir, { recursive: true });
      fs.writeFileSync(
        path.join(safeChainDir, "safePatchesList.json"),
        JSON.stringify([])
      );
      fs.writeFileSync(
        path.join(safeChainDir, "safePatchesList_version.txt"),
        "  etag-trimmed  \n"
      );

      const { version } = readSafePatchesListFromLocalCache();

      assert.strictEqual(version, "etag-trimmed");
    });

    it("warns and returns nulls when the list file contains invalid JSON", () => {
      const safeChainDir = path.join(testHomeDir, ".safe-chain");
      fs.mkdirSync(safeChainDir, { recursive: true });
      fs.writeFileSync(
        path.join(safeChainDir, "safePatchesList.json"),
        "not-valid-json"
      );

      const result = readSafePatchesListFromLocalCache();

      assert.deepStrictEqual(result, { safePatchesList: null, version: null });
      assert.strictEqual(writeWarningCalls.length, 1);
      assert.ok(writeWarningCalls[0].includes("local cache"));
    });
  });

  describe("writeSafePatchesListToLocalCache", () => {
    it("writes the list and version to disk", () => {
      const safeChainDir = path.join(testHomeDir, ".safe-chain");
      fs.mkdirSync(safeChainDir, { recursive: true });

      const list = [
        { package_name: "proxy-addr", version: "2.0.8", ecosystem: "npm" },
      ];
      writeSafePatchesListToLocalCache(list, "etag-99");

      const writtenList = JSON.parse(
        fs.readFileSync(
          path.join(safeChainDir, "safePatchesList.json"),
          "utf8"
        )
      );
      const writtenVersion = fs.readFileSync(
        path.join(safeChainDir, "safePatchesList_version.txt"),
        "utf8"
      );

      assert.deepStrictEqual(writtenList, list);
      assert.strictEqual(writtenVersion, "etag-99");
    });

    it("converts a numeric version to a string", () => {
      const safeChainDir = path.join(testHomeDir, ".safe-chain");
      fs.mkdirSync(safeChainDir, { recursive: true });

      writeSafePatchesListToLocalCache([], 42);

      const written = fs.readFileSync(
        path.join(safeChainDir, "safePatchesList_version.txt"),
        "utf8"
      );
      assert.strictEqual(written, "42");
    });

    it("warns when writing fails", () => {
      // Place a regular file at the .safe-chain path so getSafeChainDirectory
      // returns it as-is (existsSync is true) but writing a child path fails.
      const safeChainPath = path.join(testHomeDir, ".safe-chain");
      fs.writeFileSync(safeChainPath, "not-a-directory");

      writeSafePatchesListToLocalCache([], "etag-fail");

      assert.strictEqual(writeWarningCalls.length, 1);
      assert.ok(writeWarningCalls[0].includes("local cache"));
    });
  });
});
