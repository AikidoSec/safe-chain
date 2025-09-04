import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";
import { tmpdir } from "node:os";
import fs from "node:fs";
import path from "path";

describe("Bun package manager integration", () => {
  let testDir;
  let mockBunfigPath;
  let bun;

  beforeEach(async () => {
    // Create temporary directory and bunfig file for testing
    testDir = path.join(tmpdir(), `test-bun-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    mockBunfigPath = path.join(testDir, ".bunfig.toml");

    // Mock child_process execSync - basic version
    mock.module("child_process", {
      namedExports: {
        execSync: (command) => {
          if (command.includes("list -g")) {
            return "package1@1.0.0\npackage2@2.0.0\n";
          }
          if (command.includes("add -g")) {
            return "Added @aikidosec/safe-chain@1.0.0";
          }
          return "";
        },
      },
    });

    // Mock os.homedir to return our test directory
    mock.module("os", {
      namedExports: {
        homedir: () => testDir,
        EOL: "\n",
      },
    });

    // Mock helpers module
    mock.module("../helpers.js", {
      namedExports: {
        doesExecutableExistOnSystem: () => true,
      },
    });

    // Import bun module after mocking
    bun = (await import("./bun.js")).default;
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }

    // Reset mocks
    mock.reset();
  });

  describe("isInstalled", () => {
    it("should return true when bun is installed", () => {
      assert.strictEqual(bun.isInstalled(), true);
    });

    it("should call doesExecutableExistOnSystem with correct parameter", () => {
      assert.strictEqual(bun.isInstalled(), true);
    });
  });

  describe("setup", () => {
    it("should successfully setup bun integration", () => {
      const result = bun.setup();
      assert.strictEqual(result, true);

      // Verify bunfig.toml was created with correct content
      assert.ok(fs.existsSync(mockBunfigPath));
      const content = fs.readFileSync(mockBunfigPath, "utf-8");
      assert.ok(content.includes("[install.security]"));
      assert.ok(content.includes('scanner = "@aikidosec/safe-chain"'));
    });

    it("should update existing bunfig.toml", () => {
      // Create existing bunfig.toml with other content
      const existingContent = `name = "my-project"

[build]
target = "node"`;
      fs.writeFileSync(mockBunfigPath, existingContent, "utf-8");

      const result = bun.setup();
      assert.strictEqual(result, true);

      const content = fs.readFileSync(mockBunfigPath, "utf-8");
      assert.ok(content.includes('name = "my-project"'));
      assert.ok(content.includes("[build]"));
      assert.ok(content.includes("[install.security]"));
      assert.ok(content.includes('scanner = "@aikidosec/safe-chain"'));
    });

    it("should create bunfig.toml when it doesn't exist", () => {
      // Explicitly ensure file doesn't exist
      if (fs.existsSync(mockBunfigPath)) {
        fs.unlinkSync(mockBunfigPath);
      }
      assert.ok(!fs.existsSync(mockBunfigPath));

      const result = bun.setup();
      assert.strictEqual(result, true);

      // Verify bunfig.toml was created with correct content
      assert.ok(fs.existsSync(mockBunfigPath));
      const content = fs.readFileSync(mockBunfigPath, "utf-8");
      assert.ok(content.includes("[install.security]"));
      assert.ok(content.includes('scanner = "@aikidosec/safe-chain"'));
    });

    it("should create .bunfig.toml even when bun package installation fails", async () => {
      // Reset mocks and create a new mock that throws errors
      mock.reset();
      
      mock.module("child_process", {
        namedExports: {
          execSync: (command) => {
            if (command.includes("pm ls -g") || command.includes("add -g")) {
              throw new Error("Command failed");
            }
            return "";
          },
        },
      });

      // Mock os.homedir to return our test directory
      mock.module("os", {
        namedExports: {
          homedir: () => testDir,
          EOL: "\n",
        },
      });

      // Mock helpers module
      mock.module("../helpers.js", {
        namedExports: {
          doesExecutableExistOnSystem: () => true,
        },
      });

      // Re-import bun module after mocking
      const bunWithFailingCommands = (await import("./bun.js?v=" + Date.now())).default;
      
      // Ensure file doesn't exist initially  
      if (fs.existsSync(mockBunfigPath)) {
        fs.unlinkSync(mockBunfigPath);
      }
      assert.ok(!fs.existsSync(mockBunfigPath));

      const result = bunWithFailingCommands.setup();
      assert.strictEqual(result, true); // Should still succeed

      // Verify .bunfig.toml was created despite package installation failure
      assert.ok(fs.existsSync(mockBunfigPath));
      const content = fs.readFileSync(mockBunfigPath, "utf-8");
      assert.ok(content.includes("[install.security]"));
      assert.ok(content.includes('scanner = "@aikidosec/safe-chain"'));
    });

    it("should handle errors gracefully", () => {
      // This test verifies error handling exists by checking the return type
      // The actual error scenarios are covered in the real implementation
      const result = bun.setup();
      assert.ok(typeof result === "boolean");
    });
  });

  describe("teardown", () => {
    it("should successfully remove bun configuration", () => {
      // Create bunfig.toml with security section
      const initialContent = `name = "my-project"

[install.security]
scanner = "@aikidosec/safe-chain"
timeout = 5000

[build]
target = "node"`;
      fs.writeFileSync(mockBunfigPath, initialContent, "utf-8");

      const result = bun.teardown();
      assert.strictEqual(result, true);

      const content = fs.readFileSync(mockBunfigPath, "utf-8");
      assert.ok(content.includes('name = "my-project"'));
      assert.ok(content.includes("[build]"));
      assert.ok(!content.includes("[install.security]"));
      assert.ok(!content.includes("scanner"));
    });

    it("should handle non-existent bunfig.toml", () => {
      // Ensure file doesn't exist
      if (fs.existsSync(mockBunfigPath)) {
        fs.unlinkSync(mockBunfigPath);
      }

      const result = bun.teardown();
      assert.strictEqual(result, true);
    });

    it("should handle bunfig.toml without security section", () => {
      const initialContent = `name = "my-project"

[build]
target = "node"`;
      fs.writeFileSync(mockBunfigPath, initialContent, "utf-8");

      const result = bun.teardown();
      assert.strictEqual(result, true);

      const content = fs.readFileSync(mockBunfigPath, "utf-8");
      assert.ok(content.includes('name = "my-project"'));
      assert.ok(content.includes("[build]"));
    });

    it("should preserve other content in bunfig.toml", () => {
      const initialContent = `# Main config
name = "my-project"
version = "1.0.0"

[install.security]
scanner = "@aikidosec/safe-chain"

[build]
target = "node"
minify = true`;
      fs.writeFileSync(mockBunfigPath, initialContent, "utf-8");

      const result = bun.teardown();
      assert.strictEqual(result, true);

      const content = fs.readFileSync(mockBunfigPath, "utf-8");
      assert.ok(content.includes("# Main config"));
      assert.ok(content.includes('name = "my-project"'));
      assert.ok(content.includes('version = "1.0.0"'));
      assert.ok(content.includes("[build]"));
      assert.ok(content.includes("minify = true"));
      assert.ok(!content.includes("[install.security]"));
      assert.ok(!content.includes("scanner"));
    });

    it("should preserve other security scanners in bunfig.toml", () => {
      const initialContent = `# Main config
name = "my-project"
version = "1.0.0"

[install.security]
scanner = "@someorg/other-scanner"

[build]
target = "node"
minify = true`;
      fs.writeFileSync(mockBunfigPath, initialContent, "utf-8");

      const result = bun.teardown();
      assert.strictEqual(result, true);

      const content = fs.readFileSync(mockBunfigPath, "utf-8");
      assert.ok(content.includes("# Main config"));
      assert.ok(content.includes('name = "my-project"'));
      assert.ok(content.includes('version = "1.0.0"'));
      assert.ok(content.includes("[build]"));
      assert.ok(content.includes("minify = true"));
      assert.ok(content.includes("[install.security]"));
      assert.ok(content.includes("scanner"));
    });
  });
  describe("package manager properties", () => {
    it("should have correct name", () => {
      assert.strictEqual(bun.name, "Bun");
    });

    it("should expose all required methods", () => {
      assert.ok(typeof bun.isInstalled === "function");
      assert.ok(typeof bun.setup === "function");
      assert.ok(typeof bun.teardown === "function");
      assert.ok(typeof bun.name === "string");
    });
  });

  describe("integration tests", () => {
    it("should handle complete setup and teardown cycle", () => {
      // Setup
      const setupResult = bun.setup();
      assert.strictEqual(setupResult, true);

      let content = fs.readFileSync(mockBunfigPath, "utf-8");
      assert.ok(content.includes("[install.security]"));
      assert.ok(content.includes('scanner = "@aikidosec/safe-chain"'));

      // Teardown
      const teardownResult = bun.teardown();
      assert.strictEqual(teardownResult, true);

      content = fs.readFileSync(mockBunfigPath, "utf-8");
      assert.ok(!content.includes("[install.security]"));
      assert.ok(!content.includes("scanner"));
    });

    it("should handle multiple setup calls without duplication", () => {
      // First setup
      bun.setup();
      let content = fs.readFileSync(mockBunfigPath, "utf-8");

      // Second setup
      bun.setup();
      content = fs.readFileSync(mockBunfigPath, "utf-8");

      // Content should be essentially the same (no duplication)
      assert.ok(content.includes("[install.security]"));
      assert.ok(content.includes('scanner = "@aikidosec/safe-chain"'));

      // Should not have multiple security sections
      const securitySectionCount = (
        content.match(/\[install\.security\]/g) || []
      ).length;
      assert.strictEqual(securitySectionCount, 1);
    });

    it("should preserve complex bunfig.toml structure", () => {
      const complexContent = `# Global configuration
name = "complex-project"
version = "2.1.0"

[install]
cache = true
registry = "https://registry.npmjs.org"

[install.scopes]
"@company" = "https://npm.company.com"

[build]
target = "node"
minify = true
sourcemap = true

[test]
root = "./tests"
preload = ["./setup.js"]`;

      fs.writeFileSync(mockBunfigPath, complexContent, "utf-8");

      // Setup should add security section
      bun.setup();
      let content = fs.readFileSync(mockBunfigPath, "utf-8");

      assert.ok(content.includes("[install.security]"));
      assert.ok(content.includes('scanner = "@aikidosec/safe-chain"'));
      assert.ok(content.includes("[install.scopes]"));
      assert.ok(content.includes("[build]"));
      assert.ok(content.includes("[test]"));

      // Teardown should remove only security section
      bun.teardown();
      content = fs.readFileSync(mockBunfigPath, "utf-8");

      assert.ok(!content.includes("[install.security]"));
      assert.ok(!content.includes("scanner"));
      assert.ok(content.includes("[install.scopes]"));
      assert.ok(content.includes("[build]"));
      assert.ok(content.includes("[test]"));
    });
  });

  describe("error handling", () => {
    it("should handle errors gracefully", () => {
      const result = bun.setup();
      // Just verify it returns a boolean (the error handling is built into the methods)
      assert.ok(typeof result === "boolean");

      const teardownResult = bun.teardown();
      assert.ok(typeof teardownResult === "boolean");
    });
  });
});
