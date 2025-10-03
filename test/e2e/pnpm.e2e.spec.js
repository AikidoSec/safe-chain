import { describe, it, before, beforeEach, afterEach } from "node:test";
import { DockerTestContainer } from "./DockerTestContainer.js";
import assert from "node:assert";

describe("E2E: pnpm coverage", () => {
  let container;

  before(async () => {
    DockerTestContainer.buildImage();
  });

  beforeEach(async () => {
    // Run a new Docker container for each test
    container = new DockerTestContainer();
    await container.start();

    const installationShell = await container.openShell("zsh");
    await installationShell.runCommand("safe-chain setup");
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
    const result = await shell.runCommand("pnpm add axios");

    assert.ok(
      result.output.includes("no malicious packages found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`safe-chain blocks installation of malicious packages`, async () => {
    const shell = await container.openShell("zsh");
    const result = await shell.runCommand("pnpm add safe-chain-test");

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

    const listResult = await shell.runCommand("pnpm list");
    assert.ok(
      !listResult.output.includes("safe-chain-test"),
      `Malicious package was installed despite safe-chain protection. Output of 'pnpm list' was:\n${listResult.output}`
    );
  });

  it(`safe-chain blocks download of malicious packages already in package.json`, async () => {
    const shell = await container.openShell("zsh");
    await shell.runCommand(
      'echo \'{"name":"test-project","version":"1.0.0","dependencies":{"safe-chain-test":"0.0.1-security"}}\' > package.json'
    );

    var result = await shell.runCommand("pnpm install");

    assert.ok(
      result.output.includes("blocked 1 malicious package downloads"),
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

  it("safe-chain blocks pnpx from executing malicious packages", async () => {
    const shell = await container.openShell("zsh");
    const result = await shell.runCommand("pnpx safe-chain-test");

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

  it("safe-chain blocks pnpm dlx from executing malicious packages", async () => {
    const shell = await container.openShell("zsh");
    const result = await shell.runCommand("pnpm dlx safe-chain-test");

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

  it("safe-chain blocks pnpm --package=name dlx from executing malicious packages", async () => {
    const shell = await container.openShell("zsh");
    const result = await shell.runCommand(
      "pnpm --package=safe-chain-test dlx safe-chain-test"
    );

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
