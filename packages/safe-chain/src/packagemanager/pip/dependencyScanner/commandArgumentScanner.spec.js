import { test } from "node:test";
import assert from "node:assert";
import { commandArgumentScanner, checkChangesFromArgs } from "./commandArgumentScanner.js";

test("commandArgumentScanner factory", async (t) => {
  await t.test("should create scanner with required interface", () => {
    const scanner = commandArgumentScanner();
    
    assert.ok(scanner);
    assert.strictEqual(typeof scanner.shouldScan, "function");
    assert.strictEqual(typeof scanner.scan, "function");
  });
});

test("shouldScan", async (t) => {
  await t.test("should return true for normal install command", () => {
    const scanner = commandArgumentScanner();
    
    const result = scanner.shouldScan(["install", "requests"]);
    assert.strictEqual(result, true);
  });

  await t.test("should return false for install with --dry-run", () => {
    const scanner = commandArgumentScanner();
    
    const result = scanner.shouldScan(["install", "--dry-run", "requests"]);
    assert.strictEqual(result, false);
  });

  await t.test("should return true for install with --dry-run when ignoreDryRun is true", () => {
    const scanner = commandArgumentScanner({ ignoreDryRun: true });
    
    const result = scanner.shouldScan(["install", "--dry-run", "requests"]);
    assert.strictEqual(result, true);
  });
});

test("scan", async (t) => {
  await t.test("should scan simple package installation", () => {
    const scanner = commandArgumentScanner();
    
    const result = scanner.scan(["install", "requests"]);
    assert.ok(Array.isArray(result));
    assert.strictEqual(result.length, 1);
    assert.deepEqual(result[0], {
      name: "requests",
      version: "latest",
      type: "add",
    });
  });

  await t.test("should scan package with exact version", () => {
    const scanner = commandArgumentScanner();
    
    const result = scanner.scan(["install", "requests==2.28.0"]);
    assert.strictEqual(result.length, 1);
    assert.deepEqual(result[0], {
      name: "requests",
      version: "2.28.0",
      type: "add",
    });
  });

  await t.test("should scan multiple packages", () => {
    const scanner = commandArgumentScanner();
    
    const result = scanner.scan(["install", "requests==2.28.0", "flask"]);
    assert.strictEqual(result.length, 2);
    assert.deepEqual(result[0], {
      name: "requests",
      version: "2.28.0",
      type: "add",
    });
    assert.deepEqual(result[1], {
      name: "flask",
      version: "latest",
      type: "add",
    });
  });

  await t.test("should skip packages with range specifiers", () => {
    const scanner = commandArgumentScanner();
    
    const result = scanner.scan(["install", "requests>=2.0.0", "flask==2.0.0"]);
    assert.strictEqual(result.length, 1);
    assert.deepEqual(result[0], {
      name: "flask",
      version: "2.0.0",
      type: "add",
    });
  });

  await t.test("should skip flags with parameters", () => {
    const scanner = commandArgumentScanner();
    
    const result = scanner.scan([
      "install",
      "-r",
      "requirements.txt",
      "requests==2.28.0",
    ]);
    assert.strictEqual(result.length, 1);
    assert.deepEqual(result[0], {
      name: "requests",
      version: "2.28.0",
      type: "add",
    });
  });

  await t.test("should handle === exact version specifier", () => {
    const scanner = commandArgumentScanner();
    
    const result = scanner.scan(["install", "requests===2.28.0"]);
    assert.strictEqual(result.length, 1);
    assert.deepEqual(result[0], {
      name: "requests",
      version: "2.28.0",
      type: "add",
    });
  });
});

test("checkChangesFromArgs helper", async (t) => {
  await t.test("should extract packages from args", () => {
    const result = checkChangesFromArgs(["install", "requests==2.28.0", "flask"]);
    
    assert.strictEqual(result.length, 2);
    assert.deepEqual(result[0], {
      name: "requests",
      version: "2.28.0",
      type: "add",
    });
    assert.deepEqual(result[1], {
      name: "flask",
      version: "latest",
      type: "add",
    });
  });

  await t.test("should handle empty args", () => {
    const result = checkChangesFromArgs([]);
    assert.deepStrictEqual(result, []);
  });
});
