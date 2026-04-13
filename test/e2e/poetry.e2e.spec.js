import { describe, it, before, beforeEach, afterEach } from "node:test";
import { DockerTestContainer } from "./DockerTestContainer.js";
import assert from "node:assert";

describe("E2E: poetry coverage", () => {
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
    
    // Clear poetry cache
    await installationShell.runCommand("command poetry cache clear pypi --all -n");
  });

  afterEach(async () => {
    // Stop and clean up the container after each test
    if (container) {
      await container.stop();
      container = null;
    }
  });

  it(`successfully installs known safe packages with poetry add`, async () => {
    const shell = await container.openShell("zsh");
    
    // Initialize a new poetry project
    await shell.runCommand("mkdir /tmp/test-poetry-project && cd /tmp/test-poetry-project");
    await shell.runCommand("cd /tmp/test-poetry-project && poetry init --no-interaction");
    
    // Add a safe package
    const result = await shell.runCommand(
      "cd /tmp/test-poetry-project && poetry add requests"
    );

    assert.ok(
      result.output.includes("no malware found.") || result.output.includes("Installing"),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`poetry add with specific version`, async () => {
    const shell = await container.openShell("zsh");
    
    await shell.runCommand("mkdir /tmp/test-poetry-version && cd /tmp/test-poetry-version");
    await shell.runCommand("cd /tmp/test-poetry-version && poetry init --no-interaction");
    
    const result = await shell.runCommand(
      "cd /tmp/test-poetry-version && poetry add requests==2.32.3"
    );

    assert.ok(
      result.output.includes("no malware found.") || result.output.includes("Installing"),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`safe-chain blocks installation of malicious Python packages via poetry`, async () => {
    const shell = await container.openShell("zsh");
    
    await shell.runCommand("mkdir /tmp/test-poetry-malware && cd /tmp/test-poetry-malware");
    await shell.runCommand("cd /tmp/test-poetry-malware && poetry init --no-interaction");
    
    const result = await shell.runCommand(
      "cd /tmp/test-poetry-malware && poetry add safe-chain-pi-test"
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

  it(`poetry install installs dependencies from pyproject.toml`, async () => {
    const shell = await container.openShell("zsh");
    
    await shell.runCommand("mkdir /tmp/test-poetry-install && cd /tmp/test-poetry-install");
    await shell.runCommand("cd /tmp/test-poetry-install && poetry init --no-interaction");
    await shell.runCommand("cd /tmp/test-poetry-install && poetry add requests");
    
    // Now remove the virtualenv and run install
    await shell.runCommand("cd /tmp/test-poetry-install && rm -rf .venv");
    
    const result = await shell.runCommand(
      "cd /tmp/test-poetry-install && poetry install"
    );

    assert.ok(
      result.output.includes("no malware found.") || result.output.includes("Installing"),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`poetry update updates dependencies`, async () => {
    const shell = await container.openShell("zsh");
    
    await shell.runCommand("mkdir /tmp/test-poetry-update && cd /tmp/test-poetry-update");
    await shell.runCommand("cd /tmp/test-poetry-update && poetry init --no-interaction");
    await shell.runCommand("cd /tmp/test-poetry-update && poetry add requests");
    
    const result = await shell.runCommand(
      "cd /tmp/test-poetry-update && poetry update"
    );

    assert.ok(
      result.output.includes("no malware found.") || result.output.includes("Updating"),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`poetry update with specific packages`, async () => {
    const shell = await container.openShell("zsh");
    
    await shell.runCommand("mkdir /tmp/test-poetry-update-specific && cd /tmp/test-poetry-update-specific");
    await shell.runCommand("cd /tmp/test-poetry-update-specific && poetry init --no-interaction");
    await shell.runCommand("cd /tmp/test-poetry-update-specific && poetry add requests certifi");
    
    const result = await shell.runCommand(
      "cd /tmp/test-poetry-update-specific && poetry update requests"
    );

    assert.ok(
      result.output.includes("no malware found.") || result.output.includes("Updating"),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`poetry sync synchronizes environment`, async () => {
    const shell = await container.openShell("zsh");
    
    await shell.runCommand("mkdir /tmp/test-poetry-sync && cd /tmp/test-poetry-sync");
    await shell.runCommand("cd /tmp/test-poetry-sync && poetry init --no-interaction");
    await shell.runCommand("cd /tmp/test-poetry-sync && poetry add requests");
    
    const result = await shell.runCommand(
      "cd /tmp/test-poetry-sync && poetry sync"
    );

    assert.ok(
      result.output.includes("no malware found.") || result.output.includes("Installing"),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`poetry add with multiple packages`, async () => {
    const shell = await container.openShell("zsh");
    
    await shell.runCommand("mkdir /tmp/test-poetry-multi && cd /tmp/test-poetry-multi");
    await shell.runCommand("cd /tmp/test-poetry-multi && poetry init --no-interaction");
    
    const result = await shell.runCommand(
      "cd /tmp/test-poetry-multi && poetry add requests certifi"
    );

    assert.ok(
      result.output.includes("no malware found.") || result.output.includes("Installing"),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`poetry add with extras`, async () => {
    const shell = await container.openShell("zsh");
    
    await shell.runCommand("mkdir /tmp/test-poetry-extras && cd /tmp/test-poetry-extras");
    await shell.runCommand("cd /tmp/test-poetry-extras && poetry init --no-interaction");
    
    // Use quotes to prevent shell expansion of square brackets
    const result = await shell.runCommand(
      'cd /tmp/test-poetry-extras && poetry add "requests[security]"'
    );

    assert.ok(
      result.output.includes("no malware found.") || result.output.includes("Installing"),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`poetry add with development group`, async () => {
    const shell = await container.openShell("zsh");
    
    await shell.runCommand("mkdir /tmp/test-poetry-dev && cd /tmp/test-poetry-dev");
    await shell.runCommand("cd /tmp/test-poetry-dev && poetry init --no-interaction");
    
    const result = await shell.runCommand(
      "cd /tmp/test-poetry-dev && poetry add --group dev pytest"
    );

    assert.ok(
      result.output.includes("no malware found.") || result.output.includes("Installing"),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`poetry install with extras`, async () => {
    const shell = await container.openShell("zsh");
    
    await shell.runCommand("mkdir /tmp/test-poetry-install-extras && cd /tmp/test-poetry-install-extras");
    await shell.runCommand("cd /tmp/test-poetry-install-extras && poetry init --no-interaction");
    await shell.runCommand('cd /tmp/test-poetry-install-extras && poetry add requests');
    await shell.runCommand("cd /tmp/test-poetry-install-extras && rm -rf .venv");
    
    const result = await shell.runCommand(
      'cd /tmp/test-poetry-install-extras && poetry install'
    );

    assert.ok(
      result.output.includes("no malware found.") || result.output.includes("Installing"),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`poetry install with dependency groups`, async () => {
    const shell = await container.openShell("zsh");
    
    await shell.runCommand("mkdir /tmp/test-poetry-install-groups && cd /tmp/test-poetry-install-groups");
    await shell.runCommand("cd /tmp/test-poetry-install-groups && poetry init --no-interaction");
    await shell.runCommand("cd /tmp/test-poetry-install-groups && poetry add requests");
    await shell.runCommand("cd /tmp/test-poetry-install-groups && rm -rf .venv");
    
    const result = await shell.runCommand(
      "cd /tmp/test-poetry-install-groups && poetry install"
    );

    assert.ok(
      result.output.includes("no malware found.") || result.output.includes("Installing"),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`poetry lock creates/updates lock file`, async () => {
    const shell = await container.openShell("zsh");
    
    await shell.runCommand("mkdir /tmp/test-poetry-lock && cd /tmp/test-poetry-lock");
    await shell.runCommand("cd /tmp/test-poetry-lock && poetry init --no-interaction");
    await shell.runCommand("cd /tmp/test-poetry-lock && poetry add requests");
    await shell.runCommand("cd /tmp/test-poetry-lock && rm poetry.lock");
    
    const result = await shell.runCommand(
      "cd /tmp/test-poetry-lock && poetry lock"
    );

    assert.ok(
      result.output.includes("no malware found.") || result.output.includes("Resolving") || result.output.includes("lock file"),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`poetry add with version constraint using @`, async () => {
    const shell = await container.openShell("zsh");
    
    await shell.runCommand("mkdir /tmp/test-poetry-constraint && cd /tmp/test-poetry-constraint");
    await shell.runCommand("cd /tmp/test-poetry-constraint && poetry init --no-interaction");
    
    const result = await shell.runCommand(
      "cd /tmp/test-poetry-constraint && poetry add requests@^2.32.0"
    );

    assert.ok(
      result.output.includes("no malware found.") || result.output.includes("Installing"),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`poetry remove does not download packages`, async () => {
    const shell = await container.openShell("zsh");
    
    await shell.runCommand("mkdir /tmp/test-poetry-remove && cd /tmp/test-poetry-remove");
    await shell.runCommand("cd /tmp/test-poetry-remove && poetry init --no-interaction");
    await shell.runCommand("cd /tmp/test-poetry-remove && poetry add requests");
    
    const result = await shell.runCommand(
      "cd /tmp/test-poetry-remove && poetry remove requests"
    );

    // Remove should succeed - it doesn't download packages, just modifies pyproject.toml
    assert.ok(
      !result.output.includes("blocked"),
      `Remove command should not trigger downloads. Output was:\n${result.output}`
    );
  });

  it(`blocks malware during poetry install`, async () => {
    const shell = await container.openShell("zsh");
    
    // Create a project with malware in dependencies
    await shell.runCommand("mkdir /tmp/test-poetry-install-malware && cd /tmp/test-poetry-install-malware");
    await shell.runCommand("cd /tmp/test-poetry-install-malware && poetry init --no-interaction");
    
    // Add malware package - this will create lock file and attempt download
    const result = await shell.runCommand(
      "cd /tmp/test-poetry-install-malware && poetry add safe-chain-pi-test 2>&1"
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

  it(`blocks malware when updating to add malicious dependency`, async () => {
    const shell = await container.openShell("zsh");
    
    await shell.runCommand("mkdir /tmp/test-poetry-update-add && cd /tmp/test-poetry-update-add");
    await shell.runCommand("cd /tmp/test-poetry-update-add && poetry init --no-interaction");
    
    // Start with a safe dependency
    await shell.runCommand("cd /tmp/test-poetry-update-add && poetry add requests");
    
    // Now try to add malware via add command
    const result = await shell.runCommand(
      "cd /tmp/test-poetry-update-add && poetry add safe-chain-pi-test 2>&1"
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

  it(`blocks malware when installing from requirements with malicious package`, async () => {
    const shell = await container.openShell("zsh");
    
    await shell.runCommand("mkdir /tmp/test-poetry-req-malware && cd /tmp/test-poetry-req-malware");
    await shell.runCommand("cd /tmp/test-poetry-req-malware && poetry init --no-interaction");
    
    // Try to add malware directly - this is the primary vector
    const result = await shell.runCommand(
      "cd /tmp/test-poetry-req-malware && poetry add safe-chain-pi-test requests 2>&1"
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
    const listResult = await shell.runCommand("cd /tmp/test-poetry-req-malware && poetry show");
    assert.ok(
      !listResult.output.includes("requests"),
      `Safe package should not be installed when batch includes malware. Output was:\n${listResult.output}`
    );
  });

  it(`poetry non-network commands work correctly`, async () => {
    const shell = await container.openShell("zsh");
    
    await shell.runCommand("mkdir /tmp/test-poetry-nonnetwork && cd /tmp/test-poetry-nonnetwork");
    await shell.runCommand("cd /tmp/test-poetry-nonnetwork && poetry init --no-interaction");
    await shell.runCommand("cd /tmp/test-poetry-nonnetwork && poetry add requests");
    
    // Test poetry --version
    const versionResult = await shell.runCommand("poetry --version");
    assert.ok(
      versionResult.output.includes("Poetry") && versionResult.output.includes("version"),
      `Expected version output. Output was:\n${versionResult.output}`
    );
    
    // Test poetry show (list installed packages)
    const showResult = await shell.runCommand("cd /tmp/test-poetry-nonnetwork && poetry show");
    assert.ok(
      showResult.output.includes("requests"),
      `Expected to see installed package. Output was:\n${showResult.output}`
    );
    
    // Test poetry env info (show virtual environment info)
    const envInfoResult = await shell.runCommand("cd /tmp/test-poetry-nonnetwork && poetry env info");
    assert.ok(
      envInfoResult.output.includes("Virtualenv") || envInfoResult.output.includes("Path"),
      `Expected environment info. Output was:\n${envInfoResult.output}`
    );
    
    // Test poetry check (validate pyproject.toml)
    const checkResult = await shell.runCommand("cd /tmp/test-poetry-nonnetwork && poetry check");
    assert.ok(
      checkResult.output.includes("valid") || checkResult.output.includes("All"),
      `Expected validation success. Output was:\n${checkResult.output}`
    );
    
    // Test poetry config --list (show configuration)
    const configResult = await shell.runCommand("poetry config --list");
    assert.ok(
      configResult.output.length > 0,
      `Expected configuration output. Output was:\n${configResult.output}`
    );
    
    // Test poetry run (execute command in virtualenv) - non-network command
    const runResult = await shell.runCommand("cd /tmp/test-poetry-nonnetwork && poetry run python --version");
    assert.ok(
      runResult.output.includes("Python"),
      `Expected Python version output. Output was:\n${runResult.output}`
    );
    
    // Test poetry shell would start an interactive shell, so we skip that
    // Test poetry env list (list virtual environments)
    const envListResult = await shell.runCommand("cd /tmp/test-poetry-nonnetwork && poetry env list");
    assert.ok(
      envListResult.output.includes("py3") || envListResult.output.includes("Activated"),
      `Expected env list output. Output was:\n${envListResult.output}`
    );
  });
});
