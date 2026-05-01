import { describe, it, before, beforeEach, afterEach } from "node:test";
import { DockerTestContainer } from "./DockerTestContainer.js";
import assert from "node:assert";

describe("E2E: uvx coverage", () => {
  let container;

  before(async () => {
    DockerTestContainer.buildImage();
  });

  beforeEach(async () => {
    container = new DockerTestContainer();
    await container.start();

    const installationShell = await container.openShell("zsh");
    await installationShell.runCommand("safe-chain setup");

    // Clear uv cache
    await installationShell.runCommand("uv cache clean");
  });

  afterEach(async () => {
    if (container) {
      await container.stop();
      container = null;
    }
  });

  it(`successfully runs a known safe tool with uvx`, async () => {
    const shell = await container.openShell("zsh");

    const result = await shell.runCommand(
      "uvx ruff --version --safe-chain-logging=verbose"
    );

    assert.ok(
      result.output.includes("no malware found.") || /ruff/i.test(result.output),
      `Expected safe tool to run successfully. Output was:\n${result.output}`
    );
  });

  it(`safe-chain blocks malicious packages via uvx`, async () => {
    const shell = await container.openShell("zsh");

    const result = await shell.runCommand(
      "uvx numpy==2.4.4"
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

  it(`uvx with --from flag runs a safe tool`, async () => {
    const shell = await container.openShell("zsh");

    const result = await shell.runCommand(
      "uvx --from ruff ruff --version --safe-chain-logging=verbose"
    );

    assert.ok(
      result.output.includes("no malware found.") || /ruff/i.test(result.output),
      `Expected safe tool to run successfully with --from. Output was:\n${result.output}`
    );
  });

  it(`uvx with --from flag blocks malicious packages`, async () => {
    const shell = await container.openShell("zsh");

    const result = await shell.runCommand(
      "uvx --from numpy==2.4.4 some-command"
    );

    assert.ok(
      result.output.includes("blocked by safe-chain"),
      `Expected malicious package to be blocked with --from. Output was:\n${result.output}`
    );
    assert.ok(
      result.output.includes("Exiting without installing malicious packages."),
      `Expected exit message. Output was:\n${result.output}`
    );
  });

  it(`uvx with specific version runs successfully`, async () => {
    const shell = await container.openShell("zsh");

    const result = await shell.runCommand(
      "uvx ruff@0.4.0 --version --safe-chain-logging=verbose"
    );

    assert.ok(
      result.output.includes("no malware found.") || /ruff/i.test(result.output),
      `Expected safe tool with version to run. Output was:\n${result.output}`
    );
  });

  it(`uvx with --with flag for additional dependencies`, async () => {
    const shell = await container.openShell("zsh");

    const result = await shell.runCommand(
      "uvx --with requests ruff --version --safe-chain-logging=verbose"
    );

    assert.ok(
      result.output.includes("no malware found.") || /ruff/i.test(result.output),
      `Expected safe tool with --with dependency to run. Output was:\n${result.output}`
    );
  });

  it(`uvx with --with flag blocks malicious additional dependencies`, async () => {
    const shell = await container.openShell("zsh");

    const result = await shell.runCommand(
      "uvx --with numpy==2.4.4 ruff --version"
    );

    assert.ok(
      result.output.includes("blocked by safe-chain"),
      `Expected malicious --with dependency to be blocked. Output was:\n${result.output}`
    );
    assert.ok(
      result.output.includes("Exiting without installing malicious packages."),
      `Expected exit message. Output was:\n${result.output}`
    );
  });
});
