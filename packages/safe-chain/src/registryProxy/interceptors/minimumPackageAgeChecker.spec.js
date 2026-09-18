import { describe, it, mock } from "node:test";
import assert from "node:assert";

describe("minimumPackageAgeChecker", async () => {
  let minimumPackageAgeHours = 48;
  let skipMinimumPackageAgeSetting = false;
  let minimumPackageAgeExclusionsSetting = [];

  mock.module("../../config/settings.js", {
    namedExports: {
      ECOSYSTEM_JS: "js",
      ECOSYSTEM_PY: "py",
      getEcoSystem: () => "js",
      getMinimumPackageAgeHours: () => minimumPackageAgeHours,
      skipMinimumPackageAge: () => skipMinimumPackageAgeSetting,
      getMinimumPackageAgeExclusions: () => minimumPackageAgeExclusionsSetting,
      getMalwareListBaseUrl: () => "https://malware-list.aikido.dev",
      defaultMalwareListBaseUrl: "https://malware-list.aikido.dev",
      getVersion: () => "0.0.0",
    },
  });

  mock.module("../../environment/userInteraction.js", {
    namedExports: {
      ui: {
        writeWarning: () => {},
        writeVerbose: () => {},
      },
    },
  });

  const { createMinimumPackageAgeChecker } = await import(
    "./minimumPackageAgeChecker.js"
  );

  function hoursAgo(hours) {
    return new Date(Date.now() - hours * 3600 * 1000).toISOString();
  }

  function makeChecker({
    newlyReleased = new Set(),
    safePatches = new Set(),
    allowSafePatches = true,
  } = {}) {
    return createMinimumPackageAgeChecker({
      newPackagesDatabase: {
        isNewlyReleasedPackage: (name, version) =>
          newlyReleased.has(`${name}@${version}`),
      },
      safePatchesDatabase: {
        isSafePatch: (name, version) => safePatches.has(`${name}@${version}`),
      },
      allowSafePatches,
    });
  }

  describe("isPackageExempt", () => {
    it("returns false by default", () => {
      const checker = makeChecker();
      assert.strictEqual(checker.isPackageExempt("lodash"), false);
    });

    it("returns true when the age check is globally skipped", () => {
      skipMinimumPackageAgeSetting = true;
      try {
        const checker = makeChecker();
        assert.strictEqual(checker.isPackageExempt("lodash"), true);
      } finally {
        skipMinimumPackageAgeSetting = false;
      }
    });

    it("returns true when the package matches a configured exclusion", () => {
      minimumPackageAgeExclusionsSetting = ["lodash"];
      try {
        const checker = makeChecker();
        assert.strictEqual(checker.isPackageExempt("lodash"), true);
        assert.strictEqual(checker.isPackageExempt("express"), false);
      } finally {
        minimumPackageAgeExclusionsSetting = [];
      }
    });

    it("returns false for an undefined package name", () => {
      const checker = makeChecker();
      assert.strictEqual(checker.isPackageExempt(undefined), false);
    });
  });

  describe("isTooNewByFeed", () => {
    it("returns false when the feed does not mark the version as newly released", () => {
      const checker = makeChecker();
      assert.strictEqual(checker.isTooNewByFeed("lodash", "1.0.0"), false);
    });

    it("returns true when the feed marks the version as newly released", () => {
      const checker = makeChecker({
        newlyReleased: new Set(["lodash@1.0.0"]),
      });
      assert.strictEqual(checker.isTooNewByFeed("lodash", "1.0.0"), true);
    });

    it("returns false when the version is a safe patch, even if the feed marks it as new", () => {
      const checker = makeChecker({
        newlyReleased: new Set(["proxy-addr@2.0.8"]),
        safePatches: new Set(["proxy-addr@2.0.8"]),
      });
      assert.strictEqual(checker.isTooNewByFeed("proxy-addr", "2.0.8"), false);
    });

    it("does not consult the safe patches list when the feed says the version is not new", () => {
      let safePatchLookups = 0;
      const checker = createMinimumPackageAgeChecker({
        newPackagesDatabase: { isNewlyReleasedPackage: () => false },
        safePatchesDatabase: {
          isSafePatch: () => {
            safePatchLookups++;
            return true;
          },
        },
      });

      checker.isTooNewByFeed("lodash", "1.0.0");
      assert.strictEqual(safePatchLookups, 0);
    });
  });

  describe("isTooNewByReleaseDate", () => {
    it("returns false for a timestamp outside the age window", () => {
      const checker = makeChecker();
      assert.strictEqual(
        checker.isTooNewByReleaseDate("lodash", "1.0.0", hoursAgo(72)),
        false
      );
    });

    it("returns true for a timestamp inside the age window", () => {
      const checker = makeChecker();
      assert.strictEqual(
        checker.isTooNewByReleaseDate("lodash", "1.0.0", hoursAgo(1)),
        true
      );
    });

    it("returns false when the version is a safe patch, even if it is inside the age window", () => {
      const checker = makeChecker({
        safePatches: new Set(["proxy-addr@2.0.8"]),
      });
      assert.strictEqual(
        checker.isTooNewByReleaseDate("proxy-addr", "2.0.8", hoursAgo(1)),
        false
      );
    });

    it("does not consult the safe patches list for a timestamp outside the age window", () => {
      let safePatchLookups = 0;
      const checker = createMinimumPackageAgeChecker({
        newPackagesDatabase: { isNewlyReleasedPackage: () => false },
        safePatchesDatabase: {
          isSafePatch: () => {
            safePatchLookups++;
            return true;
          },
        },
      });

      checker.isTooNewByReleaseDate("lodash", "1.0.0", hoursAgo(72));
      assert.strictEqual(safePatchLookups, 0);
    });

    it("still filters when the package name is unknown, per the safe patches database's own contract", () => {
      // Guards against a metadata document whose name could not be parsed
      // (getPackageNameFromMetadataResponse returning undefined): an unnamed
      // package must never be treated as a safe patch. The real
      // safePatchesDatabaseBuilder enforces this (see its own
      // "returns false when name or version is undefined" spec); this test
      // pins that the checker relies on that contract rather than silently
      // exempting a falsy name itself.
      const checker = createMinimumPackageAgeChecker({
        newPackagesDatabase: { isNewlyReleasedPackage: () => false },
        safePatchesDatabase: {
          isSafePatch: (name, version) => !!name && !!version,
        },
      });
      assert.strictEqual(
        checker.isTooNewByReleaseDate(undefined, "1.0.0", hoursAgo(1)),
        true
      );
    });

    it("respects a custom minimumPackageAgeHours threshold", () => {
      minimumPackageAgeHours = 168; // 7 days
      try {
        const checker = makeChecker();
        assert.strictEqual(
          checker.isTooNewByReleaseDate("lodash", "1.0.0", hoursAgo(100)),
          true
        );
      } finally {
        minimumPackageAgeHours = 48;
      }
    });
  });

  describe("allowSafePatches", () => {
    // A safe patch entry only certifies the artifact Aikido inspected on the
    // known public registry. When a request is routed through a custom/private
    // registry, allowSafePatches must be false, and the safe patches database
    // must never be consulted - not even to confirm a match - so a private
    // registry can never inherit an exemption for an unrelated artifact that
    // merely shares the same name+version.

    it("still blocks a feed-flagged version claimed as a safe patch when allowSafePatches is false", () => {
      const checker = makeChecker({
        newlyReleased: new Set(["proxy-addr@2.0.8"]),
        safePatches: new Set(["proxy-addr@2.0.8"]),
        allowSafePatches: false,
      });
      assert.strictEqual(checker.isTooNewByFeed("proxy-addr", "2.0.8"), true);
    });

    it("still blocks a timestamp-flagged version claimed as a safe patch when allowSafePatches is false", () => {
      const checker = makeChecker({
        safePatches: new Set(["proxy-addr@2.0.8"]),
        allowSafePatches: false,
      });
      assert.strictEqual(
        checker.isTooNewByReleaseDate("proxy-addr", "2.0.8", hoursAgo(1)),
        true
      );
    });

    it("never calls into the safe patches database when allowSafePatches is false", () => {
      let safePatchLookups = 0;
      const checker = createMinimumPackageAgeChecker({
        newPackagesDatabase: { isNewlyReleasedPackage: () => true },
        safePatchesDatabase: {
          isSafePatch: () => {
            safePatchLookups++;
            return true;
          },
        },
        allowSafePatches: false,
      });

      checker.isTooNewByFeed("proxy-addr", "2.0.8");
      checker.isTooNewByReleaseDate("proxy-addr", "2.0.8", hoursAgo(1));

      assert.strictEqual(safePatchLookups, 0);
    });

    it("defaults to allowing safe patches when the option is omitted", () => {
      const checker = createMinimumPackageAgeChecker({
        newPackagesDatabase: { isNewlyReleasedPackage: () => true },
        safePatchesDatabase: {
          isSafePatch: (name, version) => `${name}@${version}` === "proxy-addr@2.0.8",
        },
      });

      assert.strictEqual(checker.isTooNewByFeed("proxy-addr", "2.0.8"), false);
    });
  });
});
