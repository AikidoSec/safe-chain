import { describe, it } from "node:test";
import assert from "node:assert";
import { canonicalizeHost, canonicalizeRegistry } from "./canonicalizeHost.js";
import { parseNpmPackageUrl } from "./parseNpmPackageUrl.js";

describe("canonicalizeHost", () => {
  it("lowercases and strips trailing dots", () => {
    assert.equal(canonicalizeHost("Registry.NpmJS.org."), "registry.npmjs.org");
    assert.equal(canonicalizeHost("registry.npmjs.org.."), "registry.npmjs.org");
    assert.equal(canonicalizeHost("registry.npmjs.org"), "registry.npmjs.org");
    assert.equal(canonicalizeHost(""), "");
  });

  it("canonicalizes only the host part of a registry with a path", () => {
    assert.equal(
      canonicalizeRegistry("My.Registry.com./npm"),
      "my.registry.com/npm"
    );
    assert.equal(canonicalizeRegistry("registry.npmjs.org."), "registry.npmjs.org");
  });
});

describe("parseNpmPackageUrl trailing-dot / mixed-case hosts", () => {
  const registry = "registry.npmjs.org";

  it("parses trailing-dot host", () => {
    assert.deepEqual(
      parseNpmPackageUrl(
        "https://registry.npmjs.org./lodash/-/lodash-4.17.21.tgz",
        registry
      ),
      { packageName: "lodash", version: "4.17.21" }
    );
  });

  it("parses uppercase host", () => {
    assert.deepEqual(
      parseNpmPackageUrl(
        "https://REGISTRY.NPMJS.ORG/lodash/-/lodash-4.17.21.tgz",
        registry
      ),
      { packageName: "lodash", version: "4.17.21" }
    );
  });

  it("parses scoped package on trailing-dot host", () => {
    assert.deepEqual(
      parseNpmPackageUrl(
        "https://registry.npmjs.org./%40babel/core/-/core-7.21.4.tgz",
        registry
      ),
      { packageName: "@babel/core", version: "7.21.4" }
    );
  });

  it("still rejects unrelated hosts", () => {
    assert.deepEqual(
      parseNpmPackageUrl(
        "https://evil.example.com/lodash/-/lodash-4.17.21.tgz",
        registry
      ),
      { packageName: undefined, version: undefined }
    );
  });
});
