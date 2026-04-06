import { describe, it, before, beforeEach, afterEach } from "node:test";
import { DockerTestContainer } from "./DockerTestContainer.js";
import assert from "node:assert";

describe("E2E: pdm coverage", () => {
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

    // Clear pdm cache
    await installationShell.runCommand("command pdm cache clear");
  });

  afterEach(async () => {
    // Stop and clean up the container after each test
    if (container) {
      await container.stop();
      container = null;
    }
  });

  it(`successfully installs known safe packages with pdm add`, async () => {
    const shell = await container.openShell("zsh");

    // Initialize a new pdm project
    await shell.runCommand("mkdir /tmp/test-pdm-project && cd /tmp/test-pdm-project");
    await shell.runCommand("cd /tmp/test-pdm-project && pdm init --non-interactive");

    // Add a safe package
    const result = await shell.runCommand(
      "cd /tmp/test-pdm-project && pdm add requests"
    );

    assert.ok(
      result.output.includes("no malware found.") || result.output.includes("Installing"),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`pdm add with specific version`, async () => {
    const shell = await container.openShell("zsh");

    await shell.runCommand("mkdir /tmp/test-pdm-version && cd /tmp/test-pdm-version");
    await shell.runCommand("cd /tmp/test-pdm-version && pdm init --non-interactive");

    const result = await shell.runCommand(
      "cd /tmp/test-pdm-version && pdm add requests==2.32.3"
    );

    assert.ok(
      result.output.includes("no malware found.") || result.output.includes("Installing"),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`safe-chain blocks installation of malicious Python packages via pdm`, async () => {
    const shell = await container.openShell("zsh");

    await shell.runCommand("mkdir /tmp/test-pdm-malware && cd /tmp/test-pdm-malware");
    await shell.runCommand("cd /tmp/test-pdm-malware && pdm init --non-interactive");

    const result = await shell.runCommand(
      "cd /tmp/test-pdm-malware && pdm add safe-chain-pi-test"
    );

    assert.ok(
      result.output.includes("blocked by safe-chain"),
      `Expected malware to be blocked. Output was:\n${result.output}`
    );
    assert.ok(
      result.output.includes("Exiting without installing malicious packages."),
      `Expected exit message. Output was:\n${result.output}`
    );
  });

  it(`pdm install installs dependencies from pyproject.toml`, async () => {
    const shell = await container.openShell("zsh");

    await shell.runCommand("mkdir /tmp/test-pdm-install && cd /tmp/test-pdm-install");
    await shell.runCommand("cd /tmp/test-pdm-install && pdm init --non-interactive");
    await shell.runCommand("cd /tmp/test-pdm-install && pdm add requests");

    // Now remove the virtualenv and run install
    await shell.runCommand("cd /tmp/test-pdm-install && rm -rf .venv");

    const result = await shell.runCommand(
      "cd /tmp/test-pdm-install && pdm install"
    );

    assert.ok(
      result.output.includes("no malware found.") || result.output.includes("Installing"),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`pdm update updates dependencies`, async () => {
    const shell = await container.openShell("zsh");

    await shell.runCommand("mkdir /tmp/test-pdm-update && cd /tmp/test-pdm-update");
    await shell.runCommand("cd /tmp/test-pdm-update && pdm init --non-interactive");
    await shell.runCommand("cd /tmp/test-pdm-update && pdm add requests");

    const result = await shell.runCommand(
      "cd /tmp/test-pdm-update && pdm update"
    );

    assert.ok(
      result.output.includes("no malware found.") || result.output.includes("Updating"),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`pdm update with specific packages`, async () => {
    const shell = await container.openShell("zsh");

    await shell.runCommand("mkdir /tmp/test-pdm-update-specific && cd /tmp/test-pdm-update-specific");
    await shell.runCommand("cd /tmp/test-pdm-update-specific && pdm init --non-interactive");
    await shell.runCommand("cd /tmp/test-pdm-update-specific && pdm add requests certifi");

    const result = await shell.runCommand(
      "cd /tmp/test-pdm-update-specific && pdm update requests"
    );

    assert.ok(
      result.output.includes("no malware found.") || result.output.includes("Updating"),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`pdm add with multiple packages`, async () => {
    const shell = await container.openShell("zsh");

    await shell.runCommand("mkdir /tmp/test-pdm-multi && cd /tmp/test-pdm-multi");
    await shell.runCommand("cd /tmp/test-pdm-multi && pdm init --non-interactive");

    const result = await shell.runCommand(
      "cd /tmp/test-pdm-multi && pdm add requests certifi"
    );

    assert.ok(
      result.output.includes("no malware found.") || result.output.includes("Installing"),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`pdm add with extras`, async () => {
    const shell = await container.openShell("zsh");

    await shell.runCommand("mkdir /tmp/test-pdm-extras && cd /tmp/test-pdm-extras");
    await shell.runCommand("cd /tmp/test-pdm-extras && pdm init --non-interactive");

    // Use quotes to prevent shell expansion of square brackets
    const result = await shell.runCommand(
      'cd /tmp/test-pdm-extras && pdm add "requests[security]"'
    );

    assert.ok(
      result.output.includes("no malware found.") || result.output.includes("Installing"),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`pdm add with development group`, async () => {
    const shell = await container.openShell("zsh");

    await shell.runCommand("mkdir /tmp/test-pdm-dev && cd /tmp/test-pdm-dev");
    await shell.runCommand("cd /tmp/test-pdm-dev && pdm init --non-interactive");

    const result = await shell.runCommand(
      "cd /tmp/test-pdm-dev && pdm add -dG dev pytest"
    );

    assert.ok(
      result.output.includes("no malware found.") || result.output.includes("Installing"),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`pdm lock creates/updates lock file`, async () => {
    const shell = await container.openShell("zsh");

    await shell.runCommand("mkdir /tmp/test-pdm-lock && cd /tmp/test-pdm-lock");
    await shell.runCommand("cd /tmp/test-pdm-lock && pdm init --non-interactive");
    await shell.runCommand("cd /tmp/test-pdm-lock && pdm add requests");
    await shell.runCommand("cd /tmp/test-pdm-lock && rm pdm.lock");

    const result = await shell.runCommand(
      "cd /tmp/test-pdm-lock && pdm lock"
    );

    assert.ok(
      result.output.includes("no malware found.") || result.output.includes("Resolving") || result.output.includes("lock file"),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`pdm remove does not download packages`, async () => {
    const shell = await container.openShell("zsh");

    await shell.runCommand("mkdir /tmp/test-pdm-remove && cd /tmp/test-pdm-remove");
    await shell.runCommand("cd /tmp/test-pdm-remove && pdm init --non-interactive");
    await shell.runCommand("cd /tmp/test-pdm-remove && pdm add requests");

    const result = await shell.runCommand(
      "cd /tmp/test-pdm-remove && pdm remove requests"
    );

    // Remove should succeed - it doesn't download packages, just modifies pyproject.toml
    assert.ok(
      !result.output.includes("blocked"),
      `Remove command should not trigger downloads. Output was:\n${result.output}`
    );
  });

  it(`blocks malware during pdm install`, async () => {
    const shell = await container.openShell("zsh");

    // Create a project with malware in dependencies
    await shell.runCommand("mkdir /tmp/test-pdm-install-malware && cd /tmp/test-pdm-install-malware");
    await shell.runCommand("cd /tmp/test-pdm-install-malware && pdm init --non-interactive");

    // Add malware package - this will create lock file and attempt download
    const result = await shell.runCommand(
      "cd /tmp/test-pdm-install-malware && pdm add safe-chain-pi-test 2>&1"
    );

    assert.ok(
      result.output.includes("blocked by safe-chain"),
      `Expected malware to be blocked during add (which triggers install). Output was:\n${result.output}`
    );
    assert.ok(
      result.output.includes("Exiting without installing malicious packages."),
      `Expected exit message. Output was:\n${result.output}`
    );
  });

  it(`blocks malware when adding malicious dependency alongside safe one`, async () => {
    const shell = await container.openShell("zsh");

    await shell.runCommand("mkdir /tmp/test-pdm-batch && cd /tmp/test-pdm-batch");
    await shell.runCommand("cd /tmp/test-pdm-batch && pdm init --non-interactive");

    // Try to add malware alongside safe package
    const result = await shell.runCommand(
      "cd /tmp/test-pdm-batch && pdm add safe-chain-pi-test requests 2>&1"
    );

    assert.ok(
      result.output.includes("blocked by safe-chain"),
      `Expected malware to be blocked. Output was:\n${result.output}`
    );
    assert.ok(
      result.output.includes("Exiting without installing malicious packages."),
      `Expected exit message. Output was:\n${result.output}`
    );

    // Verify safe package was also not installed due to malware in batch
    const listResult = await shell.runCommand("cd /tmp/test-pdm-batch && pdm list");
    assert.ok(
      !listResult.output.includes("requests"),
      `Safe package should not be installed when batch includes malware. Output was:\n${listResult.output}`
    );
  });

  it(`pdm non-network commands work correctly`, async () => {
    const shell = await container.openShell("zsh");

    await shell.runCommand("mkdir /tmp/test-pdm-nonnetwork && cd /tmp/test-pdm-nonnetwork");
    await shell.runCommand("cd /tmp/test-pdm-nonnetwork && pdm init --non-interactive");
    await shell.runCommand("cd /tmp/test-pdm-nonnetwork && pdm add requests");

    // Test pdm --version
    const versionResult = await shell.runCommand("pdm --version");
    assert.ok(
      versionResult.output.includes("PDM") || versionResult.output.includes("pdm"),
      `Expected version output. Output was:\n${versionResult.output}`
    );

    // Test pdm list (list installed packages)
    const listResult = await shell.runCommand("cd /tmp/test-pdm-nonnetwork && pdm list");
    assert.ok(
      listResult.output.includes("requests"),
      `Expected to see installed package. Output was:\n${listResult.output}`
    );

    // Test pdm info (show project info)
    const infoResult = await shell.runCommand("cd /tmp/test-pdm-nonnetwork && pdm info");
    assert.ok(
      infoResult.output.includes("PDM") || infoResult.output.includes("Python") || infoResult.output.includes("Project"),
      `Expected project info. Output was:\n${infoResult.output}`
    );

    // Test pdm config (show configuration)
    const configResult = await shell.runCommand("pdm config");
    assert.ok(
      configResult.output.length > 0,
      `Expected configuration output. Output was:\n${configResult.output}`
    );

    // Test pdm run (execute command in virtualenv) - non-network command
    const runResult = await shell.runCommand("cd /tmp/test-pdm-nonnetwork && pdm run python --version");
    assert.ok(
      runResult.output.includes("Python"),
      `Expected Python version output. Output was:\n${runResult.output}`
    );
  });
});
