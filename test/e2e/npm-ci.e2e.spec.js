import { describe, it, before, beforeEach, afterEach } from "node:test";
import { DockerTestContainer } from "./DockerTestContainer.js";
import assert from "node:assert";

describe("E2E: npm coverage using PATH", () => {
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
    const result = await shell.runCommand("npm i axios");

    assert.ok(
      result.output.includes("No malicious packages detected."),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`safe-chain blocks installation of malicious packages`, async () => {
    const shell = await container.openShell("zsh");
    const result = await shell.runCommand("npm i safe-chain-test");

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

    const listResult = await shell.runCommand("npm list");
    assert.ok(
      !listResult.output.includes("safe-chain-test"),
      `Malicious package was installed despite safe-chain protection. Output of 'npm list' was:\n${listResult.output}`
    );
  });

  it("safe-chain blocks npx from executing malicious packages", async () => {
    const shell = await container.openShell("zsh");
    const result = await shell.runCommand("npx safe-chain-test");

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

  it("safe-chain blocks npm exec from executing malicious packages", async () => {
    const shell = await container.openShell("zsh");
    const result = await shell.runCommand("npm exec safe-chain-test");

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
});
