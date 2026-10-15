import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";

describe("pnpx external package specification security", () => {
  let mockResolvePackageVersion;

  beforeEach(async () => {
    // Mock the npm API to prevent actual network calls
    mockResolvePackageVersion = mock.fn(async (name, version) => {
      // For legitimate packages, return a version
      if (!name.includes("://") && !name.includes("github:")) {
        return "1.0.0";
      }
      // For external specs, npm API would return null (can't resolve)
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

  describe("Pentest scenario: pnpx with external specifications", () => {
    it("rejects git:// protocol before npm resolution (pentest step 1-3)", async () => {
      const { commandArgumentScanner } = await import(
        "../dependencyScanner/commandArgumentScanner.js"
      );
      const scanner = commandArgumentScanner();

      // Pentest finding: pnpx accepts external package specifications
      // This should now be blocked before reaching npm metadata lookup
      await assert.rejects(
        async () => {
          await scanner.scan(["git://github.com/attacker/malware.git"]);
        },
        {
          name: "Error",
          message: /Safe-chain does not support external package specifications for pnpm/,
        }
      );

      // Verify npm API was never called (blocked before resolution)
      assert.strictEqual(mockResolvePackageVersion.mock.calls.length, 0);
    });

    it("rejects git+https:// protocol before npm resolution (pentest step 1-3)", async () => {
      const { commandArgumentScanner } = await import(
        "../dependencyScanner/commandArgumentScanner.js"
      );
      const scanner = commandArgumentScanner();

      await assert.rejects(
        async () => {
          await scanner.scan([
            "git+https://github.com/attacker/malware.git",
          ]);
        },
        {
          name: "Error",
          message: /Safe-chain does not support external package specifications/,
        }
      );

      // Verify npm API was never called
      assert.strictEqual(mockResolvePackageVersion.mock.calls.length, 0);
    });

    it("rejects github: shortcut before npm resolution (pentest step 1-3)", async () => {
      const { commandArgumentScanner } = await import(
        "../dependencyScanner/commandArgumentScanner.js"
      );
      const scanner = commandArgumentScanner();

      await assert.rejects(
        async () => {
          await scanner.scan(["github:attacker/malware"]);
        },
        {
          name: "Error",
          message: /appears to be from a Git repository/,
        }
      );

      // Verify npm API was never called
      assert.strictEqual(mockResolvePackageVersion.mock.calls.length, 0);
    });

    it("rejects https:// URLs before npm resolution (pentest step 1-3)", async () => {
      const { commandArgumentScanner } = await import(
        "../dependencyScanner/commandArgumentScanner.js"
      );
      const scanner = commandArgumentScanner();

      // Pentest finding: HTTPS URLs bypass scanner
      await assert.rejects(
        async () => {
          await scanner.scan([
            "https://attacker.com/malicious-package.tgz",
          ]);
        },
        {
          name: "Error",
          message: /HTTPS URL/,
        }
      );

      // Verify npm API was never called
      assert.strictEqual(mockResolvePackageVersion.mock.calls.length, 0);
    });

    it("rejects file paths before npm resolution (pentest step 1-3)", async () => {
      const { commandArgumentScanner } = await import(
        "../dependencyScanner/commandArgumentScanner.js"
      );
      const scanner = commandArgumentScanner();

      await assert.rejects(
        async () => {
          await scanner.scan(["./local-package"]);
        },
        {
          name: "Error",
          message: /file path/,
        }
      );

      // Verify npm API was never called
      assert.strictEqual(mockResolvePackageVersion.mock.calls.length, 0);
    });

    it("allows legitimate npm packages through scanner (pentest step 4)", async () => {
      const { commandArgumentScanner } = await import(
        "../dependencyScanner/commandArgumentScanner.js"
      );
      const scanner = commandArgumentScanner();

      // Legitimate packages should still work
      const result = await scanner.scan(["express"]);

      // Should return the package as an "add" change
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, "express");
      assert.strictEqual(result[0].type, "add");
    });

    it("allows scoped npm packages through scanner", async () => {
      const { commandArgumentScanner } = await import(
        "../dependencyScanner/commandArgumentScanner.js"
      );
      const scanner = commandArgumentScanner();

      const result = await scanner.scan(["@aikidosec/firewall"]);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, "@aikidosec/firewall");
    });

    it("rejects multiple external specs in single command", async () => {
      const { commandArgumentScanner } = await import(
        "../dependencyScanner/commandArgumentScanner.js"
      );
      const scanner = commandArgumentScanner();

      // Should reject on first external spec
      await assert.rejects(
        async () => {
          await scanner.scan([
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

    it("rejects external specs with version tags", async () => {
      const { commandArgumentScanner } = await import(
        "../dependencyScanner/commandArgumentScanner.js"
      );
      const scanner = commandArgumentScanner();

      await assert.rejects(
        async () => {
          await scanner.scan([
            "git://github.com/attacker/malware.git#v1.0.0",
          ]);
        },
        {
          name: "Error",
          message: /Safe-chain does not support external package specifications/,
        }
      );
    });
  });

  describe("Security: prevents scanner bypass (pentest root cause)", () => {
    it("blocks external specs before null resolution path (pentest step 3)", async () => {
      const { commandArgumentScanner } = await import(
        "../dependencyScanner/commandArgumentScanner.js"
      );
      const scanner = commandArgumentScanner();

      // Pentest finding: "npm metadata lookup can return null"
      // The fix prevents reaching this code path for external specs
      await assert.rejects(
        async () => {
          await scanner.scan(["https://evil.com/package.tgz"]);
        },
        {
          name: "Error",
          message: /Safe-chain does not support external package specifications/,
        }
      );

      // Critical: npm API should never be called for external specs
      // This prevents the "null resolution treated as allowed" vulnerability
      assert.strictEqual(
        mockResolvePackageVersion.mock.calls.length,
        0,
        "npm API should not be called for external package specs"
      );
    });

    it("prevents unresolved entries from reaching audit path (pentest step 4)", async () => {
      const { commandArgumentScanner } = await import(
        "../dependencyScanner/commandArgumentScanner.js"
      );
      const scanner = commandArgumentScanner();

      // Pentest finding: "audit only disallows entries found in malware database;
      // an unresolved external specification therefore proceeds through allowed path"
      // The fix ensures external specs never reach the audit path
      await assert.rejects(
        async () => {
          await scanner.scan(["git+ssh://git@github.com/evil/pkg.git"]);
        },
        {
          name: "Error",
          message: /Safe-chain does not support external package specifications/,
        }
      );

      // External specs are rejected before audit, preventing bypass
      assert.strictEqual(mockResolvePackageVersion.mock.calls.length, 0);
    });
  });

  describe("Integration with pnpm argument parsing", () => {
    it("detects external specs after --package= flag parsing", async () => {
      const { commandArgumentScanner } = await import(
        "../dependencyScanner/commandArgumentScanner.js"
      );
      const scanner = commandArgumentScanner();

      // pnpm dlx can use --package=spec format
      await assert.rejects(
        async () => {
          await scanner.scan([
            "--package=git://github.com/attacker/malware.git",
          ]);
        },
        {
          name: "Error",
          message: /Safe-chain does not support external package specifications/,
        }
      );
    });

    it("detects external specs with version specifiers", async () => {
      const { commandArgumentScanner } = await import(
        "../dependencyScanner/commandArgumentScanner.js"
      );
      const scanner = commandArgumentScanner();

      await assert.rejects(
        async () => {
          await scanner.scan(["github:attacker/malware@v1.0.0"]);
        },
        {
          name: "Error",
          message: /appears to be from a Git repository/,
        }
      );
    });

    it("allows npm packages with @ in name and version", async () => {
      const { commandArgumentScanner } = await import(
        "../dependencyScanner/commandArgumentScanner.js"
      );
      const scanner = commandArgumentScanner();

      // Should not be confused with external specs
      const result = await scanner.scan(["@scope/package@1.0.0"]);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, "@scope/package");
      assert.strictEqual(result[0].version, "1.0.0");
    });
  });
});
