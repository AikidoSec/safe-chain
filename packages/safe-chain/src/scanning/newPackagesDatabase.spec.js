import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert";
import fs from "fs";
import path from "path";
import os from "os";

// --- shared mutable state for mocks ---
let fetchedList = [];
let fetchedVersion = "etag-1";
let fetchVersionResult = "etag-1";
let minimumPackageAgeHours = 24;
let ecosystem = "js";
let writeWarningCalls = [];
let fetchListError = null;
let fetchVersionError = null;
let importCounter = 0;
let testHomeDir = "";

mock.module("../api/aikido.js", {
  namedExports: {
    fetchNewPackagesList: async () => {
      if (fetchListError) {
        throw fetchListError;
      }

      return {
        newPackagesList: fetchedList,
        version: fetchedVersion,
      };
    },
    fetchNewPackagesListVersion: async () => {
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
    getMinimumPackageAgeHours: () => minimumPackageAgeHours,
    getEcoSystem: () => ecosystem,
    getMalwareListBaseUrl: () => "https://malware-list.aikido.dev",
    ECOSYSTEM_JS: "js",
    ECOSYSTEM_PY: "py",
  },
});

// Import the warnings module so we can reset its state between tests.
const { resetWarningState } = await import("./newPackagesDatabaseWarnings.js");

describe("newPackagesDatabase", async () => {
  beforeEach(() => {
    fetchedList = [];
    fetchedVersion = "etag-1";
    fetchVersionResult = "etag-1";
    minimumPackageAgeHours = 24;
    ecosystem = "js";
    writeWarningCalls = [];
    fetchListError = null;
    fetchVersionError = null;
    resetWarningState();
    testHomeDir = path.join(
      os.tmpdir(),
      `safe-chain-new-packages-db-${process.pid}-${importCounter}`
    );
    fs.rmSync(testHomeDir, { recursive: true, force: true });
    fs.mkdirSync(testHomeDir, { recursive: true });
    process.env.HOME = testHomeDir;
  });

  async function openNewPackagesDatabase() {
    const module = await import(
      `./newPackagesListCache.js?test_case=${importCounter++}`
    );
    return module.openNewPackagesDatabase();
  }

  async function loadNewPackagesDatabaseModule() {
    return import(`./newPackagesListCache.js?test_case=${importCounter++}`);
  }

  function hoursAgo(hours) {
    return Math.floor((Date.now() - hours * 3600 * 1000) / 1000);
  }

  function writeCachedList(list, version) {
    const safeChainDir = path.join(testHomeDir, ".safe-chain");
    fs.mkdirSync(safeChainDir, { recursive: true });
    fs.writeFileSync(
      path.join(safeChainDir, `newPackagesList_${ecosystem}.json`),
      JSON.stringify(list)
    );
    fs.writeFileSync(
      path.join(safeChainDir, `newPackagesList_version_${ecosystem}.txt`),
      version
    );
  }

  describe("isNewlyReleasedPackage", () => {
    it("returns true for a package released within the age threshold", async () => {
      fetchedList = [
        { package_name: "foo", version: "1.0.0", released_on: hoursAgo(1) },
      ];

      const db = await openNewPackagesDatabase();
      assert.strictEqual(db.isNewlyReleasedPackage("foo", "1.0.0"), true);
    });

    it("returns false for a package released outside the age threshold", async () => {
      fetchedList = [
        { package_name: "foo", version: "1.0.0", released_on: hoursAgo(48) },
      ];

      const db = await openNewPackagesDatabase();
      assert.strictEqual(db.isNewlyReleasedPackage("foo", "1.0.0"), false);
    });

    it("returns false for a package not in the list", async () => {
      fetchedList = [];

      const db = await openNewPackagesDatabase();
      assert.strictEqual(db.isNewlyReleasedPackage("not-there", "1.0.0"), false);
    });

    it("returns false for a known package but different version", async () => {
      fetchedList = [
        { package_name: "foo", version: "2.0.0", released_on: hoursAgo(1) },
      ];

      const db = await openNewPackagesDatabase();
      assert.strictEqual(db.isNewlyReleasedPackage("foo", "1.0.0"), false);
    });

    it("matches the current feed ecosystem when source metadata is present", async () => {
      fetchedList = [
        {
          source: "pypi",
          package_name: "foo",
          version: "1.0.0",
          released_on: hoursAgo(1),
        },
        {
          source: "npm",
          package_name: "bar",
          version: "1.0.0",
          released_on: hoursAgo(1),
        },
      ];

      const db = await openNewPackagesDatabase();

      assert.strictEqual(db.isNewlyReleasedPackage("foo", "1.0.0"), false);
      assert.strictEqual(db.isNewlyReleasedPackage("bar", "1.0.0"), true);
    });

    it("respects a custom minimumPackageAgeHours threshold", async () => {
      minimumPackageAgeHours = 168; // 7 days
      fetchedList = [
        { package_name: "foo", version: "1.0.0", released_on: hoursAgo(100) },
      ];

      const db = await openNewPackagesDatabase();
      assert.strictEqual(db.isNewlyReleasedPackage("foo", "1.0.0"), true);
    });

    it("supports package checks for the python ecosystem", async () => {
      ecosystem = "py";
      fetchedList = [
        {
          source: "pypi",
          package_name: "foo",
          version: "1.0.0",
          released_on: hoursAgo(1),
        },
      ];
      const db = await openNewPackagesDatabase();
      assert.strictEqual(db.isNewlyReleasedPackage("foo", "1.0.0"), true);
    });
  });

  describe("caching behaviour", () => {
    it("uses local cache when etag matches", async () => {
      writeCachedList([
        { package_name: "cached-pkg", version: "1.0.0", released_on: hoursAgo(1) },
      ], "etag-1");
      fetchVersionResult = "etag-1";
      // fetchedList is empty — if we used the remote list, the lookup would return false
      fetchedList = [];

      const db = await openNewPackagesDatabase();
      assert.strictEqual(db.isNewlyReleasedPackage("cached-pkg", "1.0.0"), true);
    });

    it("fetches fresh list when etag does not match", async () => {
      writeCachedList([
        { package_name: "stale-pkg", version: "1.0.0", released_on: hoursAgo(1) },
      ], "etag-old");
      fetchVersionResult = "etag-new";
      fetchedList = [
        { package_name: "fresh-pkg", version: "2.0.0", released_on: hoursAgo(1) },
      ];

      const db = await openNewPackagesDatabase();
      assert.strictEqual(db.isNewlyReleasedPackage("stale-pkg", "1.0.0"), false);
      assert.strictEqual(db.isNewlyReleasedPackage("fresh-pkg", "2.0.0"), true);
    });

    it("falls back to local cache when fetch fails", async () => {
      writeCachedList([
        {
          package_name: "cached-pkg",
          version: "1.0.0",
          released_on: hoursAgo(1),
        },
      ], "etag-old");
      fetchVersionResult = "etag-new";
      fetchListError = new Error("Network error");

      const db = await openNewPackagesDatabase();

      assert.strictEqual(db.isNewlyReleasedPackage("cached-pkg", "1.0.0"), true);
      assert.strictEqual(writeWarningCalls.length, 1);
      assert.ok(writeWarningCalls[0].includes("Using cached version"));
    });

    it("emits a warning when list has no version (cannot be cached)", async () => {
      fetchedList = [
        { package_name: "foo", version: "1.0.0", released_on: hoursAgo(1) },
      ];
      fetchedVersion = undefined;

      const db = await openNewPackagesDatabase();
      assert.strictEqual(db.isNewlyReleasedPackage("foo", "1.0.0"), true);
      assert.strictEqual(writeWarningCalls.length, 1);
      assert.ok(writeWarningCalls[0].includes("could not be cached"));
    });

    it("fails open and only warns once when the new packages list cannot be loaded", async () => {
      fetchListError = new Error("feed unavailable");

      const module = await loadNewPackagesDatabaseModule();
      const db1 = await module.openNewPackagesDatabase();
      const db2 = await module.openNewPackagesDatabase();

      assert.strictEqual(db1.isNewlyReleasedPackage("foo", "1.0.0"), false);
      assert.strictEqual(db2.isNewlyReleasedPackage("foo", "1.0.0"), false);
      assert.strictEqual(writeWarningCalls.length, 1);
      assert.ok(
        writeWarningCalls[0].includes(
          "Continuing with metadata-based minimum age checks only"
        )
      );
    });
  });
});
