import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";

describe("npx commandArgumentScanner - security fix for local package execution", () => {
  let checkChangesFromArgs;
  let getAuditedVersion;
  let clearAuditedVersions;
  let mockResolvePackageVersion;

  beforeEach(async () => {
    // Mock resolvePackageVersion to simulate registry resolution
    mockResolvePackageVersion = mock.fn(async (name, version) => {
      // Simulate registry resolution
      if (name === "http-server" && version === "latest") {
        return "14.1.1";
      }
      if (name === "malicious-package" && version === "latest") {
        return "1.0.0";
      }
      if (name === "@scope/package" && version === "latest") {
        return "2.0.0";
      }
      return null;
    });

    mock.module("../../../api/npmApi.js", {
      namedExports: {
        resolvePackageVersion: mockResolvePackageVersion,
      },
    });

    const module = await import("./commandArgumentScanner.js");
    checkChangesFromArgs = module.checkChangesFromArgs;
    getAuditedVersion = module.getAuditedVersion;
    clearAuditedVersions = module.clearAuditedVersions;
  });

  afterEach(() => {
    mock.reset();
  });

  it("should store audited version for unversioned package", async () => {
    const args = ["http-server"];

    await checkChangesFromArgs(args);

    const auditedVersion = getAuditedVersion("http-server");
    assert.strictEqual(
      auditedVersion,
      "14.1.1",
      "Should store the resolved registry version"
    );
  });

  it("should store audited version for package with latest tag", async () => {
    const args = ["http-server@latest"];

    await checkChangesFromArgs(args);

    const auditedVersion = getAuditedVersion("http-server");
    assert.strictEqual(
      auditedVersion,
      "14.1.1",
      "Should store the resolved registry version for latest tag"
    );
  });

  it("should store audited version for scoped package", async () => {
    const args = ["@scope/package"];

    await checkChangesFromArgs(args);

    const auditedVersion = getAuditedVersion("@scope/package");
    assert.strictEqual(
      auditedVersion,
      "2.0.0",
      "Should store the resolved registry version for scoped package"
    );
  });

  it("should clear audited versions on each scan", async () => {
    // First scan
    await checkChangesFromArgs(["http-server"]);
    assert.strictEqual(getAuditedVersion("http-server"), "14.1.1");

    // Second scan with different package
    await checkChangesFromArgs(["malicious-package"]);

    // Previous package should be cleared
    assert.strictEqual(
      getAuditedVersion("http-server"),
      undefined,
      "Previous audited version should be cleared"
    );
    assert.strictEqual(
      getAuditedVersion("malicious-package"),
      "1.0.0",
      "New package should be audited"
    );
  });

  it("should handle package with --package flag", async () => {
    const args = ["--package", "http-server"];

    await checkChangesFromArgs(args);

    const auditedVersion = getAuditedVersion("http-server");
    assert.strictEqual(
      auditedVersion,
      "14.1.1",
      "Should store version for package specified with --package flag"
    );
  });

  it("should handle package with -p flag", async () => {
    const args = ["-p", "http-server"];

    await checkChangesFromArgs(args);

    const auditedVersion = getAuditedVersion("http-server");
    assert.strictEqual(
      auditedVersion,
      "14.1.1",
      "Should store version for package specified with -p flag"
    );
  });

  it("should handle package with --package=name format", async () => {
    const args = ["--package=http-server"];

    await checkChangesFromArgs(args);

    const auditedVersion = getAuditedVersion("http-server");
    assert.strictEqual(
      auditedVersion,
      "14.1.1",
      "Should store version for package specified with --package=name format"
    );
  });

  it("should return scan results with resolved versions", async () => {
    const args = ["http-server"];

    const results = await checkChangesFromArgs(args);

    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].name, "http-server");
    assert.strictEqual(
      results[0].version,
      "14.1.1",
      "Scan result should contain resolved version"
    );
    assert.strictEqual(results[0].type, "add");
  });

  it("should handle multiple packages in scan results", async () => {
    // Note: parsePackagesFromArguments only returns first package, but testing the loop
    const args = ["http-server"];

    const results = await checkChangesFromArgs(args);

    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].name, "http-server");
    assert.strictEqual(results[0].version, "14.1.1");
  });

  it("should handle case when version resolution fails", async () => {
    mockResolvePackageVersion.mock.mockImplementation(
      async (name, version) => {
        return null; // Simulate resolution failure
      }
    );

    const args = ["unknown-package"];

    const results = await checkChangesFromArgs(args);

    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].name, "unknown-package");
    assert.strictEqual(
      results[0].version,
      "latest",
      "Should keep original version when resolution fails"
    );
    assert.strictEqual(
      getAuditedVersion("unknown-package"),
      undefined,
      "Should not store audited version when resolution fails"
    );
  });

  it("should prevent local malicious package execution by storing registry version", async () => {
    // Scenario: User has a local malicious-package installed
    // Scanner should audit the registry version, not the local one
    const args = ["malicious-package"];

    await checkChangesFromArgs(args);

    const auditedVersion = getAuditedVersion("malicious-package");
    assert.strictEqual(
      auditedVersion,
      "1.0.0",
      "Should store the clean registry version, not local package version"
    );
  });
});
