import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";

describe("npm external package specification security", () => {
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
    it("rejects git:// protocol in npm install", async () => {
      const { checkChangesFromArgs } = await import(
        "../dependencyScanner/commandArgumentScanner.js"
      );

      await assert.rejects(
        async () => {
          await checkChangesFromArgs(["install", "git://github.com/attacker/malware.git"]);
        },
        {
          name: "Error",
          message: /Safe-chain does not support external package specifications for npm/,
        }
      );

      assert.strictEqual(mockResolvePackageVersion.mock.calls.length, 0);
    });

    it("rejects git+https:// protocol", async () => {
      const { checkChangesFromArgs } = await import(
        "../dependencyScanner/commandArgumentScanner.js"
      );

      await assert.rejects(
        async () => {
          await checkChangesFromArgs([
            "install",
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
          await checkChangesFromArgs(["install", "github:attacker/malware"]);
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
            "install",
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

    it("rejects file paths", async () => {
      const { checkChangesFromArgs } = await import(
        "../dependencyScanner/commandArgumentScanner.js"
      );

      await assert.rejects(
        async () => {
          await checkChangesFromArgs(["install", "./local-package"]);
        },
        {
          name: "Error",
          message: /file path/,
        }
      );

      assert.strictEqual(mockResolvePackageVersion.mock.calls.length, 0);
    });

    it("rejects external specs in npm add command", async () => {
      const { checkChangesFromArgs } = await import(
        "../dependencyScanner/commandArgumentScanner.js"
      );

      await assert.rejects(
        async () => {
          await checkChangesFromArgs(["add", "git://github.com/attacker/malware.git"]);
        },
        {
          name: "Error",
          message: /Safe-chain does not support external package specifications/,
        }
      );

      assert.strictEqual(mockResolvePackageVersion.mock.calls.length, 0);
    });
  });

  describe("Security: allows legitimate npm packages", () => {
    it("allows simple package names in npm install", async () => {
      const { checkChangesFromArgs } = await import(
        "../dependencyScanner/commandArgumentScanner.js"
      );

      const result = await checkChangesFromArgs(["install", "express"]);

      // Should return the package as an "add" change
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, "express");
      assert.strictEqual(result[0].type, "add");
    });

    it("allows scoped packages", async () => {
      const { checkChangesFromArgs } = await import(
        "../dependencyScanner/commandArgumentScanner.js"
      );

      const result = await checkChangesFromArgs(["install", "@babel/core"]);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, "@babel/core");
    });

    it("allows packages with version specifiers", async () => {
      const { checkChangesFromArgs } = await import(
        "../dependencyScanner/commandArgumentScanner.js"
      );

      const result = await checkChangesFromArgs(["install", "express@4.18.0"]);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, "express");
      // Version is resolved by mock to "1.0.0"
      assert.ok(result[0].version);
    });

    it("allows multiple legitimate packages", async () => {
      const { checkChangesFromArgs } = await import(
        "../dependencyScanner/commandArgumentScanner.js"
      );

      const result = await checkChangesFromArgs([
        "install",
        "express",
        "lodash",
        "@babel/core",
      ]);

      assert.strictEqual(result.length, 3);
      assert.strictEqual(result[0].name, "express");
      assert.strictEqual(result[1].name, "lodash");
      assert.strictEqual(result[2].name, "@babel/core");
    });
  });

  describe("Security: prevents scanner bypass", () => {
    it("blocks external specs before null resolution path", async () => {
      const { checkChangesFromArgs } = await import(
        "../dependencyScanner/commandArgumentScanner.js"
      );

      await assert.rejects(
        async () => {
          await checkChangesFromArgs([
            "install",
            "https://evil.com/package.tgz",
          ]);
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

    it("rejects external specs mixed with legitimate packages", async () => {
      const { checkChangesFromArgs } = await import(
        "../dependencyScanner/commandArgumentScanner.js"
      );

      // Should reject on first external spec
      await assert.rejects(
        async () => {
          await checkChangesFromArgs([
            "install",
            "express",
            "git://github.com/attacker/malware.git",
            "lodash",
          ]);
        },
        {
          name: "Error",
          message: /Safe-chain does not support external package specifications/,
        }
      );
    });
  });

  describe("Integration with npm argument parsing", () => {
    it("detects external specs with npm flags", async () => {
      const { checkChangesFromArgs } = await import(
        "../dependencyScanner/commandArgumentScanner.js"
      );

      await assert.rejects(
        async () => {
          await checkChangesFromArgs([
            "install",
            "--save-dev",
            "git://github.com/attacker/malware.git",
          ]);
        },
        {
          name: "Error",
          message: /Safe-chain does not support external package specifications/,
        }
      );
    });

    it("allows npm packages that contain protocol-like strings", async () => {
      const { checkChangesFromArgs } = await import(
        "../dependencyScanner/commandArgumentScanner.js"
      );

      // Package names like "http-server" should not be confused with URLs
      const result = await checkChangesFromArgs(["install", "http-server"]);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, "http-server");
    });
  });
});
