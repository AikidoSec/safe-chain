import { describe, it } from "node:test";
import assert from "node:assert";
import { parseNpmPackageUrl } from "./parseNpmPackageUrl.js";

const registry = "registry.npmjs.org";

describe("parseNpmPackageUrl url-encoding handling", () => {
  it("parses a normal .tgz url", () => {
    const url =
      "https://registry.npmjs.org/safe-chain-test/-/safe-chain-test-0.0.1-security.tgz";
    assert.deepEqual(parseNpmPackageUrl(url, registry), {
      packageName: "safe-chain-test",
      version: "0.0.1-security",
    });
  });

  it("parses a url with percent-encoded extension (%2e for .)", () => {
    const url =
      "https://registry.npmjs.org/safe-chain-test/-/safe-chain-test-0.0.1-security%2etgz";
    assert.deepEqual(parseNpmPackageUrl(url, registry), {
      packageName: "safe-chain-test",
      version: "0.0.1-security",
    });
  });

  it("parses a url with percent-encoded package name and extension", () => {
    const url =
      "https://registry.npmjs.org/lodash/-/lodash-4%2e17%2e21%2etgz";
    assert.deepEqual(parseNpmPackageUrl(url, registry), {
      packageName: "lodash",
      version: "4.17.21",
    });
  });

  it("still parses scoped packages with %2f separator", () => {
    const url =
      "https://registry.yarnpkg.com/@music-i18n%2fverovio/-/verovio-1.4.1.tgz";
    assert.deepEqual(
      parseNpmPackageUrl(url, "registry.yarnpkg.com"),
      { packageName: "@music-i18n/verovio", version: "1.4.1" }
    );
  });

  it("tolerates malformed percent-encoding", () => {
    const url = "https://registry.npmjs.org/foo/-/foo-1.0.0%tgz";
    // Malformed encoding should not throw; url simply won't match .tgz
    const result = parseNpmPackageUrl(url, registry);
    assert.equal(result.packageName, undefined);
  });
});
