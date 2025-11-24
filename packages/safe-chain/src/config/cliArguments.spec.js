import { describe, it } from "node:test";
import assert from "node:assert";
import {
  initializeCliArguments,
  getLoggingLevel,
  getSkipMinimumPackageAge,
} from "./cliArguments.js";

describe("initializeCliArguments", () => {
  it("should return all args when no safe-chain args are present", () => {
    const args = ["install", "express", "--save"];
    const result = initializeCliArguments(args);

    assert.deepEqual(result, ["install", "express", "--save"]);
  });

  it("should filter out safe-chain args and return remaining args", () => {
    const args = ["install", "--safe-chain-debug", "express", "--save"];
    const result = initializeCliArguments(args);

    assert.deepEqual(result, ["install", "express", "--save"]);
  });

  it("should handle multiple safe-chain args", () => {
    const args = [
      "--safe-chain-verbose",
      "install",
      "--safe-chain-timeout=5000",
      "express",
    ];
    const result = initializeCliArguments(args);

    assert.deepEqual(result, ["install", "express"]);
  });

  it("should handle empty args array", () => {
    const args = [];
    const result = initializeCliArguments(args);

    assert.deepEqual(result, []);
  });

  it("should handle args with only safe-chain arguments", () => {
    const args = ["--safe-chain-debug", "--safe-chain-verbose"];
    const result = initializeCliArguments(args);

    assert.deepEqual(result, []);
  });

  it("should handle args that start with safe-chain prefix but have additional content", () => {
    const args = ["--safe-chain-malware-action=block", "install", "package"];
    const result = initializeCliArguments(args);

    assert.deepEqual(result, ["install", "package"]);
  });

  it("should handle args that contain safe-chain prefix but don't start with it", () => {
    const args = ["install", "my--safe-chain-package", "--save"];
    const result = initializeCliArguments(args);

    assert.deepEqual(result, ["install", "my--safe-chain-package", "--save"]);
  });

  it("should not set loggingLevel when no logging argument is passed", () => {
    const args = ["install", "express", "--save"];
    initializeCliArguments(args);

    assert.strictEqual(getLoggingLevel(), undefined);
  });

  it("should parse logging=silent and set state", () => {
    const args = ["--safe-chain-logging=silent", "install", "package"];
    const result = initializeCliArguments(args);

    assert.deepEqual(result, ["install", "package"]);
    assert.strictEqual(getLoggingLevel(), "silent");
  });

  it("should parse logging=normal and set state", () => {
    const args = ["--safe-chain-logging=normal", "install", "package"];
    const result = initializeCliArguments(args);

    assert.deepEqual(result, ["install", "package"]);
    assert.strictEqual(getLoggingLevel(), "normal");
  });

  it("should handle multiple logging args, using the last one", () => {
    const args = [
      "--safe-chain-logging=normal",
      "--safe-chain-logging=silent",
      "install",
    ];
    const result = initializeCliArguments(args);

    assert.deepEqual(result, ["install"]);
    assert.strictEqual(getLoggingLevel(), "silent");
  });

  it("should handle logging level case-insensitively", () => {
    const args = ["--safe-chain-logging=SILENT", "install"];
    initializeCliArguments(args);

    assert.strictEqual(getLoggingLevel(), "silent");
  });

  it("should capture invalid logging level as-is (lowercased)", () => {
    const args = ["--safe-chain-logging=invalid", "install"];
    initializeCliArguments(args);

    assert.strictEqual(getLoggingLevel(), "invalid");
  });

  it("should handle logging with other safe-chain args", () => {
    const args = [
      "--safe-chain-debug",
      "--safe-chain-logging=silent",
      "--safe-chain-malware-action=block",
      "install",
    ];
    const result = initializeCliArguments(args);

    assert.deepEqual(result, ["install"]);
    assert.strictEqual(getLoggingLevel(), "silent");
  });

  it("should not set skipMinimumPackageAge when flag is absent", () => {
    const args = ["install", "express", "--save"];
    initializeCliArguments(args);

    assert.strictEqual(getSkipMinimumPackageAge(), undefined);
  });

  it("should set skipMinimumPackageAge to true when flag is present", () => {
    const args = ["--safe-chain-skip-minimum-package-age", "install", "lodash"];
    const result = initializeCliArguments(args);

    assert.deepEqual(result, ["install", "lodash"]);
    assert.strictEqual(getSkipMinimumPackageAge(), true);
  });

  it("should handle skip-minimum-package-age flag case-insensitively", () => {
    const args = ["--SAFE-CHAIN-SKIP-MINIMUM-PACKAGE-AGE", "install"];
    initializeCliArguments(args);

    assert.strictEqual(getSkipMinimumPackageAge(), true);
  });

  it("should filter out skip-minimum-package-age flag from returned args", () => {
    const args = [
      "install",
      "--safe-chain-skip-minimum-package-age",
      "express",
      "--save",
    ];
    const result = initializeCliArguments(args);

    assert.deepEqual(result, ["install", "express", "--save"]);
  });

  it("should handle skip-minimum-package-age with other safe-chain arguments", () => {
    const args = [
      "--safe-chain-logging=verbose",
      "--safe-chain-skip-minimum-package-age",
      "install",
      "lodash",
    ];
    const result = initializeCliArguments(args);

    assert.deepEqual(result, ["install", "lodash"]);
    assert.strictEqual(getLoggingLevel(), "verbose");
    assert.strictEqual(getSkipMinimumPackageAge(), true);
  });

  it("should handle skip-minimum-package-age flag in different positions", () => {
    const args = ["install", "lodash", "--safe-chain-skip-minimum-package-age"];
    const result = initializeCliArguments(args);

    assert.deepEqual(result, ["install", "lodash"]);
    assert.strictEqual(getSkipMinimumPackageAge(), true);
  });
});
