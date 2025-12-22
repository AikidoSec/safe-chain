import { describe, it, before, beforeEach, afterEach } from "node:test";
import { DockerTestContainer } from "./DockerTestContainer.js";
import assert from "node:assert";

describe("E2E: deprecated --include-python handling", () => {
  let container;

  before(async () => {
    DockerTestContainer.buildImage();
  });

  beforeEach(async () => {
    container = new DockerTestContainer();
    await container.start();
  });

  afterEach(async () => {
    if (container) {
      await container.stop();
      container = null;
    }
  });

  for (let shell of ["bash", "zsh"]) {
    it(`safe-chain setup warns and continues for ${shell}`, async () => {
      const sh = await container.openShell(shell);
      const result = await sh.runCommand("safe-chain setup --include-python");

      assert.ok(
        result.output.toLowerCase().includes("deprecated and ignored"),
        `Expected warning about deprecated --include-python. Output was:\n${result.output}`
      );
    });

    it(`safe-chain setup-ci warns and continues for ${shell}`, async () => {
      const sh = await container.openShell(shell);
      const result = await sh.runCommand("safe-chain setup-ci --include-python");

      assert.ok(
        result.output.toLowerCase().includes("deprecated and ignored"),
        `Expected warning about deprecated --include-python. Output was:\n${result.output}`
      );
    });
  }
});
