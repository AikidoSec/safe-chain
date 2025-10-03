import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

describe("dryRunScanner", async () => {
  const mockWriteError = mock.fn();
  const mockDryRunNpmCommandAndOutput = mock.fn();

  // Mock ui module
  mock.module("../../../environment/userInteraction.js", {
    namedExports: {
      ui: {
        writeError: mockWriteError,
      },
    },
  });

  // Mock dryRunNpmCommandAndOutput function
  mock.module("../runNpmCommand.js", {
    namedExports: {
      dryRunNpmCommandAndOutput: mockDryRunNpmCommandAndOutput,
    },
  });

  const { dryRunScanner } = await import("./dryRunScanner.js");

  describe("doesCommandReturnNonZero", () => {
    // We need to access the internal function for testing
    // Since it's not exported, we'll test it indirectly through the main functionality

    it("should handle npm audit fix commands that return non-zero", async () => {
      mockDryRunNpmCommandAndOutput.mock.resetCalls();
      mockWriteError.mock.resetCalls();
      mockDryRunNpmCommandAndOutput.mock.mockImplementationOnce(() => ({
        status: 1,
        output: "found 5 vulnerabilities that can be fixed",
      }));

      const scanner = dryRunScanner();
      const result = await scanner.scan(["audit", "fix"]);

      // Should not throw an error for audit fix commands
      assert.ok(Array.isArray(result));
      assert.equal(mockWriteError.mock.callCount(), 0);
    });

    it("should throw error for unexpected non-zero exit codes", async () => {
      mockDryRunNpmCommandAndOutput.mock.resetCalls();
      mockWriteError.mock.resetCalls();
      mockDryRunNpmCommandAndOutput.mock.mockImplementationOnce(() => ({
        status: 1,
        output: "some error output",
      }));

      const scanner = dryRunScanner();

      await assert.rejects(async () => {
        await scanner.scan(["install", "lodash"]);
      }, /Dry-run command failed with exit code 1/);
    });

    it("should handle zero exit codes normally", async () => {
      mockDryRunNpmCommandAndOutput.mock.resetCalls();
      mockWriteError.mock.resetCalls();
      mockDryRunNpmCommandAndOutput.mock.mockImplementationOnce(() => ({
        status: 0,
        output: "added 1 package",
      }));

      const scanner = dryRunScanner();
      const result = await scanner.scan(["install", "lodash"]);

      assert.ok(Array.isArray(result));
      assert.equal(mockWriteError.mock.callCount(), 0);
    });

    it("should throw error for non-zero exit with no output for audit fix", async () => {
      mockDryRunNpmCommandAndOutput.mock.resetCalls();
      mockWriteError.mock.resetCalls();
      mockDryRunNpmCommandAndOutput.mock.mockImplementationOnce(() => ({
        status: 1,
        output: "",
      }));

      const scanner = dryRunScanner();

      await assert.rejects(async () => {
        await scanner.scan(["audit", "fix"]);
      }, /Dry-run command failed with exit code 1/);
    });
  });

  describe("scanner functionality", () => {
    it("should use dryRunCommand option when provided", async () => {
      mockDryRunNpmCommandAndOutput.mock.resetCalls();
      mockWriteError.mock.resetCalls();
      mockDryRunNpmCommandAndOutput.mock.mockImplementationOnce(() => ({
        status: 0,
        output: "no changes",
      }));

      const scanner = dryRunScanner({ dryRunCommand: "install" });
      await scanner.scan(["install-test", "lodash"]);

      // Should call with "install" instead of "install-test"
      assert.equal(mockDryRunNpmCommandAndOutput.mock.callCount(), 1);
      const calledArgs =
        mockDryRunNpmCommandAndOutput.mock.calls[0].arguments[0];
      assert.deepEqual(calledArgs, ["install", "lodash"]);
    });

    it("should skip scanning when hasDryRunArg returns true", async () => {
      mockDryRunNpmCommandAndOutput.mock.resetCalls();
      mockWriteError.mock.resetCalls();

      const scanner = dryRunScanner();
      const shouldScan = scanner.shouldScan(["install", "--dry-run"]);

      assert.equal(shouldScan, false);
      // Should not call dryRunNpmCommandAndOutput since scanning is skipped
      assert.equal(mockDryRunNpmCommandAndOutput.mock.callCount(), 0);
    });

    it("should skip scanning when skipScanWhen returns true", async () => {
      const scanner = dryRunScanner({
        skipScanWhen: (args) => args.includes("--skip"),
      });
      const shouldScan = scanner.shouldScan(["install", "--skip"]);

      assert.equal(shouldScan, false);
    });

    it("should scan when conditions are met", async () => {
      const scanner = dryRunScanner();
      const shouldScan = scanner.shouldScan(["install", "lodash"]);

      assert.equal(shouldScan, true);
    });
  });
});
