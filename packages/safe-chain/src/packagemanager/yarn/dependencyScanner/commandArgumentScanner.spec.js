import { describe, it, mock } from "node:test";
import assert from "node:assert";

describe("yarn commandArgumentScanner - non-registry package rejection", async () => {
  // Mock the npmApi to avoid actual network calls
  mock.module("../../../api/npmApi.js", {
    namedExports: {
      resolvePackageVersion: async (name, version) => {
        // Return null to simulate registry lookup failure
        return null;
      },
    },
  });

  const { commandArgumentScanner } = await import("./commandArgumentScanner.js");

  describe("HTTP(S) URL rejection - pentest exploit mitigation", () => {
    it("should reject HTTPS tarball URLs", async () => {
      const scanner = commandArgumentScanner();
      const args = ["add", "https://attacker.com/malicious.tgz"];

      await assert.rejects(
        async () => await scanner.scan(args),
        {
          message: /Non-registry package specifications are not supported/,
        }
      );
    });

    it("should reject HTTP URLs", async () => {
      const scanner = commandArgumentScanner();
      const args = ["add", "http://evil.com/payload.tgz"];

      await assert.rejects(
        async () => await scanner.scan(args),
        {
          message: /Non-registry package specifications are not supported/,
        }
      );
    });
  });

  describe("Git locator rejection - pentest exploit mitigation", () => {
    it("should reject git:// URLs", async () => {
      const scanner = commandArgumentScanner();
      const args = ["add", "git://github.com/attacker/malware.git"];

      await assert.rejects(
        async () => await scanner.scan(args),
        {
          message: /Non-registry package specifications are not supported/,
        }
      );
    });

    it("should reject git+https:// URLs", async () => {
      const scanner = commandArgumentScanner();
      const args = ["add", "git+https://github.com/attacker/malware.git"];

      await assert.rejects(
        async () => await scanner.scan(args),
        {
          message: /Non-registry package specifications are not supported/,
        }
      );
    });

    it("should reject github: shorthand", async () => {
      const scanner = commandArgumentScanner();
      const args = ["add", "github:attacker/malware"];

      await assert.rejects(
        async () => await scanner.scan(args),
        {
          message: /Non-registry package specifications are not supported/,
        }
      );
    });
  });

  describe("File path rejection - pentest exploit mitigation", () => {
    it("should reject file: protocol", async () => {
      const scanner = commandArgumentScanner();
      const args = ["add", "file:./malicious.tgz"];

      await assert.rejects(
        async () => await scanner.scan(args),
        {
          message: /Non-registry package specifications are not supported/,
        }
      );
    });

    it("should reject relative paths with ./", async () => {
      const scanner = commandArgumentScanner();
      const args = ["add", "./local-package"];

      await assert.rejects(
        async () => await scanner.scan(args),
        {
          message: /Non-registry package specifications are not supported/,
        }
      );
    });

    it("should reject relative paths with ../", async () => {
      const scanner = commandArgumentScanner();
      const args = ["add", "../local-package"];

      await assert.rejects(
        async () => await scanner.scan(args),
        {
          message: /Non-registry package specifications are not supported/,
        }
      );
    });
  });

  describe("valid registry packages still work", () => {
    it("should allow valid package names", async () => {
      const scanner = commandArgumentScanner();
      const args = ["add", "lodash"];

      await assert.doesNotReject(async () => await scanner.scan(args));
    });

    it("should allow scoped packages", async () => {
      const scanner = commandArgumentScanner();
      const args = ["add", "@scope/package"];

      await assert.doesNotReject(async () => await scanner.scan(args));
    });

    it("should allow packages with version specifiers", async () => {
      const scanner = commandArgumentScanner();
      const args = ["add", "lodash@4.17.21"];

      await assert.doesNotReject(async () => await scanner.scan(args));
    });
  });
});
