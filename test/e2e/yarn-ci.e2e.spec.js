import { describe, it, before, beforeEach, afterEach } from "node:test";
import { DockerTestContainer } from "./DockerTestContainer.js";
import assert from "node:assert";

describe("E2E: yarn coverage", () => {
  let container;

  before(async () => {
    DockerTestContainer.buildImage();
  });

  beforeEach(async () => {
    // Run a new Docker container for each test
    container = new DockerTestContainer();
    await container.start();

    const installationShell = await container.openShell("zsh");
    await installationShell.runCommand("safe-chain setup-ci");

    // Add $HOME/.safe-chain/shims to PATH for the test commands
    await installationShell.runCommand(
      "echo 'export PATH=\"$HOME/.safe-chain/shims:$PATH\"' >> ~/.zshrc"
    );
  });

  afterEach(async () => {
    // Stop and clean up the container after each test
    if (container) {
      await container.stop();
      container = null;
    }
  });

  it(`safe-chain succesfully installs safe packages`, async () => {
    const shell = await container.openShell("zsh");
    const result = await shell.runCommand(
      "yarn add axios@1.13.0 --safe-chain-logging=verbose"
    );

    assert.ok(
      result.output.includes("no malware found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`safe-chain blocks installation of malicious packages`, async () => {
    const shell = await container.openShell("zsh");
    const result = await shell.runCommand("yarn add safe-chain-test");

    assert.ok(
      result.output.includes("Malicious changes detected:"),
      `Output did not include expected text. Output was:\n${result.output}`
    );
    assert.ok(
      result.output.includes("- safe-chain-test"),
      `Output did not include expected text. Output was:\n${result.output}`
    );
    assert.ok(
      result.output.includes("Exiting without installing malicious packages."),
      `Output did not include expected text. Output was:\n${result.output}`
    );

    const listResult = await shell.runCommand("yarn list");
    assert.ok(
      !listResult.output.includes("safe-chain-test"),
      `Malicious package was installed despite safe-chain protection. Output of 'yarn list' was:\n${listResult.output}`
    );
  });

  it("safe-chain blocks yarn dlx from executing malicious packages", async () => {
    const shell = await container.openShell("zsh");
    const result = await shell.runCommand("yarn dlx safe-chain-test");

    assert.ok(
      result.output.includes("Malicious changes detected:"),
      `Output did not include expected text. Output was:\n${result.output}`
    );
    assert.ok(
      result.output.includes("- safe-chain-test"),
      `Output did not include expected text. Output was:\n${result.output}`
    );
    assert.ok(
      result.output.includes("Exiting without installing malicious packages."),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  describe("with SAFE_CHAIN_DIR (custom install directory)", () => {
    const CUSTOM_DIR = "/usr/local/.safe-chain";
    let customContainer;

    beforeEach(async () => {
      customContainer = new DockerTestContainer();
      await customContainer.start();

      const setupShell = await customContainer.openShell("zsh");
      await setupShell.runCommand(`export SAFE_CHAIN_DIR=${CUSTOM_DIR}`);
      await setupShell.runCommand("safe-chain setup-ci");
      await setupShell.runCommand(
        `echo 'export SAFE_CHAIN_DIR=${CUSTOM_DIR}' >> ~/.zshrc`
      );
      await setupShell.runCommand(
        `echo 'export PATH="${CUSTOM_DIR}/shims:$PATH"' >> ~/.zshrc`
      );
    });

    afterEach(async () => {
      if (customContainer) {
        await customContainer.stop();
        customContainer = null;
      }
    });

    it("blocks malicious yarn packages when shims are in a custom directory", async () => {
      const shell = await customContainer.openShell("zsh");
      const result = await shell.runCommand("yarn add safe-chain-test");

      assert.ok(
        result.output.includes("Malicious changes detected:"),
        `Expected malicious package to be blocked. Output:\n${result.output}`
      );
      assert.ok(
        result.output.includes("Exiting without installing malicious packages."),
        `Expected malicious package to be blocked. Output:\n${result.output}`
      );
    });
  });
});
