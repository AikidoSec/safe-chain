import { describe, it, before, beforeEach, afterEach } from "node:test";
import { DockerTestContainer } from "./DockerTestContainer.js";
import assert from "node:assert";

describe("E2E: safe-chain CLI python/pip support", () => {
  let container;

  before(async () => {
    DockerTestContainer.buildImage();
  });

  beforeEach(async () => {
    container = new DockerTestContainer();
    await container.start();
    // Note: We do NOT run 'safe-chain setup' here.
    // We want to test the 'safe-chain' CLI command directly.
  });

  afterEach(async () => {
    if (container) {
      await container.stop();
      container = null;
    }
  });

  it("safe-chain pip3 install routes through proxy", async () => {
    const shell = await container.openShell("zsh");
    // Invoke safe-chain directly with pip3 command
    const result = await shell.runCommand(
      "safe-chain pip3 install --break-system-packages requests"
    );

    assert.ok(
      result.output.includes("no malware found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );
    assert.ok(
      result.output.includes("Successfully installed") ||
        result.output.includes("Requirement already satisfied"),
      `Installation failed. Output was:\n${result.output}`
    );
  });

  it("safe-chain python3 -m pip install routes through proxy", async () => {
    const shell = await container.openShell("zsh");
    const result = await shell.runCommand(
      "safe-chain python3 -m pip install --break-system-packages requests"
    );

    assert.ok(
      result.output.includes("no malware found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it("safe-chain python3 script.py bypasses proxy", async () => {
    const shell = await container.openShell("zsh");
    
    // Create a simple script
    await shell.runCommand("echo \"print('direct execution')\" > /tmp/test.py");

    const result = await shell.runCommand("safe-chain python3 /tmp/test.py");

    // Should execute the script
    assert.ok(
      result.output.includes("direct execution"),
      `Script execution failed. Output was:\n${result.output}`
    );

    // Should NOT show safe-chain logs
    assert.ok(
      !result.output.includes("Safe-chain"),
      `Should have bypassed safe-chain. Output was:\n${result.output}`
    );
  });

  it("safe-chain python3 --version bypasses proxy", async () => {
    const shell = await container.openShell("zsh");
    const result = await shell.runCommand("safe-chain python3 --version");

    assert.ok(
      result.output.match(/Python 3\.\d+\.\d+/),
      `Should show python version. Output was:\n${result.output}`
    );
    assert.ok(
      !result.output.includes("Safe-chain"),
      `Should have bypassed safe-chain. Output was:\n${result.output}`
    );
  });

  it("safe-chain blocks malicious package via pip3", async () => {
    const shell = await container.openShell("zsh");
    await shell.runCommand("pip3 cache purge");

    const result = await shell.runCommand(
      "safe-chain pip3 install --break-system-packages safe-chain-pi-test"
    );

    assert.ok(
      result.output.includes("blocked 1 malicious package downloads"),
      `Should have blocked malware. Output was:\n${result.output}`
    );
  });
});
