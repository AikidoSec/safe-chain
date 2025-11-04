import { describe, it, before, beforeEach, afterEach } from "node:test";
import { DockerTestContainer } from "./DockerTestContainer.js";
import assert from "node:assert";

describe("E2E: safe-chain setup-ci command for pip/pip3", () => {
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
    it(`safe-chain setup-ci wraps pip3 command with PATH shim after installation for ${shell}`, async () => {
      // Setup safe-chain CI shims
      const installationShell = await container.openShell(shell);
      await installationShell.runCommand("safe-chain setup-ci");

      // Add $HOME/.safe-chain/shims to PATH for subsequent shells
      await installationShell.runCommand(
        "echo 'export PATH=\"$HOME/.safe-chain/shims:$PATH\"' >> ~/.zshrc"
      );
      await installationShell.runCommand(
        "echo 'export PATH=\"$HOME/.safe-chain/shims:$PATH\"' >> ~/.bashrc"
      );

      const projectShell = await container.openShell(shell);
      // Use --break-system-packages to avoid Debian/Ubuntu external management restrictions
      const result = await projectShell.runCommand(
        "pip3 install --break-system-packages certifi"
      );

      const hasExpectedOutput = result.output.includes(
        "Scanning for malicious packages..."
      );
      assert.ok(
        hasExpectedOutput,
        hasExpectedOutput
          ? "Expected pip3 command to be wrapped by safe-chain"
          : `Output did not contain \"Scanning for malicious packages...\": \n${result.output}`
      );
    });

    it(`setup-ci routes python -m pip through safe-chain for ${shell}`, async () => {
      const installationShell = await container.openShell(shell);
      await installationShell.runCommand("safe-chain setup-ci");
      await installationShell.runCommand(
        "echo 'export PATH=\"$HOME/.safe-chain/shims:$PATH\"' >> ~/.zshrc"
      );
      await installationShell.runCommand(
        "echo 'export PATH=\"$HOME/.safe-chain/shims:$PATH\"' >> ~/.bashrc"
      );

      const projectShell = await container.openShell(shell);
      const result = await projectShell.runCommand(
        "python -m pip install --break-system-packages certifi"
      );

      assert.ok(
        result.output.includes("Scanning for malicious packages..."),
        `Output did not contain scan message. Output was:\n${result.output}`
      );
    });

    it(`setup-ci routes python -m pip3 through safe-chain for ${shell}`, async () => {
      const installationShell = await container.openShell(shell);
      await installationShell.runCommand("safe-chain setup-ci");
      await installationShell.runCommand(
        "echo 'export PATH=\"$HOME/.safe-chain/shims:$PATH\"' >> ~/.zshrc"
      );
      await installationShell.runCommand(
        "echo 'export PATH=\"$HOME/.safe-chain/shims:$PATH\"' >> ~/.bashrc"
      );

      const projectShell = await container.openShell(shell);
      const result = await projectShell.runCommand(
        "python -m pip3 install --break-system-packages certifi"
      );

      assert.ok(
        result.output.includes("Scanning for malicious packages..."),
        `Output did not contain scan message. Output was:\n${result.output}`
      );
    });

    it(`setup-ci routes python3 -m pip through safe-chain for ${shell}`, async () => {
      const installationShell = await container.openShell(shell);
      await installationShell.runCommand("safe-chain setup-ci");
      await installationShell.runCommand(
        "echo 'export PATH=\"$HOME/.safe-chain/shims:$PATH\"' >> ~/.zshrc"
      );
      await installationShell.runCommand(
        "echo 'export PATH=\"$HOME/.safe-chain/shims:$PATH\"' >> ~/.bashrc"
      );

      const projectShell = await container.openShell(shell);
      const result = await projectShell.runCommand(
        "python3 -m pip install --break-system-packages certifi"
      );

      assert.ok(
        result.output.includes("Scanning for malicious packages..."),
        `Output did not contain scan message. Output was:\n${result.output}`
      );
    });

    it(`setup-ci routes python3 -m pip3 through safe-chain for ${shell}`, async () => {
      const installationShell = await container.openShell(shell);
      await installationShell.runCommand("safe-chain setup-ci");
      await installationShell.runCommand(
        "echo 'export PATH=\"$HOME/.safe-chain/shims:$PATH\"' >> ~/.zshrc"
      );
      await installationShell.runCommand(
        "echo 'export PATH=\"$HOME/.safe-chain/shims:$PATH\"' >> ~/.bashrc"
      );

      const projectShell = await container.openShell(shell);
      const result = await projectShell.runCommand(
        "python3 -m pip3 install --break-system-packages certifi"
      );

      assert.ok(
        result.output.includes("Scanning for malicious packages..."),
        `Output did not contain scan message. Output was:\n${result.output}`
      );
    });
  }
});
