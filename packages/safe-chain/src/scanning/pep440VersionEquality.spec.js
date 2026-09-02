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

    it("requires an exact match of any pre/post/dev/local suffix", () => {
      assert.equal(pep440VersionsEqual("1.0a1", "1.0.0a1"), true);
      assert.equal(pep440VersionsEqual("1.0a1", "1.0.0a2"), false);
      assert.equal(pep440VersionsEqual("1.0a1", "1.0.0"), false);
      // known limitation: spelling variants are not normalized
      assert.equal(pep440VersionsEqual("1.0a1", "1.0.alpha1"), false);
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
  });
});
