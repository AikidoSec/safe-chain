import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pep440VersionsEqual } from "./pep440VersionEquality.js";

describe("pep440VersionEquality", () => {
  describe("pep440VersionsEqual", () => {
    it("treats trailing zero release segments as equal", () => {
      assert.equal(pep440VersionsEqual("1.0", "1.0.0"), true);
      assert.equal(pep440VersionsEqual("1.0.0", "1.0"), true);
      assert.equal(pep440VersionsEqual("1.0", "1.0.0.0"), true);
      assert.equal(pep440VersionsEqual("1", "1.0.0"), true);
    });

    it("treats identical versions as equal", () => {
      assert.equal(pep440VersionsEqual("1.2.3", "1.2.3"), true);
    });

    it("does not match different release versions", () => {
      assert.equal(pep440VersionsEqual("1.0", "2.0"), false);
      assert.equal(pep440VersionsEqual("1.0", "1.0.1"), false);
      assert.equal(pep440VersionsEqual("1.2", "1.20"), false);
    });

    it("requires matching epoch", () => {
      assert.equal(pep440VersionsEqual("1!1.0", "1.0"), false);
      assert.equal(pep440VersionsEqual("1!1.0", "1!1.0.0"), true);
    });

    it("requires matching pre/post/dev/local segments", () => {
      assert.equal(pep440VersionsEqual("1.0a1", "1.0.0a1"), true);
      assert.equal(pep440VersionsEqual("1.0a1", "1.0.0a2"), false);
      assert.equal(pep440VersionsEqual("1.0a1", "1.0.0"), false);
    });

    it("normalizes pre-release spelling aliases and separators", () => {
      assert.equal(pep440VersionsEqual("1.0a1", "1.0alpha1"), true);
      assert.equal(pep440VersionsEqual("1.0a1", "1.0-a1"), true);
      assert.equal(pep440VersionsEqual("1.0b1", "1.0beta1"), true);
      assert.equal(pep440VersionsEqual("1.0c1", "1.0rc1"), true);
      assert.equal(pep440VersionsEqual("1.0rc1", "1.0.pre1"), true);
      assert.equal(pep440VersionsEqual("1.0rc1", "1.0preview1"), true);
      assert.equal(pep440VersionsEqual("1.0-rc1", "1.0rc1"), true);
      // a missing pre-release number implies 0
      assert.equal(pep440VersionsEqual("1.0a", "1.0a0"), true);
      // different letters/numbers are still distinct
      assert.equal(pep440VersionsEqual("1.0a1", "1.0b1"), false);
    });

    it("normalizes implicit/explicit post-release spelling", () => {
      assert.equal(pep440VersionsEqual("1.0-1", "1.0.post1"), true);
      assert.equal(pep440VersionsEqual("1.0.post1", "1.0-r1"), true);
      assert.equal(pep440VersionsEqual("1.0.post1", "1.0.rev1"), true);
      // a missing post-release number implies 0
      assert.equal(pep440VersionsEqual("1.0.post", "1.0.post0"), true);
      assert.equal(pep440VersionsEqual("1.0-1", "1.0-2"), false);
    });

    it("normalizes dev-release spelling and defaults", () => {
      assert.equal(pep440VersionsEqual("1.0.dev", "1.0.dev0"), true);
      assert.equal(pep440VersionsEqual("1.0dev1", "1.0.dev1"), true);
      assert.equal(pep440VersionsEqual("1.0.dev1", "1.0.dev2"), false);
    });

    it("normalizes local version segments (numeric segments ignore leading zeros)", () => {
      assert.equal(pep440VersionsEqual("1.0+abc.01", "1.0+abc.1"), true);
      assert.equal(pep440VersionsEqual("1.0+ABC", "1.0+abc"), true);
      assert.equal(pep440VersionsEqual("1.0+abc-1", "1.0+abc.1"), true);
      assert.equal(pep440VersionsEqual("1.0+abc.1", "1.0+abc.2"), false);
      assert.equal(pep440VersionsEqual("1.0+abc", "1.0"), false);
    });

    it("is case-insensitive on the suffix and the leading 'v'", () => {
      assert.equal(pep440VersionsEqual("v1.0", "1.0.0"), true);
      assert.equal(pep440VersionsEqual("1.0RC1", "1.0.0rc1"), true);
    });

    it("falls back to strict string equality for unparseable input", () => {
      assert.equal(pep440VersionsEqual("", ""), true);
      assert.equal(pep440VersionsEqual("", "1.0"), false);
      assert.equal(pep440VersionsEqual("not-a-version", "not-a-version"), true);
      assert.equal(pep440VersionsEqual("not-a-version", "also-not"), false);
    });

    it("matches the wildcard-adjacent malware DB scenario from the bug report", () => {
      // malware DB stores "1.0", user installs "1.0.0"
      assert.equal(pep440VersionsEqual("1.0", "1.0.0"), true);
    });

    it("does not lose precision on release segments beyond Number.MAX_SAFE_INTEGER", () => {
      assert.equal(
        pep440VersionsEqual("1.9007199254740992", "1.9007199254740993"),
        false
      );
      assert.equal(
        pep440VersionsEqual("1.9007199254740992", "1.9007199254740992"),
        true
      );
    });

    it("does not lose precision on very large epoch values", () => {
      assert.equal(
        pep440VersionsEqual("9007199254740992!1.0", "9007199254740993!1.0"),
        false
      );
    });

    it("treats leading zero epoch/release segments as numerically equal", () => {
      assert.equal(pep440VersionsEqual("01!1.0", "1!1.0"), true);
      assert.equal(pep440VersionsEqual("1.01", "1.1"), true);
    });

    it("treats leading zero pre/post/dev numbers as numerically equal", () => {
      assert.equal(pep440VersionsEqual("1.0a05", "1.0a5"), true);
      assert.equal(pep440VersionsEqual("1.0.post007", "1.0.post7"), true);
      assert.equal(pep440VersionsEqual("1.1.dev09000", "1.1.dev9000"), true);
    });

    it("treats explicit zero epoch as equal to implicit epoch", () => {
      assert.equal(pep440VersionsEqual("0!1.0", "1.0"), true);
    });

    it("normalizes local version segments separated by underscores", () => {
      assert.equal(pep440VersionsEqual("1.0+abc_1", "1.0+abc.1"), true);
    });

    it("falls back to string equality for malformed local versions", () => {
      assert.equal(pep440VersionsEqual("1.0+a+", "1.0+a+"), true);
      assert.equal(pep440VersionsEqual("1.0++", "1.0++"), true);
      assert.equal(pep440VersionsEqual("1.0+_foobar", "1.0+_foobar"), true);
      assert.equal(pep440VersionsEqual("1.0+foo&asd", "1.0+foo&asd"), true);
      assert.equal(pep440VersionsEqual("1.0+1+1", "1.0+1+1"), true);
      assert.equal(pep440VersionsEqual("1.0+a+", "1.0"), false);
    });

    it("falls back to string equality for a double epoch marker", () => {
      assert.equal(pep440VersionsEqual("1!2!1.0", "1!2!1.0"), true);
      assert.equal(pep440VersionsEqual("1!2!1.0", "2!1.0"), false);
    });

    it("normalizes every segment type at once in a single comparison", () => {
      assert.equal(
        pep440VersionsEqual(
          "1.0a1.post2.dev3+local.4",
          "1.0-alpha1-post2.dev3+LOCAL.04"
        ),
        true
      );
    });

    it("does not conflate a dev-only release with an implicit post-release", () => {
      assert.equal(pep440VersionsEqual("1.0.dev", "1.0-1"), false);
    });

    it("trims surrounding whitespace including tabs and newlines", () => {
      assert.equal(pep440VersionsEqual("  \tv1.0\n", "1.0"), true);
    });
  });
});
