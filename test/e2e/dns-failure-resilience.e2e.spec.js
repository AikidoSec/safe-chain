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

  it("should not crash when the npm registry is unreachable", async () => {
    const shell = await container.openShell("zsh");

    // Make the npm registry domain unreachable.
    // `npm install lodash` talks to https://registry.npmjs.org/ for both metadata and tarballs.
    await shell.runCommand(
      'echo "127.0.0.1 registry.npmjs.org" >> /etc/hosts'
    );

    const result = await shell.runCommand(
      // Fail fast so the shell runner doesn't time out.
      // Also disable extra network calls that could introduce noise.
      "npm install lodash --no-audit --no-fund --fetch-retries=0 --fetch-timeout=2000 --safe-chain-logging=verbose"
    );

    assert.ok(
      result.output.includes("registry.npmjs.org"),
      `Output did not reference the npm registry host; /etc/hosts override may not have applied. Output was:\n${result.output}`
    );

    // Ensure it did NOT crash with Unhandled Promise Rejection
    assert.strictEqual(
      result.output.includes("Unhandled promise rejection"),
      false,
      `Output indicates process crash (Unhandled promise rejection). Output was:\n${result.output}`
    );
  });
});
