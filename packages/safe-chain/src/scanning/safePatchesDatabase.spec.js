import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert";
import fs from "fs";
import path from "path";
import os from "os";

// --- shared mutable state for mocks ---
let fetchedList = [];
let fetchedVersion = "etag-1";
let fetchVersionResult = "etag-1";
let ecosystem = "js";
let writeWarningCalls = [];
let fetchListError = null;
let fetchVersionError = null;
let importCounter = 0;
let testHomeDir = "";

mock.module("../api/aikido.js", {
  namedExports: {
    fetchSafePatchesList: async () => {
      if (fetchListError) {
        throw fetchListError;
      }

      return {
        safePatchesList: fetchedList,
        version: fetchedVersion,
      };
    },
    fetchSafePatchesListVersion: async () => {
      if (fetchVersionError) {
        throw fetchVersionError;
      }

      return fetchVersionResult;
    },
  },
});

mock.module("../environment/userInteraction.js", {
  namedExports: {
    ui: {
      writeWarning: (msg) => writeWarningCalls.push(msg),
      writeVerbose: () => {},
    },
  },
});

mock.module("../config/settings.js", {
  namedExports: {
    getEcoSystem: () => ecosystem,
    getMalwareListBaseUrl: () => "https://malware-list.aikido.dev",
    ECOSYSTEM_JS: "js",
    ECOSYSTEM_PY: "py",
  },
});

// Import the warnings module so we can reset its state between tests.
const { resetWarningState } = await import(
  "./safePatchesDatabaseWarnings.js"
);

describe("safePatchesDatabase", async () => {
  beforeEach(() => {
    fetchedList = [];
    fetchedVersion = "etag-1";
    fetchVersionResult = "etag-1";
    ecosystem = "js";
    writeWarningCalls = [];
    fetchListError = null;
    fetchVersionError = null;
    resetWarningState();
    testHomeDir = path.join(
      os.tmpdir(),
      `safe-chain-safe-patches-db-${process.pid}-${importCounter}`
    );
    fs.rmSync(testHomeDir, { recursive: true, force: true });
    fs.mkdirSync(testHomeDir, { recursive: true });
    process.env.HOME = testHomeDir;
  });

  async function openSafePatchesDatabase() {
    const module = await import(
      `./safePatchesListCache.js?test_case=${importCounter++}`
    );
    return module.openSafePatchesDatabase();
  }

  async function loadSafePatchesDatabaseModule() {
    return import(`./safePatchesListCache.js?test_case=${importCounter++}`);
  }

  function writeCachedList(list, version) {
    const safeChainDir = path.join(testHomeDir, ".safe-chain");
    fs.mkdirSync(safeChainDir, { recursive: true });
    fs.writeFileSync(
      path.join(safeChainDir, "safePatchesList.json"),
      JSON.stringify(list)
    );
    fs.writeFileSync(
      path.join(safeChainDir, "safePatchesList_version.txt"),
      version
    );
  }

  describe("isSafePatch", () => {
    it("returns true for an exact name+version match", async () => {
      fetchedList = [
        { package_name: "proxy-addr", version: "2.0.8", ecosystem: "npm" },
      ];

      const db = await openSafePatchesDatabase();
      assert.strictEqual(db.isSafePatch("proxy-addr", "2.0.8"), true);
    });

    it("returns false for a different version", async () => {
      fetchedList = [
        { package_name: "proxy-addr", version: "2.0.8", ecosystem: "npm" },
      ];

      const db = await openSafePatchesDatabase();
      assert.strictEqual(db.isSafePatch("proxy-addr", "2.0.9"), false);
    });

    it("returns false for a package not in the list", async () => {
      fetchedList = [];

      const db = await openSafePatchesDatabase();
      assert.strictEqual(db.isSafePatch("not-there", "1.0.0"), false);
    });

    it("does not exempt a same-named package in a different ecosystem", async () => {
      fetchedList = [
        { package_name: "requests", version: "2.31.0", ecosystem: "npm" },
      ];
      ecosystem = "py";

      const db = await openSafePatchesDatabase();
      assert.strictEqual(db.isSafePatch("requests", "2.31.0"), false);
    });
  });

  describe("caching behaviour", () => {
    it("uses local cache when etag matches", async () => {
      writeCachedList(
        [{ package_name: "cached-pkg", version: "1.0.0", ecosystem: "npm" }],
        "etag-1"
      );
      fetchVersionResult = "etag-1";
      // fetchedList is empty — if we used the remote list, the lookup would return false
      fetchedList = [];

      const db = await openSafePatchesDatabase();
      assert.strictEqual(db.isSafePatch("cached-pkg", "1.0.0"), true);
    });

    it("fetches fresh list when etag does not match", async () => {
      writeCachedList(
        [{ package_name: "stale-pkg", version: "1.0.0", ecosystem: "npm" }],
        "etag-old"
      );
      fetchVersionResult = "etag-new";
      fetchedList = [
        { package_name: "fresh-pkg", version: "2.0.0", ecosystem: "npm" },
      ];

      const db = await openSafePatchesDatabase();
      assert.strictEqual(db.isSafePatch("stale-pkg", "1.0.0"), false);
      assert.strictEqual(db.isSafePatch("fresh-pkg", "2.0.0"), true);
    });

    it("falls back to local cache when fetch fails", async () => {
      writeCachedList(
        [{ package_name: "cached-pkg", version: "1.0.0", ecosystem: "npm" }],
        "etag-old"
      );
      fetchVersionResult = "etag-new";
      fetchListError = new Error("Network error");

      const db = await openSafePatchesDatabase();

      assert.strictEqual(db.isSafePatch("cached-pkg", "1.0.0"), true);
      assert.strictEqual(writeWarningCalls.length, 1);
      assert.ok(writeWarningCalls[0].includes("Using cached version"));
    });

    it("emits a warning when list has no version (cannot be cached)", async () => {
      fetchedList = [
        { package_name: "foo", version: "1.0.0", ecosystem: "npm" },
      ];
      fetchedVersion = undefined;

      const db = await openSafePatchesDatabase();
      assert.strictEqual(db.isSafePatch("foo", "1.0.0"), true);
      assert.strictEqual(writeWarningCalls.length, 1);
      assert.ok(writeWarningCalls[0].includes("could not be cached"));
    });

    it("fails open (treats the list as empty) and only warns once when the safe patches list cannot be loaded", async () => {
      fetchListError = new Error("feed unavailable");

      const module = await loadSafePatchesDatabaseModule();
      const db1 = await module.openSafePatchesDatabase();
      const db2 = await module.openSafePatchesDatabase();

      assert.strictEqual(db1.isSafePatch("foo", "1.0.0"), false);
      assert.strictEqual(db2.isSafePatch("foo", "1.0.0"), false);
      assert.strictEqual(writeWarningCalls.length, 1);
      assert.ok(
        writeWarningCalls[0].includes(
          "Continuing without safe patch exemptions"
        )
      );
    });
  });
});
