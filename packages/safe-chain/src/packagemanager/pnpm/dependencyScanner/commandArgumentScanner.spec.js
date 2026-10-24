import { describe, it, mock } from "node:test";
import assert from "node:assert";

describe("pnpm commandArgumentScanner - non-registry package rejection", async () => {
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

    it("should reject HTTPS URLs mixed with valid packages", async () => {
      const scanner = commandArgumentScanner();
      const args = ["add", "axios", "https://attacker.com/backdoor.tgz"];

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

    it("should reject git+ssh:// URLs", async () => {
      const scanner = commandArgumentScanner();
      const args = ["add", "git+ssh://git@github.com/attacker/malware.git"];

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

    it("should reject absolute paths", async () => {
      const scanner = commandArgumentScanner();
      const args = ["add", "/tmp/malicious-package"];

      await assert.rejects(
        async () => await scanner.scan(args),
        {
          message: /Non-registry package specifications are not supported/,
        }
      );
    });
  });

  describe("pnpm-specific scenarios - pentest Step 8 & 9 mitigation", () => {
    it("should reject URLs parsed with last @ split", async () => {
      // The pentest finding (Step 8) showed pnpm splits on last @ 
      // and assigns default tag without distinguishing URLs
      const scanner = commandArgumentScanner();
      const args = ["add", "https://example.com/package@1.0.0.tgz"];

      await assert.rejects(
        async () => await scanner.scan(args),
        {
          message: /Non-registry package specifications are not supported/,
        }
      );
    });

    it("should reject Git locators before fabricated identity is appended", async () => {
      // The pentest finding (Step 9) showed pnpm appends fabricated identities
      // regardless of resolution failure
      const scanner = commandArgumentScanner();
      const args = ["add", "git://github.com/http-party/http-server"];

      await assert.rejects(
        async () => await scanner.scan(args),
        {
          message: /Non-registry package specifications are not supported/,
        }
      );
    });

    it("should reject --package= syntax with URLs", async () => {
      const scanner = commandArgumentScanner();
      const args = ["add", "--package=https://attacker.com/malware.tgz"];

      await assert.rejects(
        async () => await scanner.scan(args),
        {
          message: /Non-registry package specifications are not supported/,
        }
      );
    });
  });

  describe("fail-closed enforcement - core vulnerability mitigation", () => {
    it("should reject non-registry specs before audit", async () => {
      // Verifies the fix for the core vulnerability:
      // Non-registry specs are rejected BEFORE synthetic identities reach audit
      const scanner = commandArgumentScanner();
      const args = ["add", "https://attacker.com/malware.tgz"];

      await assert.rejects(
        async () => await scanner.scan(args),
        {
          message: /Non-registry package specifications are not supported/,
        }
      );
    });

    it("should prevent bypass via pnpm argument parser", async () => {
      // The pentest showed pnpm parser accepts arbitrary non-option arguments
      const scanner = commandArgumentScanner();
      const args = ["add", "http://localhost:8080/backdoor.tgz"];

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
      const args = ["add", "axios"];

      await assert.doesNotReject(async () => await scanner.scan(args));
    });

    it("should allow scoped packages", async () => {
      const scanner = commandArgumentScanner();
      const args = ["add", "@scope/package"];

      await assert.doesNotReject(async () => await scanner.scan(args));
    });

    it("should allow packages with version specifiers", async () => {
      const scanner = commandArgumentScanner();
      const args = ["add", "axios@1.9.0"];

      await assert.doesNotReject(async () => await scanner.scan(args));
    });

    it("should allow multiple valid packages", async () => {
      const scanner = commandArgumentScanner();
      const args = ["add", "axios", "jest", "@vercel/otel"];

      await assert.doesNotReject(async () => await scanner.scan(args));
    });
  });
});
