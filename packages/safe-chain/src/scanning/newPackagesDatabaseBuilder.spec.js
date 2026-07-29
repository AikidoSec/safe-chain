import { describe, it, mock } from "node:test";
import assert from "node:assert";

let minimumPackageAgeHours = 24;
let ecosystem = "js";

mock.module("../config/settings.js", {
  namedExports: {
    getMinimumPackageAgeHours: () => minimumPackageAgeHours,
    getEcoSystem: () => ecosystem,
    getMalwareListBaseUrl: () => "https://malware-list.aikido.dev",
    ECOSYSTEM_JS: "js",
    ECOSYSTEM_PY: "py",
  },
});

const { buildNewPackagesDatabase } = await import(
  "./newPackagesDatabaseBuilder.js"
);

function hoursAgo(hours) {
  return Math.floor((Date.now() - hours * 3600 * 1000) / 1000);
}

describe("buildNewPackagesDatabase", () => {
  it("returns an object with isNewlyReleasedPackage", () => {
    const db = buildNewPackagesDatabase([]);
    assert.strictEqual(typeof db.isNewlyReleasedPackage, "function");
  });

  describe("isNewlyReleasedPackage", () => {
    it("returns true for a package released within the age threshold", () => {
      const db = buildNewPackagesDatabase([
        { package_name: "foo", version: "1.0.0", released_on: hoursAgo(1) },
      ]);

      assert.strictEqual(db.isNewlyReleasedPackage("foo", "1.0.0"), true);
    });

    it("returns false for a package released outside the age threshold", () => {
      const db = buildNewPackagesDatabase([
        { package_name: "foo", version: "1.0.0", released_on: hoursAgo(48) },
      ]);

      assert.strictEqual(db.isNewlyReleasedPackage("foo", "1.0.0"), false);
    });

    it("returns false for a package not in the list", () => {
      const db = buildNewPackagesDatabase([]);

      assert.strictEqual(db.isNewlyReleasedPackage("not-there", "1.0.0"), false);
    });

    it("returns false when name or version is undefined", () => {
      const db = buildNewPackagesDatabase([
        { package_name: "foo", version: "1.0.0", released_on: hoursAgo(1) },
      ]);

      assert.strictEqual(db.isNewlyReleasedPackage(undefined, "1.0.0"), false);
      assert.strictEqual(db.isNewlyReleasedPackage("foo", undefined), false);
    });

    it("returns false for a known package but different version", () => {
      const db = buildNewPackagesDatabase([
        { package_name: "foo", version: "2.0.0", released_on: hoursAgo(1) },
      ]);

      assert.strictEqual(db.isNewlyReleasedPackage("foo", "1.0.0"), false);
    });

    it("filters by source when source metadata is present", () => {
      const db = buildNewPackagesDatabase([
        { source: "pypi", package_name: "foo", version: "1.0.0", released_on: hoursAgo(1) },
        { source: "npm", package_name: "bar", version: "1.0.0", released_on: hoursAgo(1) },
      ]);

      // ecosystem is "js" → feed source is "npm"
      assert.strictEqual(db.isNewlyReleasedPackage("foo", "1.0.0"), false);
      assert.strictEqual(db.isNewlyReleasedPackage("bar", "1.0.0"), true);
    });

    it("matches regardless of source case", () => {
      const db = buildNewPackagesDatabase([
        { source: "NPM", package_name: "foo", version: "1.0.0", released_on: hoursAgo(1) },
      ]);

      assert.strictEqual(db.isNewlyReleasedPackage("foo", "1.0.0"), true);
    });

    it("matches entries with no source field", () => {
      const db = buildNewPackagesDatabase([
        { package_name: "foo", version: "1.0.0", released_on: hoursAgo(1) },
      ]);

      assert.strictEqual(db.isNewlyReleasedPackage("foo", "1.0.0"), true);
    });

    it("respects a custom minimumPackageAgeHours threshold", () => {
      minimumPackageAgeHours = 168; // 7 days

      const db = buildNewPackagesDatabase([
        { package_name: "foo", version: "1.0.0", released_on: hoursAgo(100) },
      ]);

      assert.strictEqual(db.isNewlyReleasedPackage("foo", "1.0.0"), true);

      minimumPackageAgeHours = 24; // reset
    });

    it("matches underscore request names against hyphen feed names for python", () => {
      ecosystem = "py";

      const db = buildNewPackagesDatabase([
        { source: "pypi", package_name: "foo-bar", version: "1.0.0", released_on: hoursAgo(1) },
      ]);

      assert.strictEqual(db.isNewlyReleasedPackage("foo_bar", "1.0.0"), true);

      ecosystem = "js";
    });

    it("matches hyphen request names against underscore feed names for python", () => {
      ecosystem = "py";

      const db = buildNewPackagesDatabase([
        { source: "pypi", package_name: "foo_bar", version: "1.0.0", released_on: hoursAgo(1) },
      ]);

      assert.strictEqual(db.isNewlyReleasedPackage("foo-bar", "1.0.0"), true);

      ecosystem = "js";
    });

    it("matches dot request names against hyphen feed names for python", () => {
      ecosystem = "py";

      const db = buildNewPackagesDatabase([
        { source: "pypi", package_name: "foo-bar", version: "1.0.0", released_on: hoursAgo(1) },
      ]);

      assert.strictEqual(db.isNewlyReleasedPackage("foo.bar", "1.0.0"), true);

      ecosystem = "js";
    });

    it("matches underscore request names against dot feed names for python", () => {
      ecosystem = "py";

      const db = buildNewPackagesDatabase([
        { source: "pypi", package_name: "foo.bar", version: "1.0.0", released_on: hoursAgo(1) },
      ]);

      assert.strictEqual(db.isNewlyReleasedPackage("foo_bar", "1.0.0"), true);

      ecosystem = "js";
    });
  });

  describe("scan cost", () => {
    function makeCountingFeed(size, counter) {
      return Array.from({ length: size }, (_, i) => {
        const packageName = `filler-package-${i}`;
        return {
          version: "9.9.9",
          released_on: hoursAgo(1000),
          get package_name() {
            counter.reads++;
            return packageName;
          },
        };
      });
    }

    it("reads the feed once, not once per lookup", () => {
      const feedSize = 50;
      const lookups = 10;
      const counter = { reads: 0 };
      const db = buildNewPackagesDatabase(makeCountingFeed(feedSize, counter));

      for (let i = 0; i < lookups; i++) {
        db.isNewlyReleasedPackage("example", "1.82.1");
      }

      assert.ok(
        counter.reads <= feedSize + lookups,
        `read feed entries ${counter.reads} times for ${lookups} lookups ` +
          `against a ${feedSize}-entry feed; expected at most ${feedSize + lookups}`,
      );
    });

    it("lookup cost does not grow with feed size", () => {
      const lookups = 10;
      const readsDuringLookups = (feedSize) => {
        const counter = { reads: 0 };
        const db = buildNewPackagesDatabase(
          makeCountingFeed(feedSize, counter),
        );
        const afterBuild = counter.reads;
        for (let i = 0; i < lookups; i++) {
          db.isNewlyReleasedPackage("example", `1.${i}.0`);
        }
        return counter.reads - afterBuild;
      };

      const small = readsDuringLookups(20);
      const large = readsDuringLookups(80);

      assert.ok(
        large <= small + lookups * 2,
        `lookups read the feed ${small} times at 20 entries and ${large} at 80; ` +
          `per-lookup cost scales with feed size`,
      );
    });
  });
});
