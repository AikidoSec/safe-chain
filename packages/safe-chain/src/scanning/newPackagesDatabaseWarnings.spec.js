import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert";

let writeWarningCalls = [];

mock.module("../environment/userInteraction.js", {
  namedExports: {
    ui: {
      writeWarning: (msg) => writeWarningCalls.push(msg),
    },
  },
});

const { warnOnceAboutUnavailableDatabase, resetWarningState } = await import(
  "./newPackagesDatabaseWarnings.js"
);

describe("newPackagesDatabaseWarnings", () => {
  beforeEach(() => {
    writeWarningCalls = [];
    resetWarningState();
  });

  describe("warnOnceAboutUnavailableDatabase", () => {
    it("emits a warning containing the error message", () => {
      warnOnceAboutUnavailableDatabase(new Error("feed unavailable"));

      assert.strictEqual(writeWarningCalls.length, 1);
      assert.ok(writeWarningCalls[0].includes("feed unavailable"));
    });

    it("mentions fallback to metadata-based checks in the warning", () => {
      warnOnceAboutUnavailableDatabase(new Error("timeout"));

      assert.ok(
        writeWarningCalls[0].includes(
          "Continuing with metadata-based minimum age checks only"
        )
      );
    });

    it("only emits once even when called multiple times", () => {
      warnOnceAboutUnavailableDatabase(new Error("first"));
      warnOnceAboutUnavailableDatabase(new Error("second"));
      warnOnceAboutUnavailableDatabase(new Error("third"));

      assert.strictEqual(writeWarningCalls.length, 1);
    });
  });

  describe("resetWarningState", () => {
    it("allows the warning to fire again after reset", () => {
      warnOnceAboutUnavailableDatabase(new Error("first"));
      assert.strictEqual(writeWarningCalls.length, 1);

      resetWarningState();
      writeWarningCalls = [];

      warnOnceAboutUnavailableDatabase(new Error("second"));
      assert.strictEqual(writeWarningCalls.length, 1);
    });
  });
});
