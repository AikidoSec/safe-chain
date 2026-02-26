import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";

describe("reportCommandExecutionFailure", () => {
  let errorLines;

  beforeEach(async () => {
    errorLines = [];

    mock.module("../../environment/userInteraction.js", {
      namedExports: {
        ui: {
          writeError: (...args) => {
            errorLines.push(args.join(" "));
          },
        },
      },
    });
  });

  afterEach(() => {
    mock.reset();
  });

  it("reports command errors while preserving exit status", async () => {
    const { reportCommandExecutionFailure } = await import("./commandErrors.js");

    const result = reportCommandExecutionFailure(
      {
        status: 127,
        message: "Command failed: command -v bun",
      },
      "bun",
    );

    assert.deepStrictEqual(result, { status: 127 });
    assert.deepStrictEqual(errorLines, [
      "Error executing command: Command failed: command -v bun",
      "Is 'bun' installed and available on your system?",
    ]);
  });

  it("falls back to exit code 1 when status is missing", async () => {
    const { reportCommandExecutionFailure } = await import("./commandErrors.js");

    const result = reportCommandExecutionFailure(
      {
        message: "Network error",
      },
      "npm",
    );

    assert.deepStrictEqual(result, { status: 1 });
    assert.deepStrictEqual(errorLines, [
      "Error executing command: Network error",
      "Is 'npm' installed and available on your system?",
    ]);
  });
});
