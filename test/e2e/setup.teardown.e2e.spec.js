import { describe, it, before, beforeEach, afterEach } from "node:test";
import { DockerTestContainer } from "./DockerTestContainer.js";
import assert from "node:assert";

describe("E2E: safe-chain setup command", () => {
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
    it(`safe-chain setup wraps npm command after installation for ${shell}`, async () => {
      // setting up the container
      const installationShell = await container.openShell(shell);
      await installationShell.runCommand("safe-chain setup");

      const projectShell = await container.openShell(shell);
      await projectShell.runCommand("cd /testapp");
      const result = await projectShell.runCommand("npm i axios");

      const hasExpectedOutput = result.output.includes("Safe-chain: Scanned");
      assert.ok(
        hasExpectedOutput,
        hasExpectedOutput
          ? "Expected npm command to be wrapped by safe-chain"
          : `Output did not contain "Scanning for malicious packages...": \n${result.output}`
      );
    });

    it(`safe-chain teardown unwraps npm command after uninstallation for ${shell}`, async () => {
      // setting up the container
      const installationShell = await container.openShell(shell);
      await installationShell.runCommand("safe-chain setup");
      await installationShell.runCommand("safe-chain teardown");

      const projectShell = await container.openShell(shell);
      await projectShell.runCommand("cd /testapp");
      await projectShell.runCommand("npm i axios");
      const result = await projectShell.runCommand("npm i axios");

      assert.ok(
        !result.output.includes("Scanning for malicious packages..."),
        "Expected npm command to not be wrapped by safe-chain after teardown"
      );
    });
  }
});
