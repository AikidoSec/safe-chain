import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert";

let ecosystem = "js";
let minimumPackageAgeHours = 24;
let malwareListBaseUrl = "https://malware-list.aikido.dev";
let openCachedListCalls = [];
let openCachedListShouldReject = false;
let writeWarningCalls = [];

mock.module("../config/settings.js", {
  namedExports: {
    getEcoSystem: () => ecosystem,
    ECOSYSTEM_JS: "js",
    ECOSYSTEM_PY: "py",
    getMinimumPackageAgeHours: () => minimumPackageAgeHours,
    getMalwareListBaseUrl: () => malwareListBaseUrl,
    defaultMalwareListBaseUrl: "https://malware-list.aikido.dev",
  },
});

mock.module("./remoteListCache.js", {
  namedExports: {
    openCachedList: (listType, builder) => {
      openCachedListCalls.push({ listType, builder });
      if (openCachedListShouldReject) {
        return Promise.reject(new Error("feed unavailable"));
      }
      return Promise.resolve(builder([]));
    },
  },
});

mock.module("../environment/userInteraction.js", {
  namedExports: {
    ui: {
      writeWarning: (msg) => writeWarningCalls.push(msg),
    },
  },
});

// Mocked so this spec doesn't drag in remoteList.js's own dependency chain
// (settings.js / userInteraction.js / fileLogger.js), which the narrow settings.js
// mock above can't satisfy.
const ListType = {
  NPM_NEW_PACKAGES_LIST_2D: "NPM_NEW_PACKAGES_LIST_2D",
  PYPI_NEW_PACKAGES_LIST_2D: "PYPI_NEW_PACKAGES_LIST_2D",
  NPM_NEW_PACKAGES_LIST_7D: "NPM_NEW_PACKAGES_LIST_7D",
  PYPI_NEW_PACKAGES_LIST_7D: "PYPI_NEW_PACKAGES_LIST_7D",
};
mock.module("../api/remoteList.js", {
  namedExports: { ListType },
});

const { openNewPackagesDatabase } = await import("./newPackagesListCache.js");
const { buildNewPackagesDatabase } = await import(
  "./newPackagesDatabaseBuilder.js"
);
const { resetWarningState } = await import("./newPackagesDatabaseWarnings.js");

describe("newPackagesListCache", () => {
  beforeEach(() => {
    ecosystem = "js";
    minimumPackageAgeHours = 24;
    malwareListBaseUrl = "https://malware-list.aikido.dev";
    openCachedListCalls = [];
    openCachedListShouldReject = false;
    writeWarningCalls = [];
    resetWarningState();
  });

  describe("list type selection", () => {
    it("requests the npm 2-day list for js under the default mirror within the age threshold", async () => {
      await openNewPackagesDatabase();

      assert.strictEqual(
        openCachedListCalls[0].listType,
        ListType.NPM_NEW_PACKAGES_LIST_2D
      );
    });

    it("requests the pypi 2-day list for py under the default mirror within the age threshold", async () => {
      ecosystem = "py";

      await openNewPackagesDatabase();

      assert.strictEqual(
        openCachedListCalls[0].listType,
        ListType.PYPI_NEW_PACKAGES_LIST_2D
      );
    });

    it("requests the 7-day list when minimumPackageAgeHours exceeds 48", async () => {
      minimumPackageAgeHours = 168;

      await openNewPackagesDatabase();

      assert.strictEqual(
        openCachedListCalls[0].listType,
        ListType.NPM_NEW_PACKAGES_LIST_7D
      );
    });

    it("requests the 7-day list for py when minimumPackageAgeHours exceeds 48", async () => {
      ecosystem = "py";
      minimumPackageAgeHours = 168;

      await openNewPackagesDatabase();

      assert.strictEqual(
        openCachedListCalls[0].listType,
        ListType.PYPI_NEW_PACKAGES_LIST_7D
      );
    });

    it("uses the 7-day list on a non-default mirror even within the age threshold", async () => {
      // Mirrors only host the long-duration feed (npm.json / pypi.json), not the newer
      // npm_48h.json / pypi_48h.json - requesting the 48h feed there would break them.
      malwareListBaseUrl = "https://mirror.example.com/lists";

      await openNewPackagesDatabase();

      assert.strictEqual(
        openCachedListCalls[0].listType,
        ListType.NPM_NEW_PACKAGES_LIST_7D
      );
    });

    it("uses the 2-day list on the default mirror regardless of trailing slash normalisation", async () => {
      malwareListBaseUrl = "https://malware-list.aikido.dev";

      await openNewPackagesDatabase();

      assert.strictEqual(
        openCachedListCalls[0].listType,
        ListType.NPM_NEW_PACKAGES_LIST_2D
      );
    });

    it("builds the list with buildNewPackagesDatabase", async () => {
      await openNewPackagesDatabase();

      assert.strictEqual(openCachedListCalls[0].builder, buildNewPackagesDatabase);
    });
  });

  describe("fail-open behaviour", () => {
    it("returns a database that reports no newly released packages when the list cannot be loaded", async () => {
      openCachedListShouldReject = true;

      const db = await openNewPackagesDatabase();

      assert.strictEqual(db.isNewlyReleasedPackage("foo", "1.0.0"), false);
    });

    it("warns only once across repeated failures", async () => {
      openCachedListShouldReject = true;

      await openNewPackagesDatabase();
      await openNewPackagesDatabase();

      assert.strictEqual(writeWarningCalls.length, 1);
      assert.ok(
        writeWarningCalls[0].includes(
          "Continuing with metadata-based minimum age checks only"
        )
      );
    });
  });
});
