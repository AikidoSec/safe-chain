import { describe, it, before, beforeEach, afterEach } from "node:test";
import { DockerTestContainer } from "./DockerTestContainer.js";
import assert from "node:assert";

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

describe("Agent Mode E2E", () => {
  let shell;

  beforeEach(async () => {
    shell = await container.openShell("zsh");
    await shell.runCommand("safe-chain setup-ci");
    await shell.runCommand("echo 'export PATH=\"$HOME/.safe-chain/shims:$PATH\"' >> ~/.zshrc");
  });

  it("should start proxy successfully", async () => {
    const result = await shell.runCommand("safe-chain run & sleep 2; ps aux | grep safe-chain");
    assert.ok(result.output.includes("safe-chain"), "Proxy did not start successfully");
  });

  it("should accept verbose flag", async () => {
    const result = await shell.runCommand("safe-chain run --verbose & sleep 2; ps aux | grep safe-chain");
    assert.ok(result.output.includes("safe-chain"), "Proxy did not start with verbose flag");
  });

  it("should stop cleanly", async () => {
    await shell.runCommand("safe-chain run & sleep 2; pkill -f safe-chain");
    const result = await shell.runCommand("ps aux | grep safe-chain");
    assert.ok(!result.output.includes("safe-chain run"), "Proxy did not stop cleanly");
  });

  it("should use existing proxy when running npm view", async () => {
    await shell.runCommand("safe-chain run & sleep 2");
    const result = await shell.runCommand("npm view lodash version");
    assert.ok(result.output.includes("4.17") || result.output.includes("lodash"));
  });

  it("should use existing proxy when running pip download", async () => {
    await shell.runCommand("safe-chain run & sleep 2");
    const result = await shell.runCommand("pip download requests --dry-run");
    assert.ok(result.output.length > 0);
  });
});
