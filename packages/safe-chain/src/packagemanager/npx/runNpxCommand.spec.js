import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";

describe("runNpxCommand - security fix for --no-install and version pinning", () => {
  let runNpx;
  let capturedArgs;
  let mockGetAuditedVersion;

  beforeEach(async () => {
    capturedArgs = null;

    // Mock safeSpawn to capture the arguments passed to npx
    mock.module("../../utils/safeSpawn.js", {
      namedExports: {
        safeSpawn: async (command, args, options) => {
          capturedArgs = args;
          return { status: 0 };
        },
      },
    });

    // Mock mergeSafeChainProxyEnvironmentVariables
    mock.module("../../registryProxy/registryProxy.js", {
      namedExports: {
        mergeSafeChainProxyEnvironmentVariables: (env) => env,
      },
    });

    // Mock getAuditedVersion to return test versions
    mockGetAuditedVersion = mock.fn((packageName) => {
      if (packageName === "http-server") {
        return "14.1.1";
      }
      if (packageName === "malicious-package") {
        return "1.0.0";
      }
      if (packageName === "@scope/package") {
        return "2.0.0";
      }
      return undefined;
    });

    mock.module("./dependencyScanner/commandArgumentScanner.js", {
      namedExports: {
        getAuditedVersion: mockGetAuditedVersion,
      },
    });

    const module = await import("./runNpxCommand.js");
    runNpx = module.runNpx;
  });

  afterEach(() => {
    mock.reset();
  });

  describe("Version pinning", () => {
    it("should pin unversioned package to audited version", async () => {
      await runNpx(["http-server"]);

      assert.deepStrictEqual(
        capturedArgs,
        ["http-server@14.1.1"],
        "Should pin package to audited version"
      );
    });

    it("should pin package with latest tag to audited version", async () => {
      await runNpx(["http-server@latest"]);

      assert.deepStrictEqual(
        capturedArgs,
        ["http-server@14.1.1"],
        "Should replace latest tag with audited version"
      );
    });

    it("should pin scoped package to audited version", async () => {
      await runNpx(["@scope/package"]);

      assert.deepStrictEqual(
        capturedArgs,
        ["@scope/package@2.0.0"],
        "Should pin scoped package to audited version"
      );
    });

    it("should pin package specified with -p flag", async () => {
      await runNpx(["-p", "http-server"]);

      assert.deepStrictEqual(
        capturedArgs,
        ["-p", "http-server@14.1.1"],
        "Should pin package specified with -p flag"
      );
    });

    it("should pin package specified with --package flag", async () => {
      await runNpx(["--package", "http-server"]);

      assert.deepStrictEqual(
        capturedArgs,
        ["--package", "http-server@14.1.1"],
        "Should pin package specified with --package flag"
      );
    });

    it("should pin package specified with --package=name format", async () => {
      await runNpx(["--package=http-server"]);

      assert.deepStrictEqual(
        capturedArgs,
        ["--package=http-server@14.1.1"],
        "Should pin package specified with --package=name format"
      );
    });

    it("should pin package specified with --package=name@version format", async () => {
      await runNpx(["--package=http-server@latest"]);

      assert.deepStrictEqual(
        capturedArgs,
        ["--package=http-server@14.1.1"],
        "Should replace version in --package=name@version format"
      );
    });

    it("should pin aliased package to audited version", async () => {
      await runNpx(["server@npm:http-server"]);

      assert.deepStrictEqual(
        capturedArgs,
        ["server@npm:http-server@14.1.1"],
        "Should pin aliased package to audited version"
      );
    });

    it("should preserve other arguments when pinning version", async () => {
      await runNpx(["http-server", "--port", "8080"]);

      assert.deepStrictEqual(
        capturedArgs,
        ["http-server@14.1.1", "--port", "8080"],
        "Should preserve other arguments"
      );
    });

    it("should preserve flags before package name", async () => {
      await runNpx(["--yes", "http-server"]);

      assert.deepStrictEqual(
        capturedArgs,
        ["--yes", "http-server@14.1.1"],
        "Should preserve flags before package name"
      );
    });
  });

  describe("--no-install flag removal (security fix)", () => {
    it("should remove --no-install flag to prevent local package execution", async () => {
      await runNpx(["--no-install", "http-server"]);

      assert.deepStrictEqual(
        capturedArgs,
        ["http-server@14.1.1"],
        "Should remove --no-install flag and pin version"
      );
      assert.ok(
        !capturedArgs.includes("--no-install"),
        "--no-install flag should be removed"
      );
    });

    it("should remove --no flag (short form) to prevent local package execution", async () => {
      await runNpx(["--no", "http-server"]);

      assert.deepStrictEqual(
        capturedArgs,
        ["http-server@14.1.1"],
        "Should remove --no flag and pin version"
      );
      assert.ok(
        !capturedArgs.includes("--no"),
        "--no flag should be removed"
      );
    });

    it("should remove --no-install and pin version for malicious package scenario", async () => {
      // Scenario: User has malicious-package@2.0.0 installed locally (tampered)
      // Registry has clean malicious-package@1.0.0
      // With --no-install, npx would execute the local tampered version
      // Fix: Remove --no-install and pin to audited version 1.0.0
      await runNpx(["--no-install", "malicious-package"]);

      assert.deepStrictEqual(
        capturedArgs,
        ["malicious-package@1.0.0"],
        "Should remove --no-install and pin to clean registry version"
      );
      assert.ok(
        !capturedArgs.includes("--no-install"),
        "Should not allow --no-install flag"
      );
    });

    it("should remove --no-install with -p flag", async () => {
      await runNpx(["--no-install", "-p", "http-server"]);

      assert.deepStrictEqual(
        capturedArgs,
        ["-p", "http-server@14.1.1"],
        "Should remove --no-install flag with -p option"
      );
    });

    it("should remove --no-install with --package flag", async () => {
      await runNpx(["--no-install", "--package", "http-server"]);

      assert.deepStrictEqual(
        capturedArgs,
        ["--package", "http-server@14.1.1"],
        "Should remove --no-install flag with --package option"
      );
    });

    it("should remove --no-install placed after package name", async () => {
      await runNpx(["http-server", "--no-install"]);

      assert.deepStrictEqual(
        capturedArgs,
        ["http-server@14.1.1"],
        "Should remove --no-install flag even when placed after package"
      );
    });

    it("should remove multiple --no-install flags", async () => {
      await runNpx(["--no-install", "http-server", "--no-install"]);

      assert.deepStrictEqual(
        capturedArgs,
        ["http-server@14.1.1"],
        "Should remove all --no-install flags"
      );
    });
  });

  describe("Combined security scenarios", () => {
    it("should prevent exploit: local malicious package with --no-install", async () => {
      // This is the exact exploit scenario from the pentest:
      // 1. Malicious package is installed locally
      // 2. User runs: npx --no-install malicious-package
      // 3. Scanner audits registry version (clean)
      // 4. But npx executes local version (malicious)
      //
      // Fix: Remove --no-install and pin to audited registry version
      await runNpx(["--no-install", "malicious-package"]);

      assert.deepStrictEqual(
        capturedArgs,
        ["malicious-package@1.0.0"],
        "Should execute audited registry version, not local package"
      );
      assert.ok(
        !capturedArgs.includes("--no-install"),
        "Should not allow --no-install to bypass audit"
      );
    });

    it("should prevent exploit: unversioned package with --no-install", async () => {
      // Scenario: User runs npx --no-install http-server
      // Without version, npx would use local package
      // Fix: Pin to audited version and remove --no-install
      await runNpx(["--no-install", "http-server"]);

      assert.deepStrictEqual(
        capturedArgs,
        ["http-server@14.1.1"],
        "Should pin to audited version and remove --no-install"
      );
    });

    it("should prevent exploit: package with latest tag and --no-install", async () => {
      // Scenario: User runs npx --no-install http-server@latest
      // Scanner audits registry latest, but npx uses local package
      // Fix: Pin to exact audited version and remove --no-install
      await runNpx(["--no-install", "http-server@latest"]);

      assert.deepStrictEqual(
        capturedArgs,
        ["http-server@14.1.1"],
        "Should pin to exact audited version"
      );
    });

    it("should ensure audited version is executed, not local package", async () => {
      // This test verifies the core security property:
      // The version that was audited MUST be the version that is executed
      await runNpx(["malicious-package"]);

      // The most important security property: the audited version is in the executed command
      // This ensures that even if a local malicious package exists, we execute the audited registry version
      assert.deepStrictEqual(
        capturedArgs,
        ["malicious-package@1.0.0"],
        "Must execute the audited version, not any local package"
      );
    });
  });

  describe("Edge cases", () => {
    it("should handle package without audited version", async () => {
      // If no audited version exists, pass through unchanged
      await runNpx(["unknown-package"]);

      assert.deepStrictEqual(
        capturedArgs,
        ["unknown-package"],
        "Should pass through unchanged if no audited version"
      );
    });

    it("should handle empty arguments", async () => {
      await runNpx([]);

      assert.deepStrictEqual(
        capturedArgs,
        [],
        "Should handle empty arguments"
      );
    });

    it("should preserve command arguments after package", async () => {
      await runNpx(["http-server", "-p", "8080", "--cors"]);

      assert.deepStrictEqual(
        capturedArgs,
        ["http-server@14.1.1", "-p", "8080", "--cors"],
        "Should preserve command arguments"
      );
    });

    it("should handle package with existing version (not latest)", async () => {
      // If user specifies exact version, it should still be pinned to audited version
      await runNpx(["http-server@13.0.0"]);

      assert.deepStrictEqual(
        capturedArgs,
        ["http-server@14.1.1"],
        "Should pin to audited version even if user specified different version"
      );
    });

    it("should handle multiple flags", async () => {
      await runNpx([
        "--yes",
        "--no-install",
        "-p",
        "http-server",
        "--",
        "arg1",
      ]);

      assert.deepStrictEqual(
        capturedArgs,
        ["--yes", "-p", "http-server@14.1.1", "--", "arg1"],
        "Should handle multiple flags correctly"
      );
      assert.ok(
        !capturedArgs.includes("--no-install"),
        "Should remove --no-install"
      );
    });
  });

  describe("Return value", () => {
    it("should return status from safeSpawn", async () => {
      const result = await runNpx(["http-server"]);

      assert.strictEqual(result.status, 0, "Should return status from spawn");
    });
  });
});
