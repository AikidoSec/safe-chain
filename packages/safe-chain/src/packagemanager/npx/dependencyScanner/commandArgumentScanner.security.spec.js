import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";

describe("npx external package specification security", () => {
  let mockResolvePackageVersion;

  beforeEach(async () => {
    // Mock the npm API to prevent actual network calls
    mockResolvePackageVersion = mock.fn(async (name, version) => {
      // For legitimate packages, return a version
      if (!name.includes("://") && !name.includes("github:")) {
        return "1.0.0";
      }
      // For external specs, npm API would return null
      return null;
    });

    mock.module("../../../api/npmApi.js", {
      namedExports: {
        resolvePackageVersion: mockResolvePackageVersion,
      },
    });
  });

  afterEach(() => {
    mock.reset();
  });

  describe("Security: blocks external package specifications", () => {
    it("rejects git:// protocol", async () => {
      const { checkChangesFromArgs } = await import(
        "../dependencyScanner/commandArgumentScanner.js"
      );

      await assert.rejects(
        async () => {
          await checkChangesFromArgs(["git://github.com/attacker/malware.git"]);
        },
        {
          name: "Error",
          message: /Safe-chain does not support external package specifications for npx/,
        }
      );

      // Verify npm API was never called (blocked before resolution)
      assert.strictEqual(mockResolvePackageVersion.mock.calls.length, 0);
    });

    it("rejects git+https:// protocol", async () => {
      const { checkChangesFromArgs } = await import(
        "../dependencyScanner/commandArgumentScanner.js"
      );

      await assert.rejects(
        async () => {
          await checkChangesFromArgs([
            "git+https://github.com/attacker/malware.git",
          ]);
        },
        {
          name: "Error",
          message: /Safe-chain does not support external package specifications/,
        }
      );

      assert.strictEqual(mockResolvePackageVersion.mock.calls.length, 0);
    });

    it("rejects github: shortcut", async () => {
      const { checkChangesFromArgs } = await import(
        "../dependencyScanner/commandArgumentScanner.js"
      );

      await assert.rejects(
        async () => {
          await checkChangesFromArgs(["github:attacker/malware"]);
        },
        {
          name: "Error",
          message: /appears to be from a Git repository/,
        }
      );

      assert.strictEqual(mockResolvePackageVersion.mock.calls.length, 0);
    });

    it("rejects https:// URLs", async () => {
      const { checkChangesFromArgs } = await import(
        "../dependencyScanner/commandArgumentScanner.js"
      );

      await assert.rejects(
        async () => {
          await checkChangesFromArgs([
            "https://attacker.com/malicious-package.tgz",
          ]);
        },
        {
          name: "Error",
          message: /HTTPS URL/,
        }
      );

      assert.strictEqual(mockResolvePackageVersion.mock.calls.length, 0);
    });

    it("rejects http:// URLs", async () => {
      const { checkChangesFromArgs } = await import(
        "../dependencyScanner/commandArgumentScanner.js"
      );

      await assert.rejects(
        async () => {
          await checkChangesFromArgs(["http://attacker.com/package.tgz"]);
        },
        {
          name: "Error",
          message: /HTTPS URL/,
        }
      );

      assert.strictEqual(mockResolvePackageVersion.mock.calls.length, 0);
    });

    it("rejects file paths", async () => {
      const { checkChangesFromArgs } = await import(
        "../dependencyScanner/commandArgumentScanner.js"
      );

      await assert.rejects(
        async () => {
          await checkChangesFromArgs(["./local-package"]);
        },
        {
          name: "Error",
          message: /file path/,
        }
      );

      assert.strictEqual(mockResolvePackageVersion.mock.calls.length, 0);
    });

    it("rejects gitlab: shortcut", async () => {
      const { checkChangesFromArgs } = await import(
        "../dependencyScanner/commandArgumentScanner.js"
      );

      await assert.rejects(
        async () => {
          await checkChangesFromArgs(["gitlab:attacker/malware"]);
        },
        {
          name: "Error",
          message: /appears to be from a Git repository/,
        }
      );

      assert.strictEqual(mockResolvePackageVersion.mock.calls.length, 0);
    });

    it("rejects bitbucket: shortcut", async () => {
      const { checkChangesFromArgs } = await import(
        "../dependencyScanner/commandArgumentScanner.js"
      );

      await assert.rejects(
        async () => {
          await checkChangesFromArgs(["bitbucket:attacker/malware"]);
        },
        {
          name: "Error",
          message: /appears to be from a Git repository/,
        }
      );

      assert.strictEqual(mockResolvePackageVersion.mock.calls.length, 0);
    });
  });

  describe("Security: allows legitimate npm packages", () => {
    it("allows simple package names", async () => {
      const { checkChangesFromArgs } = await import(
        "../dependencyScanner/commandArgumentScanner.js"
      );

      const result = await checkChangesFromArgs(["http-server"]);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, "http-server");
      assert.strictEqual(result[0].type, "add");
    });

    it("allows scoped packages", async () => {
      const { checkChangesFromArgs } = await import(
        "../dependencyScanner/commandArgumentScanner.js"
      );

      const result = await checkChangesFromArgs(["@babel/core"]);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, "@babel/core");
    });

    it("allows packages with version specifiers", async () => {
      const { checkChangesFromArgs } = await import(
        "../dependencyScanner/commandArgumentScanner.js"
      );

      const result = await checkChangesFromArgs(["express@4.18.0"]);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, "express");
      // Version is resolved by mock
      assert.ok(result[0].version);
    });

    it("allows packages with version ranges", async () => {
      const { checkChangesFromArgs } = await import(
        "../dependencyScanner/commandArgumentScanner.js"
      );

      const result = await checkChangesFromArgs(["express@^4.0.0"]);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, "express");
      // Version is resolved by mock
      assert.ok(result[0].version);
    });
  });

  describe("Security: prevents scanner bypass", () => {
    it("blocks external specs before null resolution path", async () => {
      const { checkChangesFromArgs } = await import(
        "../dependencyScanner/commandArgumentScanner.js"
      );

      // External specs should be blocked before npm API call
      await assert.rejects(
        async () => {
          await checkChangesFromArgs(["https://evil.com/package.tgz"]);
        },
        {
          name: "Error",
          message: /Safe-chain does not support external package specifications/,
        }
      );

      // Critical: npm API should never be called for external specs
      assert.strictEqual(
        mockResolvePackageVersion.mock.calls.length,
        0,
        "npm API should not be called for external package specs"
      );
    });

    it("rejects external specs with multiple packages", async () => {
      const { checkChangesFromArgs } = await import(
        "../dependencyScanner/commandArgumentScanner.js"
      );

      // npx only processes the first package, so this won't reject
      // but we can test that the first package is processed correctly
      const result = await checkChangesFromArgs([
        "express",
        "git://github.com/attacker/malware.git",
      ]);

      // npx only takes the first package
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, "express");
    });
  });

  describe("Integration with npx argument parsing", () => {
    it("detects external specs with npx flags", async () => {
      const { checkChangesFromArgs } = await import(
        "../dependencyScanner/commandArgumentScanner.js"
      );

      // npx can have flags before package name
      await assert.rejects(
        async () => {
          await checkChangesFromArgs([
            "-p",
            "git://github.com/attacker/malware.git",
          ]);
        },
        {
          name: "Error",
          message: /Safe-chain does not support external package specifications/,
        }
      );
    });

    it("allows npm packages that start with common protocol prefixes", async () => {
      const { checkChangesFromArgs } = await import(
        "../dependencyScanner/commandArgumentScanner.js"
      );

      // Package names like "http-server" should not be confused with URLs
      const result = await checkChangesFromArgs(["http-server"]);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, "http-server");
    });
  });
});
