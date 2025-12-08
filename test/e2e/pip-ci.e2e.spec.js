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

    // Clear pip cache before each test to ensure fresh downloads through proxy
    const shell = await container.openShell("zsh");
    await shell.runCommand("pip3 cache purge");
  });

  afterEach(async () => {
    if (container) {
      await container.stop();
      container = null;
    }
  });

  describe("E2E: pip CI support", () => {
    it("does not intercept python3 --version", async () => {
      const shell = await container.openShell("zsh");
      const result = await shell.runCommand("python3 --version");
      assert.ok(
        result.output.match(/Python \d+\.\d+\.\d+/),
        `Output was: ${result.output}`
      );
      assert.ok(
        !result.output.includes("Safe-chain"),
        "Safe Chain should not intercept generic python3 command"
      );
    });

    it("does not intercept python3 -c 'print(\"hello\")'", async () => {
      const shell = await container.openShell("zsh");
      const result = await shell.runCommand("python3 -c 'print(\"hello\")'");
      assert.ok(
        result.output.includes("hello"),
        `Output was: ${result.output}`
      );
      assert.ok(
        !result.output.includes("Safe-chain"),
        "Safe Chain should not intercept generic python3 -c command"
      );
    });

    it("does not intercept python3 test.py", async () => {
      const shell = await container.openShell("zsh");
      await shell.runCommand("echo 'print(\"Hello from test.py!\")' > test.py");
      const result = await shell.runCommand("python3 test.py");
      assert.ok(
        result.output.includes("Hello from test.py!"),
        `Output was: ${result.output}`
      );
      assert.ok(
        !result.output.includes("Safe-chain"),
        "Safe Chain should not intercept generic python3 script execution"
      );
    });

    it("does not intercept python test.py", async () => {
      const shell = await container.openShell("zsh");
      await shell.runCommand("echo 'print(\"Hello from test.py!\")' > test.py");
      const result = await shell.runCommand("python test.py");
      assert.ok(
        result.output.includes("Hello from test.py!"),
        `Output was: ${result.output}`
      );
      assert.ok(
        !result.output.includes("Safe-chain"),
        "Safe Chain should not intercept generic python script execution"
      );
    });
  });

  for (let shell of ["bash", "zsh"]) {
    it(`safe-chain setup-ci wraps pip3 command with PATH shim after installation for ${shell}`, async () => {
      // Setup safe-chain CI shims
      const installationShell = await container.openShell(shell);
      await installationShell.runCommand(
        "safe-chain setup-ci --include-python"
      );

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
        "pip3 install --break-system-packages certifi --safe-chain-logging=verbose"
      );

      const hasExpectedOutput = result.output.includes("no malware found.");
      assert.ok(
        hasExpectedOutput,
        hasExpectedOutput
          ? "Expected pip3 command to be wrapped by safe-chain"
          : `Output did not contain \"no malware found.\": \n${result.output}`
      );
    });

    it(`setup-ci routes python -m pip through safe-chain for ${shell}`, async () => {
      const installationShell = await container.openShell(shell);
      await installationShell.runCommand(
        "safe-chain setup-ci --include-python"
      );
      await installationShell.runCommand(
        "echo 'export PATH=\"$HOME/.safe-chain/shims:$PATH\"' >> ~/.zshrc"
      );
      await installationShell.runCommand(
        "echo 'export PATH=\"$HOME/.safe-chain/shims:$PATH\"' >> ~/.bashrc"
      );

      const projectShell = await container.openShell(shell);
      const result = await projectShell.runCommand(
        "python -m pip install --break-system-packages certifi --safe-chain-logging=verbose"
      );

      assert.ok(
        result.output.includes("no malware found."),
        `Output did not contain scan message. Output was:\n${result.output}`
      );
    });

    it(`setup-ci routes python3 -m pip through safe-chain for ${shell}`, async () => {
      const installationShell = await container.openShell(shell);
      await installationShell.runCommand(
        "safe-chain setup-ci --include-python"
      );
      await installationShell.runCommand(
        "echo 'export PATH=\"$HOME/.safe-chain/shims:$PATH\"' >> ~/.zshrc"
      );
      await installationShell.runCommand(
        "echo 'export PATH=\"$HOME/.safe-chain/shims:$PATH\"' >> ~/.bashrc"
      );

      const projectShell = await container.openShell(shell);
      const result = await projectShell.runCommand(
        "python3 -m pip install --break-system-packages certifi --safe-chain-logging=verbose"
      );

      assert.ok(
        result.output.includes("no malware found."),
        `Output did not contain scan message. Output was:\n${result.output}`
      );
    });

    it(`setup-ci routes pip through safe-chain for ${shell}`, async () => {
      const installationShell = await container.openShell(shell);
      await installationShell.runCommand(
        "safe-chain setup-ci --include-python"
      );
      await installationShell.runCommand(
        "echo 'export PATH=\"$HOME/.safe-chain/shims:$PATH\"' >> ~/.zshrc"
      );
      await installationShell.runCommand(
        "echo 'export PATH=\"$HOME/.safe-chain/shims:$PATH\"' >> ~/.bashrc"
      );

      const projectShell = await container.openShell(shell);
      const result = await projectShell.runCommand(
        "pip install --break-system-packages certifi --safe-chain-logging=verbose"
      );

      assert.ok(
        result.output.includes("no malware found."),
        `Output did not contain scan message. Output was:\n${result.output}`
      );
    });

    it(`setup-ci routes pip3 through safe-chain for ${shell}`, async () => {
      const installationShell = await container.openShell(shell);
      await installationShell.runCommand(
        "safe-chain setup-ci --include-python"
      );
      await installationShell.runCommand(
        "echo 'export PATH=\"$HOME/.safe-chain/shims:$PATH\"' >> ~/.zshrc"
      );
      await installationShell.runCommand(
        "echo 'export PATH=\"$HOME/.safe-chain/shims:$PATH\"' >> ~/.bashrc"
      );

      const projectShell = await container.openShell(shell);
      const result = await projectShell.runCommand(
        "pip3 install --break-system-packages certifi --safe-chain-logging=verbose"
      );

      assert.ok(
        result.output.includes("no malware found."),
        `Output did not contain scan message. Output was:\n${result.output}`
      );
    });
  }
});
