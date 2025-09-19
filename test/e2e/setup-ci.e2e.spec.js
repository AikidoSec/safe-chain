import { describe, it, before, beforeEach, afterEach } from "node:test";
import { DockerTestContainer } from "./DockerTestContainer.js";
import assert from "node:assert";

describe("E2E: safe-chain setup-ci command", () => {
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
    it(`safe-chain setup-ci wraps npm command with PATH shim after installation for ${shell}`, async () => {
      // setting up the container
      const installationShell = await container.openShell(shell);
      await installationShell.runCommand("safe-chain setup-ci");

      // Add $HOME/.safe-chain/shims to PATH for the test commands
      // Usually this would be done by adding ENV in a Dockerfile, or by
      // the CI system picking up GITHUB_PATH or similar. Here we do it manually
      // to simulate the effect.
      await installationShell.runCommand(
        "echo 'export PATH=\"$HOME/.safe-chain/shims:$PATH\"' >> ~/.zshrc"
      );
      await installationShell.runCommand(
        "echo 'export PATH=\"$HOME/.safe-chain/shims:$PATH\"' >> ~/.bashrc"
      );

      const projectShell = await container.openShell(shell);
      const result = await projectShell.runCommand("npm i axios");

      const hasExpectedOutput = result.output.includes(
        "Scanning for malicious packages..."
      );
      assert.ok(
        hasExpectedOutput,
        hasExpectedOutput
          ? "Expected npm command to be wrapped by safe-chain"
          : `Output did not contain "Scanning for malicious packages...": \n${result.output}`
      );
    });
  }

  it("writes to GITHUB_PATH when GITHUB_PATH is set", async () => {
    const installationShell = await container.openShell("zsh");
    await installationShell.runCommand("export GITHUB_PATH=/tmp/github_path");
    await installationShell.runCommand("safe-chain setup-ci");

    const result = await installationShell.runCommand(
      "cat /tmp/github_path | grep '.safe-chain/shims'"
    );

    assert.ok(
      result.output.includes("/root/.safe-chain/shims"),
      `GITHUB_PATH did not contain expected shim path. Output was:\n${result.output}`
    );
  });

  it("writes ##vso[task.prependpath] when TF_BUILD is set", async () => {
    const installationShell = await container.openShell("zsh");
    await installationShell.runCommand("export TF_BUILD=true");

    var result = await installationShell.runCommand("safe-chain setup-ci");

    assert.ok(
      result.output.includes("##vso[task.prependpath]/root/.safe-chain/shims"),
      `TF_BUILD did not contain expected prepend path. Output was:\n${result.output}`
    );
  });
});
