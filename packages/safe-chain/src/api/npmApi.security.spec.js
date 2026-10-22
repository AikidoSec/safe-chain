import { describe, it, mock } from "node:test";
import assert from "node:assert";

/**
 * Security-focused integration tests for version canonicalization
 * 
 * These tests verify that the fix for the "Noncanonical npm version spelling 
 * bypasses malware-version lookup" vulnerability is effective.
 * 
 * The vulnerability: resolvePackageVersion used semver.valid() for validation
 * but returned the original non-canonical version string (e.g., "v1.2.3").
 * The malware database uses strict string equality, so "v1.2.3" !== "1.2.3",
 * allowing malware to bypass detection.
 * 
 * The fix: resolvePackageVersion now returns the canonical version from
 * semver.valid(), ensuring consistent comparison in the malware database.
 */
describe("npmApi security - version canonicalization", async () => {
  const mockNpmFetchJson = mock.fn();

  mock.module("npm-registry-fetch", {
    namedExports: {
      json: mockNpmFetchJson,
    },
  });

  const { resolvePackageVersion } = await import("./npmApi.js");

  describe("canonical version output for malware database compatibility", () => {
    it("returns canonical version for 'v' prefix to prevent malware bypass", async () => {
      // Security property: malware database has "1.2.3", must match "v1.2.3" input
      const result = await resolvePackageVersion("malicious-pkg", "v1.2.3");
      
      // The fix ensures we get canonical "1.2.3" not "v1.2.3"
      assert.strictEqual(result, "1.2.3");
      
      // This canonical version will now match malware database entries
      // that use the canonical form "1.2.3"
    });

    it("preserves canonical version when already canonical", async () => {
      const result = await resolvePackageVersion("safe-pkg", "1.2.3");
      
      // Already canonical, should remain unchanged
      assert.strictEqual(result, "1.2.3");
    });

    it("handles prerelease versions canonically", async () => {
      const result = await resolvePackageVersion("test-pkg", "v1.2.3-alpha.1");
      
      // Removes 'v' prefix but preserves prerelease tag
      assert.strictEqual(result, "1.2.3-alpha.1");
    });

    it("handles build metadata canonically (strips per semver spec)", async () => {
      // Note: semver.valid() strips build metadata as it's not part of version precedence
      const result = await resolvePackageVersion("test-pkg", "v1.2.3+build.456");
      
      // Removes 'v' prefix and strips build metadata
      assert.strictEqual(result, "1.2.3");
    });

    it("handles complex prerelease with build metadata", async () => {
      // Note: semver.valid() strips build metadata
      const result = await resolvePackageVersion("test-pkg", "v2.0.0-rc.1+20130313144700");
      
      assert.strictEqual(result, "2.0.0-rc.1");
    });
  });

  describe("security regression tests - exploit scenarios", () => {
    it("prevents bypass via 'v' prefix (CVE scenario)", async () => {
      // Scenario: Attacker publishes malicious-pkg@v1.2.3
      // Database has entry for malicious-pkg@1.2.3
      // Without fix: "v1.2.3" !== "1.2.3" (bypass)
      // With fix: resolvePackageVersion returns "1.2.3" (detected)
      
      const attackerVersion = "v1.2.3";
      const resolvedVersion = await resolvePackageVersion("malicious-pkg", attackerVersion);
      
      // Security assertion: resolved version must be canonical
      assert.strictEqual(resolvedVersion, "1.2.3");
      assert.notStrictEqual(resolvedVersion, attackerVersion);
    });

    it("ensures v-prefixed versions resolve to canonical form", async () => {
      // Security property: v-prefixed versions should resolve to the same canonical version
      // so malware database lookup succeeds regardless of input format
      const variants = ["1.2.3", "v1.2.3"];
      const results = await Promise.all(
        variants.map(v => resolvePackageVersion("test-pkg", v))
      );
      
      // All variants must resolve to the same canonical form
      const canonical = "1.2.3";
      results.forEach(result => {
        assert.strictEqual(result, canonical);
      });
      
      // Verify they're all identical (critical for malware detection)
      const uniqueResults = [...new Set(results)];
      assert.strictEqual(uniqueResults.length, 1);
      assert.strictEqual(uniqueResults[0], canonical);
    });
  });

  describe("non-fixed version ranges remain unaffected", () => {
    it("still resolves version ranges via registry", async () => {
      mockNpmFetchJson.mock.mockImplementationOnce(() => ({
        "dist-tags": { latest: "4.18.2" },
        versions: {
          "4.17.0": {},
          "4.17.1": {},
          "4.18.0": {},
          "4.18.2": {},
        },
      }));

      const result = await resolvePackageVersion("express", "^4.17.0");
      
      // Range resolution still works
      assert.strictEqual(result, "4.18.2");
    });

    it("still resolves dist-tags via registry", async () => {
      mockNpmFetchJson.mock.mockImplementationOnce(() => ({
        "dist-tags": { latest: "5.0.0" },
        versions: { "5.0.0": {} },
      }));

      const result = await resolvePackageVersion("express", "latest");
      
      assert.strictEqual(result, "5.0.0");
    });
  });

  describe("edge cases and boundary conditions", () => {
    it("handles null version input", async () => {
      mockNpmFetchJson.mock.mockImplementationOnce(() => ({
        "dist-tags": { latest: "1.0.0" },
        versions: { "1.0.0": {} },
      }));

      const result = await resolvePackageVersion("test-pkg", null);
      
      // Should default to "latest"
      assert.strictEqual(result, "1.0.0");
    });

    it("handles undefined version input", async () => {
      mockNpmFetchJson.mock.mockImplementationOnce(() => ({
        "dist-tags": { latest: "1.0.0" },
        versions: { "1.0.0": {} },
      }));

      const result = await resolvePackageVersion("test-pkg");
      
      // Should default to "latest"
      assert.strictEqual(result, "1.0.0");
    });

    it("returns null for invalid version strings", async () => {
      mockNpmFetchJson.mock.mockImplementationOnce(() => ({
        "dist-tags": {},
        versions: {},
      }));

      const result = await resolvePackageVersion("test-pkg", "not-a-version");
      
      // Invalid version should return null
      assert.strictEqual(result, null);
    });

    it("handles scoped packages with non-canonical versions", async () => {
      const result = await resolvePackageVersion("@scope/pkg", "v1.2.3");
      
      // Scoped packages should also get canonical versions
      assert.strictEqual(result, "1.2.3");
    });
  });
});
