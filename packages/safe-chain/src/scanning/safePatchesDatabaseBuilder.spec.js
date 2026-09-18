import { describe, it, mock } from "node:test";
import assert from "node:assert";

let ecosystem = "js";

mock.module("../config/settings.js", {
  namedExports: {
    getEcoSystem: () => ecosystem,
    getMalwareListBaseUrl: () => "https://malware-list.aikido.dev",
    ECOSYSTEM_JS: "js",
    ECOSYSTEM_PY: "py",
  },
});

const { buildSafePatchesDatabase } = await import(
  "./safePatchesDatabaseBuilder.js"
);

describe("buildSafePatchesDatabase", () => {
  it("returns an object with isSafePatch", () => {
    const db = buildSafePatchesDatabase([]);
    assert.strictEqual(typeof db.isSafePatch, "function");
  });

  describe("isSafePatch", () => {
    it("returns true for an exact name+version match", () => {
      const db = buildSafePatchesDatabase([
        { package_name: "proxy-addr", version: "2.0.8", ecosystem: "npm" },
      ]);

      assert.strictEqual(db.isSafePatch("proxy-addr", "2.0.8"), true);
    });

    it("returns false for a different version of a safe-patched package", () => {
      const db = buildSafePatchesDatabase([
        { package_name: "proxy-addr", version: "2.0.8", ecosystem: "npm" },
      ]);

      assert.strictEqual(db.isSafePatch("proxy-addr", "2.0.9"), false);
    });

    it("returns false for a package not in the list", () => {
      const db = buildSafePatchesDatabase([]);

      assert.strictEqual(db.isSafePatch("not-there", "1.0.0"), false);
    });

    it("returns false when name or version is undefined", () => {
      const db = buildSafePatchesDatabase([
        { package_name: "proxy-addr", version: "2.0.8", ecosystem: "npm" },
      ]);

      assert.strictEqual(db.isSafePatch(undefined, "2.0.8"), false);
      assert.strictEqual(db.isSafePatch("proxy-addr", undefined), false);
    });

    it("does not exempt version ranges, only the exact listed version", () => {
      const db = buildSafePatchesDatabase([
        { package_name: "proxy-addr", version: "2.0.8", ecosystem: "npm" },
      ]);

      assert.strictEqual(db.isSafePatch("proxy-addr", "2.0.7"), false);
      assert.strictEqual(db.isSafePatch("proxy-addr", "2.1.0"), false);
    });

    it("supports scoped npm package names", () => {
      const db = buildSafePatchesDatabase([
        {
          package_name: "@fastify/proxy-addr",
          version: "5.1.1",
          ecosystem: "npm",
        },
      ]);

      assert.strictEqual(
        db.isSafePatch("@fastify/proxy-addr", "5.1.1"),
        true
      );
    });

    it("filters by ecosystem when the field is present", () => {
      const db = buildSafePatchesDatabase([
        { package_name: "foo", version: "1.0.0", ecosystem: "pypi" },
        { package_name: "bar", version: "1.0.0", ecosystem: "npm" },
      ]);

      // ecosystem is "js" -> feed ecosystem is "npm"
      assert.strictEqual(db.isSafePatch("foo", "1.0.0"), false);
      assert.strictEqual(db.isSafePatch("bar", "1.0.0"), true);
    });

    it("matches regardless of ecosystem case", () => {
      const db = buildSafePatchesDatabase([
        { package_name: "foo", version: "1.0.0", ecosystem: "NPM" },
      ]);

      assert.strictEqual(db.isSafePatch("foo", "1.0.0"), true);
    });

    it("matches entries with no ecosystem field", () => {
      const db = buildSafePatchesDatabase([
        { package_name: "foo", version: "1.0.0" },
      ]);

      assert.strictEqual(db.isSafePatch("foo", "1.0.0"), true);
    });

    it("does not exempt a same-named package in a different ecosystem", () => {
      ecosystem = "py";

      try {
        const db = buildSafePatchesDatabase([
          { package_name: "requests", version: "2.31.0", ecosystem: "npm" },
        ]);

        assert.strictEqual(db.isSafePatch("requests", "2.31.0"), false);
      } finally {
        ecosystem = "js";
      }
    });

    it("skips malformed entries and keeps checking valid ones", () => {
      const db = buildSafePatchesDatabase([
        { version: "1.0.0", ecosystem: "npm" },
        { package_name: 42, version: "1.0.0", ecosystem: "npm" },
        { package_name: "ok-pkg", version: 7, ecosystem: "npm" },
        null,
        { package_name: "good-pkg", version: "2.0.0", ecosystem: "npm" },
      ]);

      assert.strictEqual(db.isSafePatch("good-pkg", "2.0.0"), true);
      assert.strictEqual(db.isSafePatch("ok-pkg", "7"), false);
    });

    it("does not throw when the feed is entirely malformed", () => {
      const db = buildSafePatchesDatabase([
        null,
        undefined,
        {},
        { package_name: null },
      ]);
      assert.strictEqual(db.isSafePatch("anything", "1.0.0"), false);
    });

    it("keeps npm name matching case-sensitive", () => {
      const db = buildSafePatchesDatabase([
        { package_name: "Base64", version: "1.0.0", ecosystem: "npm" },
      ]);

      assert.strictEqual(db.isSafePatch("Base64", "1.0.0"), true);
      assert.strictEqual(db.isSafePatch("base64", "1.0.0"), false);
    });

    it("normalises PyPI package names per PEP 503", () => {
      ecosystem = "py";

      try {
        const db = buildSafePatchesDatabase([
          {
            package_name: "Flask-First",
            version: "0.90.0",
            ecosystem: "pypi",
          },
        ]);

        assert.strictEqual(db.isSafePatch("flask-first", "0.90.0"), true);
        assert.strictEqual(db.isSafePatch("flask_first", "0.90.0"), true);
        assert.strictEqual(db.isSafePatch("FLASK.FIRST", "0.90.0"), true);
      } finally {
        ecosystem = "js";
      }
    });

    it("matches PyPI versions per PEP 440 equivalence", () => {
      ecosystem = "py";

      try {
        const db = buildSafePatchesDatabase([
          { package_name: "bar", version: "1.0", ecosystem: "pypi" },
        ]);

        assert.strictEqual(db.isSafePatch("bar", "1.0.0"), true);
        assert.strictEqual(db.isSafePatch("bar", "1.0"), true);
      } finally {
        ecosystem = "js";
      }
    });

    it("does not match PEP440-equivalent versions for npm", () => {
      const db = buildSafePatchesDatabase([
        { package_name: "foo", version: "1.0.0", ecosystem: "npm" },
      ]);

      assert.strictEqual(db.isSafePatch("foo", "1.0.0"), true);
      assert.strictEqual(db.isSafePatch("foo", "1.0"), false);
    });
  });

  describe("scan cost", () => {
    function makeCountingFeed(size, counter) {
      return Array.from({ length: size }, (_, i) => {
        const packageName = `filler-package-${i}`;
        return {
          version: "9.9.9",
          ecosystem: "npm",
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
      const db = buildSafePatchesDatabase(makeCountingFeed(feedSize, counter));

      for (let i = 0; i < lookups; i++) {
        db.isSafePatch("example", "1.82.1");
      }

      assert.ok(
        counter.reads <= feedSize + lookups,
        `read feed entries ${counter.reads} times for ${lookups} lookups ` +
          `against a ${feedSize}-entry feed; expected at most ${feedSize + lookups}`
      );
    });

    it("lookup cost does not grow with feed size", () => {
      const lookups = 10;
      const readsDuringLookups = (feedSize) => {
        const counter = { reads: 0 };
        const db = buildSafePatchesDatabase(
          makeCountingFeed(feedSize, counter)
        );
        const afterBuild = counter.reads;
        for (let i = 0; i < lookups; i++) {
          db.isSafePatch("example", `1.${i}.0`);
        }
        return counter.reads - afterBuild;
      };

      const small = readsDuringLookups(20);
      const large = readsDuringLookups(80);

      assert.ok(
        large <= small + lookups * 2,
        `lookups read the feed ${small} times at 20 entries and ${large} at 80; ` +
          `per-lookup cost scales with feed size`
      );
    });
  });
});
