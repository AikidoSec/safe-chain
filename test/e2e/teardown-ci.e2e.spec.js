import { describe, it, before, beforeEach, afterEach } from "node:test";
import { DockerTestContainer } from "./DockerTestContainer.js";
import assert from "node:assert";

describe("E2E: safe-chain teardown command (CI)", () => {
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

  it("safe-chain teardown removes shims directory created by setup-ci", async () => {
    const shell = await container.openShell("bash");

    // Run setup-ci
    await shell.runCommand("safe-chain setup-ci");

    // Verify shims directory exists
    const checkShimsExist = await shell.runCommand("test -d ~/.safe-chain/shims && echo 'exists' || echo 'missing'");
    assert.ok(checkShimsExist.output.includes("exists"), "Shims directory should exist after setup-ci");

    // Run teardown
    await shell.runCommand("safe-chain teardown");

    // Verify shims directory is gone
    const checkShimsGone = await shell.runCommand("test -d ~/.safe-chain/shims && echo 'exists' || echo 'missing'");
    assert.ok(checkShimsGone.output.includes("missing"), "Shims directory should be removed after teardown");
  });
});
