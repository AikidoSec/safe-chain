import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";
import { tmpdir } from "node:os";
import fs from "node:fs";
import path from "path";

describe("TOML utilities", () => {
  let testFilePath;
  let tomlUtils;

  beforeEach(async () => {
    // Create temporary file for testing
    testFilePath = path.join(tmpdir(), `test-bunfig-${Date.now()}.toml`);

    // Import toml-utils after setting up test environment
    tomlUtils = await import("./toml-utils.js");
  });

  afterEach(() => {
    // Clean up test files
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }

    // Reset mocks
    mock.reset();
  });

  describe("readTOMLFile", () => {
    it("should return empty object for non-existent file", () => {
      const result = tomlUtils.readTOMLFile("/non/existent/file.toml");
      assert.deepStrictEqual(result, {});
    });

    it("should parse simple key-value pairs", () => {
      const content = `name = "test"
version = "1.0.0"
debug = true`;
      fs.writeFileSync(testFilePath, content, "utf-8");

      const result = tomlUtils.readTOMLFile(testFilePath);
      assert.deepStrictEqual(result, {
        name: "test",
        version: "1.0.0",
        debug: "true",
      });
    });

    it("should parse sections with key-value pairs", () => {
      const content = `name = "test"

[install.security]
scanner = "@aikidosec/safe-chain"

[build]
target = "node"`;
      fs.writeFileSync(testFilePath, content, "utf-8");

      const result = tomlUtils.readTOMLFile(testFilePath);
      assert.deepStrictEqual(result, {
        name: "test",
        "install.security": {
          scanner: "@aikidosec/safe-chain",
        },
        build: {
          target: "node",
        },
      });
    });

    it("should handle quoted and unquoted values", () => {
      const content = `quoted = "value"
single_quoted = 'value'
unquoted = value
number = 123`;
      fs.writeFileSync(testFilePath, content, "utf-8");

      const result = tomlUtils.readTOMLFile(testFilePath);
      assert.deepStrictEqual(result, {
        quoted: "value",
        single_quoted: "value",
        unquoted: "value",
        number: "123",
      });
    });

    it("should ignore comments and empty lines", () => {
      const content = `# This is a comment
name = "test"

# Another comment
[section]
# Comment in section
key = "value"

`;
      fs.writeFileSync(testFilePath, content, "utf-8");

      const result = tomlUtils.readTOMLFile(testFilePath);
      assert.deepStrictEqual(result, {
        name: "test",
        section: {
          key: "value",
        },
      });
    });

    it("should handle Windows line endings", () => {
      const content = `name = "test"\r\n[section]\r\nkey = "value"\r\n`;
      fs.writeFileSync(testFilePath, content, "utf-8");

      const result = tomlUtils.readTOMLFile(testFilePath);
      assert.deepStrictEqual(result, {
        name: "test",
        section: {
          key: "value",
        },
      });
    });
  });

  describe("updateTOMLFile", () => {
    it("should create new file with install.security section", () => {
      tomlUtils.updateTOMLFile(testFilePath, {
        "install.security": {
          scanner: "@aikidosec/safe-chain",
        },
      });

      assert.ok(fs.existsSync(testFilePath));
      const content = fs.readFileSync(testFilePath, "utf-8");
      assert.ok(content.includes("[install.security]"));
      assert.ok(content.includes('scanner = "@aikidosec/safe-chain"'));
    });

    it("should add install.security section to existing file", () => {
      const initialContent = `name = "test"
version = "1.0.0"`;
      fs.writeFileSync(testFilePath, initialContent, "utf-8");

      tomlUtils.updateTOMLFile(testFilePath, {
        "install.security": {
          scanner: "@aikidosec/safe-chain",
        },
      });

      const content = fs.readFileSync(testFilePath, "utf-8");
      assert.ok(content.includes("name = \"test\""));
      assert.ok(content.includes("version = \"1.0.0\""));
      assert.ok(content.includes("[install.security]"));
      assert.ok(content.includes('scanner = "@aikidosec/safe-chain"'));
    });

    it("should update existing scanner configuration", () => {
      const initialContent = `[install.security]
scanner = "old-scanner"`;
      fs.writeFileSync(testFilePath, initialContent, "utf-8");

      tomlUtils.updateTOMLFile(testFilePath, {
        "install.security": {
          scanner: "@aikidosec/safe-chain",
        },
      });

      const content = fs.readFileSync(testFilePath, "utf-8");
      assert.ok(content.includes('scanner = "@aikidosec/safe-chain"'));
      assert.ok(!content.includes("old-scanner"));
    });

    it("should handle file without final newline", () => {
      const initialContent = `name = "test"`;
      fs.writeFileSync(testFilePath, initialContent, "utf-8");

      tomlUtils.updateTOMLFile(testFilePath, {
        "install.security": {
          scanner: "@aikidosec/safe-chain",
        },
      });

      const content = fs.readFileSync(testFilePath, "utf-8");
      assert.ok(content.includes("name = \"test\""));
      assert.ok(content.includes("[install.security]"));
      assert.ok(content.endsWith("\n"));
    });
  });

  describe("removeTOMLSection", () => {
    it("should do nothing for non-existent file", () => {
      tomlUtils.removeTOMLSection("/non/existent/file.toml", "install.security");
      // Should not throw an error
    });

    it("should remove entire section with its content", () => {
      const initialContent = `name = "test"

[install.security]
scanner = "@aikidosec/safe-chain"
timeout = 5000

[build]
target = "node"`;
      fs.writeFileSync(testFilePath, initialContent, "utf-8");

      tomlUtils.removeTOMLSection(testFilePath, "install.security");

      const content = fs.readFileSync(testFilePath, "utf-8");
      assert.ok(content.includes("name = \"test\""));
      assert.ok(content.includes("[build]"));
      assert.ok(content.includes("target = \"node\""));
      assert.ok(!content.includes("[install.security]"));
      assert.ok(!content.includes("scanner"));
      assert.ok(!content.includes("timeout"));
    });

    it("should handle section at beginning of file", () => {
      const initialContent = `[install.security]
scanner = "@aikidosec/safe-chain"

[build]
target = "node"`;
      fs.writeFileSync(testFilePath, initialContent, "utf-8");

      tomlUtils.removeTOMLSection(testFilePath, "install.security");

      const content = fs.readFileSync(testFilePath, "utf-8");
      assert.ok(content.includes("[build]"));
      assert.ok(content.includes("target = \"node\""));
      assert.ok(!content.includes("[install.security]"));
      assert.ok(!content.includes("scanner"));
    });

    it("should handle section at end of file", () => {
      const initialContent = `[build]
target = "node"

[install.security]
scanner = "@aikidosec/safe-chain"`;
      fs.writeFileSync(testFilePath, initialContent, "utf-8");

      tomlUtils.removeTOMLSection(testFilePath, "install.security");

      const content = fs.readFileSync(testFilePath, "utf-8");
      assert.ok(content.includes("[build]"));
      assert.ok(content.includes("target = \"node\""));
      assert.ok(!content.includes("[install.security]"));
      assert.ok(!content.includes("scanner"));
    });

    it("should handle file with only the target section", () => {
      const initialContent = `[install.security]
scanner = "@aikidosec/safe-chain"
timeout = 5000`;
      fs.writeFileSync(testFilePath, initialContent, "utf-8");

      tomlUtils.removeTOMLSection(testFilePath, "install.security");

      const content = fs.readFileSync(testFilePath, "utf-8");
      assert.strictEqual(content.trim(), "");
    });

    it("should not remove sections with similar names", () => {
      const initialContent = `[install]
method = "npm"

[install.security]
scanner = "@aikidosec/safe-chain"

[install.dev]
devDependencies = true`;
      fs.writeFileSync(testFilePath, initialContent, "utf-8");

      tomlUtils.removeTOMLSection(testFilePath, "install.security");

      const content = fs.readFileSync(testFilePath, "utf-8");
      assert.ok(content.includes("[install]"));
      assert.ok(content.includes("method = \"npm\""));
      assert.ok(content.includes("[install.dev]"));
      assert.ok(content.includes("devDependencies = true"));
      assert.ok(!content.includes("[install.security]"));
      assert.ok(!content.includes("scanner"));
    });

    it("should preserve comments outside target section", () => {
      const initialContent = `# Main configuration
name = "test"

# Security settings
[install.security]
scanner = "@aikidosec/safe-chain"

# Build configuration
[build]
target = "node"`;
      fs.writeFileSync(testFilePath, initialContent, "utf-8");

      tomlUtils.removeTOMLSection(testFilePath, "install.security");

      const content = fs.readFileSync(testFilePath, "utf-8");
      assert.ok(content.includes("# Main configuration"));
      assert.ok(content.includes("[build]"));
      assert.ok(content.includes("target = \"node\""));
      assert.ok(!content.includes("[install.security]"));
      assert.ok(!content.includes("scanner"));
      // Note: Comments directly above removed sections may be affected by the cleanup logic
    });
  });

  describe("removeScannerFromTOMLSection", () => {
    it("should remove section when it contains the specified scanner", () => {
      const initialContent = `name = "my-project"

[install.security]
scanner = "@aikidosec/safe-chain"

[build]
target = "node"`;
      fs.writeFileSync(testFilePath, initialContent, "utf-8");

      tomlUtils.removeScannerFromTOMLSection(testFilePath, "@aikidosec/safe-chain");

      const content = fs.readFileSync(testFilePath, "utf-8");
      assert.ok(content.includes("name = \"my-project\""));
      assert.ok(content.includes("[build]"));
      assert.ok(!content.includes("[install.security]"));
      assert.ok(!content.includes("scanner"));
    });

    it("should preserve section when it contains a different scanner", () => {
      const initialContent = `name = "my-project"

[install.security]
scanner = "@someorg/other-scanner"

[build]
target = "node"`;
      fs.writeFileSync(testFilePath, initialContent, "utf-8");

      tomlUtils.removeScannerFromTOMLSection(testFilePath, "@aikidosec/safe-chain");

      const content = fs.readFileSync(testFilePath, "utf-8");
      assert.ok(content.includes("name = \"my-project\""));
      assert.ok(content.includes("[build]"));
      assert.ok(content.includes("[install.security]"));
      assert.ok(content.includes('scanner = "@someorg/other-scanner"'));
    });

    it("should do nothing when section doesn't exist", () => {
      const initialContent = `name = "my-project"

[build]
target = "node"`;
      fs.writeFileSync(testFilePath, initialContent, "utf-8");

      tomlUtils.removeScannerFromTOMLSection(testFilePath, "@aikidosec/safe-chain");

      const content = fs.readFileSync(testFilePath, "utf-8");
      assert.ok(content.includes("name = \"my-project\""));
      assert.ok(content.includes("[build]"));
      assert.ok(!content.includes("[install.security]"));
    });

    it("should handle non-existent file", () => {
      tomlUtils.removeScannerFromTOMLSection("/non/existent/file.toml", "@aikidosec/safe-chain");
      // Should not throw an error
    });
  });

  describe("edge cases", () => {
    it("should handle malformed TOML gracefully", () => {
      const malformedContent = `name = "test"
[invalid section
key = value =
= invalid`;
      fs.writeFileSync(testFilePath, malformedContent, "utf-8");

      const result = tomlUtils.readTOMLFile(testFilePath);
      assert.ok(result.name === "test");
      // Should not throw errors on malformed content
    });

    it("should handle empty file", () => {
      fs.writeFileSync(testFilePath, "", "utf-8");

      const result = tomlUtils.readTOMLFile(testFilePath);
      assert.deepStrictEqual(result, {});

      tomlUtils.updateTOMLFile(testFilePath, {
        "install.security": {
          scanner: "@aikidosec/safe-chain",
        },
      });

      const content = fs.readFileSync(testFilePath, "utf-8");
      assert.ok(content.includes("[install.security]"));
    });

    it("should handle very long lines", () => {
      const longValue = "a".repeat(1000);
      const content = `longkey = "${longValue}"`;
      fs.writeFileSync(testFilePath, content, "utf-8");

      const result = tomlUtils.readTOMLFile(testFilePath);
      assert.strictEqual(result.longkey, longValue);
    });
  });
});