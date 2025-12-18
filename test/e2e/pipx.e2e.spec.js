import { describe, it, before, beforeEach, afterEach } from "node:test";
import { DockerTestContainer } from "./DockerTestContainer.js";
import assert from "node:assert";

describe("E2E: pipx coverage", () => {
  let container;

  before(async () => {
    DockerTestContainer.buildImage();
  });

  beforeEach(async () => {
    container = new DockerTestContainer();
    await container.start();

    const installationShell = await container.openShell("zsh");
    await installationShell.runCommand("safe-chain setup");
  });

  afterEach(async () => {
    if (container) {
      await container.stop();
      container = null;
    }
  });

  it(`successfully installs known safe packages with pipx install`, async () => {
    const shell = await container.openShell("zsh");

    const result = await shell.runCommand(
      "pipx install ruff --safe-chain-logging=verbose"
    );

    assert.ok(
      result.output.includes("no malware found.") || result.output.includes("installed successfully"),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`safe-chain blocks installation of malicious Python packages via pipx`, async () => {
    const shell = await container.openShell("zsh");

    const result = await shell.runCommand(
      "pipx install safe-chain-pi-test"
    );

    assert.ok(
      result.output.includes("blocked by safe-chain"),
      `Expected malware to be blocked. Output was:\n${result.output}`
    );
    assert.ok(
      result.output.includes("Exiting without installing malicious packages."),
      `Expected exit message. Output was:\n${result.output}`
    );
  });

  it(`pipx upgrade upgrades installed packages`, async () => {
    const shell = await container.openShell("zsh");

    await shell.runCommand("pipx install ruff==0.1.0");

    const result = await shell.runCommand(
      "pipx upgrade ruff"
    );

    assert.ok(
      result.output.includes("no malware found.") || result.output.includes("Upgraded") || result.output.includes("upgraded"),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`pipx run downloads and executes a safe tool`, async () => {
    const shell = await container.openShell("zsh");

    const result = await shell.runCommand(
      "pipx run ruff --version"
    );

    assert.ok(
      result.output.includes("no malware found.") || /ruff/i.test(result.output),
      `Expected safe run to succeed. Output was:\n${result.output}`
    );
  });

  it(`pipx run blocks malicious tool download`, async () => {
    const shell = await container.openShell("zsh");

    const result = await shell.runCommand(
      "pipx run safe-chain-pi-test --version"
    );

    assert.ok(
      result.output.includes("blocked by safe-chain"),
      `Expected malicious run to be blocked. Output was:\n${result.output}`
    );
    assert.ok(
      result.output.includes("Exiting without installing malicious packages."),
      `Expected exit message. Output was:\n${result.output}`
    );
  });

  it(`pipx runpip installs safe dependency inside an app venv`, async () => {
    const shell = await container.openShell("zsh");

    // Prepare an app environment
    await shell.runCommand("pipx install ruff");

    const result = await shell.runCommand(
      "pipx runpip ruff install requests==2.32.3"
    );

    assert.ok(
      result.output.includes("no malware found.") || /Successfully installed/i.test(result.output) || /requests/i.test(result.output),
      `Expected safe dependency install inside app venv. Output was:\n${result.output}`
    );
  });

  it(`pipx runpip blocks malicious dependency install`, async () => {
    const shell = await container.openShell("zsh");

    // Prepare an app environment
    await shell.runCommand("pipx install ruff");

    const result = await shell.runCommand(
      "pipx runpip ruff install safe-chain-pi-test"
    );

    assert.ok(
      result.output.includes("blocked by safe-chain"),
      `Expected malicious dependency to be blocked. Output was:\n${result.output}`
    );
    assert.ok(
      result.output.includes("Exiting without installing malicious packages."),
      `Expected exit message. Output was:\n${result.output}`
    );
  });

  it(`pipx list shows installed packages`, async () => {
    const shell = await container.openShell("zsh");

    await shell.runCommand("pipx install ruff");

    const result = await shell.runCommand(
      "pipx list"
    );

    assert.ok(
      result.output.includes("ruff"),
      `Expected ruff in list output. Output was:\n${result.output}`
    );
  });

  it(`pipx uninstall removes packages`, async () => {
    const shell = await container.openShell("zsh");

    await shell.runCommand("pipx install ruff --safe-chain-logging=verbose");
    await shell.runCommand("pipx uninstall ruff --safe-chain-logging=verbose");

    const result = await shell.runCommand(
      "pipx list"
    );

    assert.ok(
      !result.output.includes("ruff"),
      `Expected ruff to be removed from list. Output was:\n${result.output}`
    );
  });

  it('pipx inject installs safe packages into existing venvs', async () => {
    const shell = await container.openShell("zsh");

    await shell.runCommand("pipx install ruff --safe-chain-logging=verbose");
    const result = await shell.runCommand(
      "pipx inject ruff requests==2.32.3 --safe-chain-logging=verbose"
    );

    assert.ok(
      result.output.includes("no malware found.") || /Successfully installed/i.test(result.output) || /requests/i.test(result.output),
      `Expected safe package to be injected. Output was:\n${result.output}`
    );
  });

  it('pipx inject blocks malicious packages from being installed into existing venvs', async () => {
    const shell = await container.openShell("zsh");

    await shell.runCommand("pipx install ruff --safe-chain-logging=verbose");
    const result = await shell.runCommand(
      "pipx inject ruff safe-chain-pi-test --safe-chain-logging=verbose"
    );

    assert.ok(
      result.output.includes("blocked by safe-chain"),
      `Expected malicious package to be blocked. Output was:\n${result.output}`
    );
    assert.ok(
      result.output.includes("Exiting without installing malicious packages."),
      `Expected exit message. Output was:\n${result.output}`
    );
  });
});
