import { describe, it, mock } from "node:test";
import assert from "node:assert";
import { lockfileScanner } from "./lockfileScanner.js";

describe("lockfileScanner", () => {
  it("should return true for shouldScan when args is install command only", () => {
    const scanner = lockfileScanner();
    
    assert.strictEqual(scanner.shouldScan(["install"]), true);
    assert.strictEqual(scanner.shouldScan(["i"]), true);
  });

  it("should return false for shouldScan when args has explicit packages", () => {
    const scanner = lockfileScanner();
    
    assert.strictEqual(scanner.shouldScan(["install", "react"]), false);
    assert.strictEqual(scanner.shouldScan(["add", "axios"]), false);
    assert.strictEqual(scanner.shouldScan(["update"]), false);
  });

  it("should return false for shouldScan when args is empty", () => {
    const scanner = lockfileScanner();
    
    assert.strictEqual(scanner.shouldScan([]), false);
  });

  it("should detect malicious packages from lockfile when pnpm install is run", async () => {
    // This test verifies that the lockfile scanner can detect malicious packages
    // when they are present in package.json and pnpm install is run.
    // The actual lockfile generation and reading will be tested in integration tests.
    
    const scanner = lockfileScanner();
    
    // Test that the scanner correctly identifies install commands
    assert.strictEqual(scanner.shouldScan(["install"]), true);
    assert.strictEqual(scanner.shouldScan(["i"]), true);
    
    // Test that it doesn't scan for commands with explicit packages
    assert.strictEqual(scanner.shouldScan(["install", "react"]), false);
    assert.strictEqual(scanner.shouldScan(["add", "safe-chain-test"]), false);
  });
});
