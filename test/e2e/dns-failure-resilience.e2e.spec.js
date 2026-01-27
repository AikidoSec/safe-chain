import { describe, it, before, beforeEach, afterEach } from "node:test";
import { DockerTestContainer } from "./DockerTestContainer.js";
import assert from "node:assert";

describe("E2E: DNS failure resilience", () => {
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

  it("should not crash when the malware database is unreachable", async () => {
    const shell = await container.openShell("zsh");

    // Make the malware database domain unreachable
    // This forces fetchMalwareDatabase to fail
    await shell.runCommand(
      'echo "127.0.0.1 malware-list.aikido.dev" >> /etc/hosts'
    );

    const result = await shell.runCommand(
      "npm install lodash --safe-chain-logging=verbose"
    );

    assert.ok(
      result.output.includes("Safe-chain: Error handling request"),
      `Output did not include expected error handling message. Output was:\n${result.output}`
    );

    // Ensure it did NOT crash with Unhandled Promise Rejection
    assert.strictEqual(
      result.output.includes("Unhandled promise rejection"),
      false,
      `Output indicates process crash (Unhandled promise rejection). Output was:\n${result.output}`
    );
  });
});
