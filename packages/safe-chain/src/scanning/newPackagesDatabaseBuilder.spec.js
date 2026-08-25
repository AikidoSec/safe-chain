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

    // The PyPI feed carries display names ("ImkGreet"), but pip only ever asks
    // for the PEP 503 normalised form ("imkgreet"), so a capitalised feed entry
    // must still match the lowercase request.
    it("matches lowercase request names against capitalised feed names for python", () => {
      ecosystem = "py";

      try {
        const db = buildNewPackagesDatabase([
          { source: "pypi", package_name: "ImkGreet", version: "1.0.1", released_on: hoursAgo(1) },
        ]);

        assert.strictEqual(db.isNewlyReleasedPackage("imkgreet", "1.0.1"), true);
        assert.strictEqual(db.isNewlyReleasedPackage("ImkGreet", "1.0.1"), true);
      } finally {
        ecosystem = "js";
      }
    });

    it("matches capitalised feed names with separator differences for python", () => {
      ecosystem = "py";

      try {
        const db = buildNewPackagesDatabase([
          { source: "pypi", package_name: "Flask-First", version: "0.90.0", released_on: hoursAgo(1) },
        ]);

        assert.strictEqual(db.isNewlyReleasedPackage("flask-first", "0.90.0"), true);
        assert.strictEqual(db.isNewlyReleasedPackage("flask_first", "0.90.0"), true);
        assert.strictEqual(db.isNewlyReleasedPackage("FLASK.FIRST", "0.90.0"), true);
      } finally {
        ecosystem = "js";
      }
    });

    // getEquivalentPackageNames replaced every separator with ONE separator
    // uniformly, so it could never produce a mixed-separator name like
    // `aws-cdk.aws-bedrock-alpha`. PEP 503 normalization handles these; the
    // variant approach could not, regardless of casing.
    it("matches python names that mix separators", () => {
      ecosystem = "py";

      try {
        const db = buildNewPackagesDatabase([
          {
            source: "pypi",
            package_name: "aws-cdk.aws-bedrock-alpha",
            version: "2.0.0",
            released_on: hoursAgo(1),
          },
        ]);

        // what pip actually puts on the wire
        assert.strictEqual(
          db.isNewlyReleasedPackage("aws-cdk-aws-bedrock-alpha", "2.0.0"),
          true
        );
        assert.strictEqual(
          db.isNewlyReleasedPackage("aws_cdk.aws_bedrock_alpha", "2.0.0"),
          true
        );
      } finally {
        ecosystem = "js";
      }
    });

    // A malformed record must not abort construction. buildNewPackagesDatabase
    // runs inside openNewPackagesDatabase's `.then`, so a throw is swallowed
    // into an always-false database, disabling the check for every package.
    it("skips malformed python entries and keeps checking valid ones", () => {
      ecosystem = "py";

      try {
        const db = buildNewPackagesDatabase([
          { source: "pypi", version: "1.0.0", released_on: hoursAgo(1) },
          { source: "pypi", package_name: 42, version: "1.0.0", released_on: hoursAgo(1) },
          { source: "pypi", package_name: "ok-pkg", version: 7, released_on: hoursAgo(1) },
          null,
          { source: "pypi", package_name: "Good-Pkg", version: "2.0.0", released_on: hoursAgo(1) },
        ]);

        assert.strictEqual(db.isNewlyReleasedPackage("good-pkg", "2.0.0"), true);
        assert.strictEqual(db.isNewlyReleasedPackage("ok-pkg", "7"), false);
      } finally {
        ecosystem = "js";
      }
    });

    it("does not throw when the python feed is entirely malformed", () => {
      ecosystem = "py";

      try {
        const db = buildNewPackagesDatabase([null, undefined, {}, { package_name: null }]);
        assert.strictEqual(db.isNewlyReleasedPackage("anything", "1.0.0"), false);
      } finally {
        ecosystem = "js";
      }
    });

    it("keeps npm name matching case-sensitive", () => {
      ecosystem = "js";

      const db = buildNewPackagesDatabase([
        { source: "npm", package_name: "Base64", version: "1.0.0", released_on: hoursAgo(1) },
      ]);

      assert.strictEqual(db.isNewlyReleasedPackage("Base64", "1.0.0"), true);
      assert.strictEqual(db.isNewlyReleasedPackage("base64", "1.0.0"), false);
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
