import { describe, it, before, after, mock } from "node:test";
import assert from "node:assert";
import fs from "fs";
import path from "path";
import os from "os";
import { addScannerToToml, setup } from "./setup.js";

describe("addScannerToToml", () => {
  it("should add scanner to empty content", () => {
    const result = addScannerToToml("");
    assert.strictEqual(result.changed, true);
    assert.strictEqual(
      result.content.trim(),
      `[install.security]\nscanner = "@aikidosec/safe-chain-bun"`
    );
  });

  it("should add scanner to existing content without [install.security] section", () => {
    const input = `[install]\nregistry = "https://registry.npmjs.org/"`;
    const result = addScannerToToml(input);
    assert.strictEqual(result.changed, true);
    assert.ok(result.content.includes("[install.security]"));
    assert.ok(result.content.includes('scanner = "@aikidosec/safe-chain-bun"'));
    assert.ok(result.content.includes('registry = "https://registry.npmjs.org/"'));
  });

  it("should add scanner to existing [install.security] section without scanner", () => {
    const input = `[install.security]\n# Some comment`;
    const result = addScannerToToml(input);
    assert.strictEqual(result.changed, true);
    assert.ok(result.content.includes("[install.security]"));
    assert.ok(result.content.includes('scanner = "@aikidosec/safe-chain-bun"'));
    assert.ok(result.content.includes("# Some comment"));
  });

  it("should replace existing scanner in [install.security] section", () => {
    const input = `[install.security]\nscanner = "@other/scanner"`;
    const result = addScannerToToml(input);
    assert.strictEqual(result.changed, true);
    assert.strictEqual(
      result.content.trim(),
      `[install.security]\nscanner = "@aikidosec/safe-chain-bun"`
    );
  });

  it("should not change content if safe-chain-bun scanner already configured", () => {
    const input = `[install.security]\nscanner = "@aikidosec/safe-chain-bun"`;
    const result = addScannerToToml(input);
    assert.strictEqual(result.changed, false);
    assert.strictEqual(result.content, input);
  });

  it("should handle complex TOML with multiple sections", () => {
    const input = `[install]
registry = "https://registry.npmjs.org/"

[test]
preload = ["./setup.ts"]

[install.security]
# Security configuration
scanner = "@other/old-scanner"

[build]
target = "node"`;
    
    const result = addScannerToToml(input);
    assert.strictEqual(result.changed, true);
    assert.ok(result.content.includes('scanner = "@aikidosec/safe-chain-bun"'));
    assert.ok(!result.content.includes("@other/old-scanner"));
    assert.ok(result.content.includes("registry = \"https://registry.npmjs.org/\""));
    assert.ok(result.content.includes("[test]"));
    assert.ok(result.content.includes("[build]"));
  });

  it("should handle scanner with different whitespace formatting", () => {
    const input = `[install.security]\nscanner="@other/scanner"`;
    const result = addScannerToToml(input);
    assert.strictEqual(result.changed, true);
    assert.ok(result.content.includes('scanner = "@aikidosec/safe-chain-bun"'));
  });
});

describe("setup function", () => {
  let tempDir;
  let originalConsoleLog;
  let originalConsoleError;
  let consoleOutput;
  let consoleErrors;

  before(() => {
    // Create a temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "safe-chain-bun-test-"));
    
    // Mock console output
    consoleOutput = [];
    consoleErrors = [];
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    console.log = (...args) => consoleOutput.push(args.join(" "));
    console.error = (...args) => consoleErrors.push(args.join(" "));
  });

  after(() => {
    // Cleanup
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // Helper to reset console mocks before each test
  const resetConsole = () => {
    consoleOutput.length = 0;
    consoleErrors.length = 0;
  };

  it("should create new global config file", () => {
    resetConsole();
    const mockHomedir = mock.method(os, "homedir", () => tempDir);
    const globalConfigPath = path.join(tempDir, ".bunfig.toml");
    
    // Ensure file doesn't exist
    if (fs.existsSync(globalConfigPath)) {
      fs.unlinkSync(globalConfigPath);
    }
    
    setup();
    
    assert.ok(fs.existsSync(globalConfigPath));
    const content = fs.readFileSync(globalConfigPath, "utf8");
    assert.ok(content.includes("[install.security]"));
    assert.ok(content.includes('scanner = "@aikidosec/safe-chain-bun"'));
    assert.ok(consoleOutput.some(msg => msg.includes("✅ Safe-Chain-Bun registered")));
    
    mockHomedir.mock.restore();
  });

  it("should update existing global config file", () => {
    resetConsole();
    const mockHomedir = mock.method(os, "homedir", () => tempDir);
    const globalConfigPath = path.join(tempDir, ".bunfig.toml");
    
    // Create existing config
    fs.writeFileSync(globalConfigPath, `[install]\nregistry = "https://registry.npmjs.org/"`);
    
    setup();
    
    const content = fs.readFileSync(globalConfigPath, "utf8");
    assert.ok(content.includes("[install.security]"));
    assert.ok(content.includes('scanner = "@aikidosec/safe-chain-bun"'));
    assert.ok(content.includes('registry = "https://registry.npmjs.org/"'));
    assert.ok(consoleOutput.some(msg => msg.includes("✅ Safe-Chain-Bun registered")));
    
    mockHomedir.mock.restore();
  });

  it("should setup specific existing config file", () => {
    resetConsole();
    const specificConfigPath = path.join(tempDir, "project-bunfig.toml");
    fs.writeFileSync(specificConfigPath, `[build]\ntarget = "node"`);
    
    setup(specificConfigPath);
    
    const content = fs.readFileSync(specificConfigPath, "utf8");
    assert.ok(content.includes("[install.security]"));
    assert.ok(content.includes('scanner = "@aikidosec/safe-chain-bun"'));
    assert.ok(content.includes('target = "node"'));
    assert.ok(consoleOutput.some(msg => msg.includes("✅ Safe-Chain-Bun registered")));
  });

  it("should report when already configured", () => {
    resetConsole();
    const mockHomedir = mock.method(os, "homedir", () => tempDir);
    const globalConfigPath = path.join(tempDir, ".bunfig.toml");
    
    // Create already configured file
    fs.writeFileSync(globalConfigPath, `[install.security]\nscanner = "@aikidosec/safe-chain-bun"`);
    
    setup();
    
    assert.ok(consoleOutput.some(msg => msg.includes("ℹ️  Safe-Chain-Bun is already configured")));
    
    mockHomedir.mock.restore();
  });

  it("should fail when specific config file doesn't exist", () => {
    resetConsole();
    const nonExistentPath = path.join(tempDir, "does-not-exist.toml");
    
    let exitCode;
    const mockExit = mock.method(process, "exit", (code) => {
      exitCode = code;
    });
    
    setup(nonExistentPath);
    
    assert.strictEqual(exitCode, 1);
    assert.ok(consoleErrors.some(msg => msg.includes("❌ Config file not found")));
    
    mockExit.mock.restore();
  });

  it("should handle permission errors gracefully", () => {
    resetConsole();
    const mockHomedir = mock.method(os, "homedir", () => tempDir);
    const globalConfigPath = path.join(tempDir, ".bunfig.toml");
    
    // Create a directory where the file should be to cause EACCES error
    if (fs.existsSync(globalConfigPath)) {
      fs.unlinkSync(globalConfigPath);
    }
    fs.mkdirSync(globalConfigPath);
    
    let exitCode;
    const mockExit = mock.method(process, "exit", (code) => {
      exitCode = code;
    });
    
    setup();
    
    assert.strictEqual(exitCode, 1);
    assert.ok(consoleErrors.some(msg => msg.includes("❌ Failed to setup Safe-Chain-Bun")));
    
    // Cleanup
    fs.rmSync(globalConfigPath, { recursive: true, force: true });
    
    mockExit.mock.restore();
    mockHomedir.mock.restore();
  });
});

describe("Line endings compatibility", () => {
  it("should handle Unix line endings (\\n)", () => {
    const input = `[install]\nregistry = "https://registry.npmjs.org/"\n\n[build]\ntarget = "node"`;
    const result = addScannerToToml(input);
    assert.strictEqual(result.changed, true);
    assert.ok(result.content.includes("[install.security]"));
    assert.ok(result.content.includes('scanner = "@aikidosec/safe-chain-bun"'));
    assert.ok(result.content.includes("registry = \"https://registry.npmjs.org/\""));
  });

  it("should handle Windows line endings (\\r\\n)", () => {
    const input = `[install]\r\nregistry = "https://registry.npmjs.org/"\r\n\r\n[build]\r\ntarget = "node"`;
    const result = addScannerToToml(input);
    assert.strictEqual(result.changed, true);
    assert.ok(result.content.includes("[install.security]"));
    assert.ok(result.content.includes('scanner = "@aikidosec/safe-chain-bun"'));
    assert.ok(result.content.includes("registry = \"https://registry.npmjs.org/\""));
  });

  it("should handle mixed line endings", () => {
    const input = `[install]\r\nregistry = "https://registry.npmjs.org/"\n\n[build]\r\ntarget = "node"`;
    const result = addScannerToToml(input);
    assert.strictEqual(result.changed, true);
    assert.ok(result.content.includes("[install.security]"));
    assert.ok(result.content.includes('scanner = "@aikidosec/safe-chain-bun"'));
    assert.ok(result.content.includes("registry = \"https://registry.npmjs.org/\""));
  });

  it("should handle existing [install.security] with Windows line endings", () => {
    const input = `[install.security]\r\nscanner = "@other/scanner"\r\n\r\n[build]\r\ntarget = "node"`;
    const result = addScannerToToml(input);
    assert.strictEqual(result.changed, true);
    assert.ok(result.content.includes('scanner = "@aikidosec/safe-chain-bun"'));
    assert.ok(!result.content.includes("@other/scanner"));
  });

  it("should detect already configured scanner with Windows line endings", () => {
    const input = `[install.security]\r\nscanner = "@aikidosec/safe-chain-bun"\r\n\r\n[build]\r\ntarget = "node"`;
    const result = addScannerToToml(input);
    assert.strictEqual(result.changed, false);
    assert.strictEqual(result.content, input);
  });

  it("should normalize to system line endings like safe-chain", () => {
    const input = `[build]\r\ntarget = "node"\r\n`;
    const result = addScannerToToml(input);
    assert.strictEqual(result.changed, true);
    assert.ok(result.content.includes("[install.security]"));
    assert.ok(result.content.includes('scanner = "@aikidosec/safe-chain-bun"'));
    
    const lines = result.content.split(/\r?\n/);
    const securitySectionIndex = lines.findIndex(line => line === "[install.security]");
    assert.ok(securitySectionIndex >= 0, "Should find [install.security] section");
  });

  it("should properly detect patterns across different line endings", () => {
    // Test regex patterns work correctly with different line endings
    const windowsContent = `[install.security]\r\nscanner = "@aikidosec/safe-chain-bun"\r\n`;
    const unixContent = `[install.security]\nscanner = "@aikidosec/safe-chain-bun"\n`;
    
    const windowsResult = addScannerToToml(windowsContent);
    const unixResult = addScannerToToml(unixContent);
    
    // Both should detect as already configured
    assert.strictEqual(windowsResult.changed, false);
    assert.strictEqual(unixResult.changed, false);
  });
});