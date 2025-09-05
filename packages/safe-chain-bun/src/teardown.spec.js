import { describe, it, before, after, mock } from "node:test";
import assert from "node:assert";
import fs from "fs";
import path from "path";
import os from "os";
import { removeScannerFromToml } from "./toml-utils.js";
import { teardown } from "./teardown.js";

describe("removeScannerFromToml", () => {
  it("should return unchanged if scanner not present", () => {
    const input = `[build]\ntarget = "node"`;
    const result = removeScannerFromToml(input);
    assert.strictEqual(result.changed, false);
    assert.strictEqual(result.content, input);
  });

  it("should remove scanner line only", () => {
    const input = `[install.security]\nscanner = "@aikidosec/safe-chain-bun"\nother = "config"`;
    const result = removeScannerFromToml(input);
    assert.strictEqual(result.changed, true);
    assert.ok(!result.content.includes('scanner = "@aikidosec/safe-chain-bun"'));
    assert.ok(result.content.includes('other = "config"'));
    assert.ok(result.content.includes('[install.security]'));
  });

  it("should remove entire [install.security] section if only scanner present", () => {
    const input = `[build]\ntarget = "node"\n\n[install.security]\nscanner = "@aikidosec/safe-chain-bun"\n\n[test]\npreload = "./setup.ts"`;
    const result = removeScannerFromToml(input);
    assert.strictEqual(result.changed, true);
    assert.ok(!result.content.includes('[install.security]'));
    assert.ok(!result.content.includes('scanner = "@aikidosec/safe-chain-bun"'));
    assert.ok(result.content.includes('[build]'));
    assert.ok(result.content.includes('[test]'));
  });

  it("should handle section with comments and whitespace", () => {
    const input = `[install.security]\n# Security configuration\nscanner = "@aikidosec/safe-chain-bun"\n\n# End of security`;
    const result = removeScannerFromToml(input);
    assert.strictEqual(result.changed, true);
    assert.ok(!result.content.includes('[install.security]'));
    assert.ok(!result.content.includes('scanner = "@aikidosec/safe-chain-bun"'));
  });

  it("should preserve other scanner configurations", () => {
    const input = `[install.security]\nscanner = "@other/scanner"`;
    const result = removeScannerFromToml(input);
    assert.strictEqual(result.changed, false);
    assert.strictEqual(result.content, input);
  });

  it("should handle mixed line endings", () => {
    const input = `[install.security]\r\nscanner = "@aikidosec/safe-chain-bun"\r\n\r\n[build]\r\ntarget = "node"`;
    const result = removeScannerFromToml(input);
    assert.strictEqual(result.changed, true);
    assert.ok(!result.content.includes('[install.security]'));
    assert.ok(result.content.includes('[build]'));
    assert.ok(result.content.includes('target = "node"'));
  });

  it("should handle complex TOML with multiple sections", () => {
    const input = `[install]
registry = "https://registry.npmjs.org/"

[install.security]
scanner = "@aikidosec/safe-chain-bun"

[build]
target = "node"`;
    
    const result = removeScannerFromToml(input);
    assert.strictEqual(result.changed, true);
    assert.ok(!result.content.includes('[install.security]'));
    assert.ok(!result.content.includes('scanner = "@aikidosec/safe-chain-bun"'));
    assert.ok(result.content.includes('[install]'));
    assert.ok(result.content.includes('[build]'));
  });
});

describe("teardown function", () => {
  let tempDir;
  let originalConsoleLog;
  let originalConsoleError;
  let consoleOutput;
  let consoleErrors;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "safe-chain-bun-teardown-test-"));
    
    consoleOutput = [];
    consoleErrors = [];
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    console.log = (...args) => consoleOutput.push(args.join(" "));
    console.error = (...args) => consoleErrors.push(args.join(" "));
  });

  after(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // Helper to reset console mocks before each test
  const resetConsole = () => {
    consoleOutput.length = 0;
    consoleErrors.length = 0;
  };

  it("should remove scanner from global config", () => {
    resetConsole();
    const mockHomedir = mock.method(os, "homedir", () => tempDir);
    const globalConfigPath = path.join(tempDir, ".bunfig.toml");
    
    fs.writeFileSync(globalConfigPath, `[install.security]\nscanner = "@aikidosec/safe-chain-bun"`);
    
    teardown();
    
    const content = fs.readFileSync(globalConfigPath, "utf8");
    assert.ok(!content.includes('scanner = "@aikidosec/safe-chain-bun"'));
    assert.ok(consoleOutput.some(msg => msg.includes("✅ Safe-Chain-Bun scanner removed")));
    
    mockHomedir.mock.restore();
  });

  it("should remove scanner from specific file", () => {
    resetConsole();
    const specificConfigPath = path.join(tempDir, "project-bunfig.toml");
    fs.writeFileSync(specificConfigPath, `[build]\ntarget = "node"\n\n[install.security]\nscanner = "@aikidosec/safe-chain-bun"`);
    
    teardown(specificConfigPath);
    
    const content = fs.readFileSync(specificConfigPath, "utf8");
    assert.ok(!content.includes('scanner = "@aikidosec/safe-chain-bun"'));
    assert.ok(!content.includes('[install.security]'));
    assert.ok(content.includes('[build]'));
    assert.ok(consoleOutput.some(msg => msg.includes("✅ Safe-Chain-Bun scanner removed")));
  });

  it("should handle file not found gracefully", () => {
    resetConsole();
    const nonExistentPath = path.join(tempDir, "does-not-exist.toml");
    
    teardown(nonExistentPath);
    
    assert.ok(consoleOutput.some(msg => msg.includes("ℹ️  Config file not found")));
  });

  it("should report when scanner not found", () => {
    resetConsole();
    const specificConfigPath = path.join(tempDir, "no-scanner.toml");
    fs.writeFileSync(specificConfigPath, `[build]\ntarget = "node"`);
    
    teardown(specificConfigPath);
    
    assert.ok(consoleOutput.some(msg => msg.includes("ℹ️  Safe-Chain-Bun scanner not found")));
  });

  it("should handle permission errors gracefully", () => {
    resetConsole();
    const mockHomedir = mock.method(os, "homedir", () => tempDir);
    const globalConfigPath = path.join(tempDir, ".bunfig.toml");
    
    fs.writeFileSync(globalConfigPath, `[install.security]\nscanner = "@aikidosec/safe-chain-bun"`);
    fs.chmodSync(globalConfigPath, 0o444); // Read-only
    
    let exitCode;
    const mockExit = mock.method(process, "exit", (code) => {
      exitCode = code;
    });
    
    teardown();
    
    assert.strictEqual(exitCode, 1);
    assert.ok(consoleErrors.some(msg => msg.includes("❌ Failed to remove Safe-Chain-Bun scanner")));
    
    // Cleanup
    fs.chmodSync(globalConfigPath, 0o644);
    
    mockExit.mock.restore();
    mockHomedir.mock.restore();
  });
});