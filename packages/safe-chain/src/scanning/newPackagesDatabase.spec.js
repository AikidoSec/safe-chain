import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert";

// --- shared mutable state for mocks ---
let cachedList = null;
let cachedVersion = null;
let fetchedList = [];
let fetchedVersion = "etag-1";
let fetchVersionResult = "etag-1";
let minimumPackageAgeHours = 24;
let ecosystem = "js";
let writeWarningCalls = [];
let fetchListError = null;
let fetchVersionError = null;
let importCounter = 0;

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

mock.module("../config/configFile.js", {
  namedExports: {
    readNewPackagesListFromLocalCache: () => ({
      newPackagesList: cachedList,
      version: cachedVersion,
    }),
    writeNewPackagesListToLocalCache: () => {},
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
    ECOSYSTEM_JS: "js",
    ECOSYSTEM_PY: "py",
  },
});

describe("newPackagesDatabase", async () => {
  beforeEach(() => {
    cachedList = null;
    cachedVersion = null;
    fetchedList = [];
    fetchedVersion = "etag-1";
    fetchVersionResult = "etag-1";
    minimumPackageAgeHours = 24;
    ecosystem = "js";
    writeWarningCalls = [];
    fetchListError = null;
    fetchVersionError = null;
  });

  async function openNewPackagesDatabase() {
    const module = await import(
      `./newPackagesDatabase.js?test_case=${importCounter++}`
    );
    return module.openNewPackagesDatabase();
  }

  async function loadNewPackagesDatabaseModule() {
    return import(`./newPackagesDatabase.js?test_case=${importCounter++}`);
  }

  function hoursAgo(hours) {
    return Math.floor((Date.now() - hours * 3600 * 1000) / 1000);
  }

  describe("isNewlyReleasedPackage", () => {
    it("returns true for a package released within the age threshold", async () => {
      fetchedList = [
        { source: "js", name: "foo", version: "1.0.0", released_on: hoursAgo(1), scraped_on: hoursAgo(1) },
      ];

      const db = await openNewPackagesDatabase();
      assert.strictEqual(db.isNewlyReleasedPackage("foo", "1.0.0"), true);
    });

    it("returns false for a package released outside the age threshold", async () => {
      fetchedList = [
        { source: "js", name: "foo", version: "1.0.0", released_on: hoursAgo(48), scraped_on: hoursAgo(48) },
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
        { source: "js", name: "foo", version: "2.0.0", released_on: hoursAgo(1), scraped_on: hoursAgo(1) },
      ];

      const db = await openNewPackagesDatabase();
      assert.strictEqual(db.isNewlyReleasedPackage("foo", "1.0.0"), false);
    });

    it("ignores entries from a different source in a mixed feed", async () => {
      fetchedList = [
        {
          source: "npm",
          name: "foo",
          version: "1.0.0",
          released_on: hoursAgo(1),
          scraped_on: hoursAgo(1),
        },
        {
          source: "js",
          name: "bar",
          version: "1.0.0",
          released_on: hoursAgo(1),
          scraped_on: hoursAgo(1),
        },
      ];

      const db = await openNewPackagesDatabase();

      assert.strictEqual(db.isNewlyReleasedPackage("foo", "1.0.0"), false);
      assert.strictEqual(db.isNewlyReleasedPackage("bar", "1.0.0"), true);
    });

    it("respects a custom minimumPackageAgeHours threshold", async () => {
      minimumPackageAgeHours = 168; // 7 days
      fetchedList = [
        { source: "js", name: "foo", version: "1.0.0", released_on: hoursAgo(100), scraped_on: hoursAgo(100) },
      ];

      const db = await openNewPackagesDatabase();
      assert.strictEqual(db.isNewlyReleasedPackage("foo", "1.0.0"), true);
    });

    it("returns false for all packages when ecosystem is not JS", async () => {
      ecosystem = "py";
      const db = await openNewPackagesDatabase();
      assert.strictEqual(db.isNewlyReleasedPackage("foo", "1.0.0"), false);
    });
  });

  describe("caching behaviour", () => {
    it("uses local cache when etag matches", async () => {
      cachedList = [
        { source: "js", name: "cached-pkg", version: "1.0.0", released_on: hoursAgo(1), scraped_on: hoursAgo(1) },
      ];
      cachedVersion = "etag-1";
      fetchVersionResult = "etag-1";
      // fetchedList is empty — if we used the remote list, the lookup would return false
      fetchedList = [];

      const db = await openNewPackagesDatabase();
      assert.strictEqual(db.isNewlyReleasedPackage("cached-pkg", "1.0.0"), true);
    });

    it("fetches fresh list when etag does not match", async () => {
      cachedList = [
        { source: "js", name: "stale-pkg", version: "1.0.0", released_on: hoursAgo(1), scraped_on: hoursAgo(1) },
      ];
      cachedVersion = "etag-old";
      fetchVersionResult = "etag-new";
      fetchedList = [
        { source: "js", name: "fresh-pkg", version: "2.0.0", released_on: hoursAgo(1), scraped_on: hoursAgo(1) },
      ];

      const db = await openNewPackagesDatabase();
      assert.strictEqual(db.isNewlyReleasedPackage("stale-pkg", "1.0.0"), false);
      assert.strictEqual(db.isNewlyReleasedPackage("fresh-pkg", "2.0.0"), true);
    });

    it("falls back to local cache when fetch fails", async () => {
      cachedList = [
        {
          source: "js",
          name: "cached-pkg",
          version: "1.0.0",
          released_on: hoursAgo(1),
          scraped_on: hoursAgo(1),
        },
      ];
      cachedVersion = "etag-old";
      fetchVersionResult = "etag-new";
      fetchListError = new Error("Network error");

      const db = await openNewPackagesDatabase();

      assert.strictEqual(db.isNewlyReleasedPackage("cached-pkg", "1.0.0"), true);
      assert.strictEqual(writeWarningCalls.length, 1);
      assert.ok(writeWarningCalls[0].includes("Using cached version"));
    });

    it("emits a warning when list has no version (cannot be cached)", async () => {
      fetchedList = [
        { source: "js", name: "foo", version: "1.0.0", released_on: hoursAgo(1), scraped_on: hoursAgo(1) },
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
          "Continuing without tarball minimum age fallback"
        )
      );
    });
  });
});
