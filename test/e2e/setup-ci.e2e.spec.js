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
      const result = await projectShell.runCommand(
        "npm i axios@1.13.0 --safe-chain-logging=verbose"
      );

      const hasExpectedOutput = result.output.includes("Safe-chain: Scanned");
      assert.ok(
        hasExpectedOutput,
        hasExpectedOutput
          ? "Expected npm command to be wrapped by safe-chain"
          : `Output did not contain "Scanning for malicious packages...": \n${result.output}`
      );
    });
  }

  for (let shell of ["bash", "zsh"]) {
    it(`safe-chain setup-ci removes legacy shell init left by a previous setup for ${shell}`, async () => {
      const rcFile = shell === "zsh" ? "~/.zshrc" : "~/.bashrc";

      // Simulate a previous non-CI install
      const installationShell = await container.openShell(shell);
      await installationShell.runCommand("safe-chain setup");

      // Verify the legacy init line was added
      const afterSetup = await installationShell.runCommand(`grep -c "init-posix.sh" ${rcFile} || true`);
      assert.ok(
        afterSetup.output.includes("1"),
        `Expected init-posix.sh to be present in ${rcFile} after setup`
      );

      // Now run the CI install — should clean up the legacy line
      await installationShell.runCommand("safe-chain setup-ci");
      await installationShell.runCommand(
        `echo 'export PATH="$HOME/.safe-chain/shims:$PATH"' >> ${rcFile}`
      );

      const afterSetupCi = await installationShell.runCommand(`grep -c "init-posix.sh" ${rcFile} || true`);
      assert.ok(
        !afterSetupCi.output.includes("1"),
        `Expected init-posix.sh to be removed from ${rcFile} after setup-ci, but it was still present`
      );

      // Verify npm still works through shims in a new shell
      const projectShell = await container.openShell(shell);
      const result = await projectShell.runCommand(
        "npm i axios@1.13.0 --safe-chain-logging=verbose"
      );

      assert.ok(
        result.output.includes("Safe-chain: Scanned"),
        `Expected npm to be wrapped by safe-chain shim after setup-ci.\nOutput was:\n${result.output}`
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
