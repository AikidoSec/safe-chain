import { describe, it, before, beforeEach, afterEach } from "node:test";
import { DockerTestContainer } from "./DockerTestContainer.js";
import assert from "node:assert";

describe("E2E: safe-chain teardown command", () => {
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

  it("safe-chain teardown removes scripts directory created by setup", async () => {
    const shell = await container.openShell("bash");

    // Run setup
    await shell.runCommand("safe-chain setup");

    // Verify scripts directory exists
    const checkScriptsExist = await shell.runCommand("test -d ~/.safe-chain/scripts && echo 'exists' || echo 'missing'");
    assert.ok(checkScriptsExist.output.includes("exists"), "Scripts directory should exist after setup");

    // Run teardown
    await shell.runCommand("safe-chain teardown");

    // Verify scripts directory is gone
    const checkScriptsGone = await shell.runCommand("test -d ~/.safe-chain/scripts && echo 'exists' || echo 'missing'");
    assert.ok(checkScriptsGone.output.includes("missing"), "Scripts directory should be removed after teardown");
  });

  it("safe-chain teardown removes shims directory created by setup-ci --include-python", async () => {
    const shell = await container.openShell("bash");

    // Run setup-ci with --include-python
    await shell.runCommand("safe-chain setup-ci --include-python");

    // Verify shims directory exists
    const checkShimsExist = await shell.runCommand("test -d ~/.safe-chain/shims && echo 'exists' || echo 'missing'");
    assert.ok(checkShimsExist.output.includes("exists"), "Shims directory should exist after setup-ci --include-python");

    // Verify Python shims were created
    const checkPythonShims = await shell.runCommand("test -f ~/.safe-chain/shims/pip && echo 'exists' || echo 'missing'");
    assert.ok(checkPythonShims.output.includes("exists"), "Python shims should exist after setup-ci --include-python");

    // Run teardown
    await shell.runCommand("safe-chain teardown");

    // Verify shims directory is gone
    const checkShimsGone = await shell.runCommand("test -d ~/.safe-chain/shims && echo 'exists' || echo 'missing'");
    assert.ok(checkShimsGone.output.includes("missing"), "Shims directory should be removed after teardown");
  });

  it("safe-chain teardown removes scripts directory created by setup --include-python", async () => {
    const shell = await container.openShell("bash");

    // Run setup with --include-python
    await shell.runCommand("safe-chain setup --include-python");

    // Verify scripts directory exists
    const checkScriptsExist = await shell.runCommand("test -d ~/.safe-chain/scripts && echo 'exists' || echo 'missing'");
    assert.ok(checkScriptsExist.output.includes("exists"), "Scripts directory should exist after setup --include-python");

    // Run teardown
    await shell.runCommand("safe-chain teardown");

    // Verify scripts directory is gone
    const checkScriptsGone = await shell.runCommand("test -d ~/.safe-chain/scripts && echo 'exists' || echo 'missing'");
    assert.ok(checkScriptsGone.output.includes("missing"), "Scripts directory should be removed after teardown");
  });
});
