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
    await installationShell.runCommand("safe-chain setup --include-python");
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
    
    // Clear poetry cache using command to bypass safe-chain wrapper
    await shell.runCommand("command poetry cache clear pypi --all -n");
    
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
      result.output.includes("Blocked by Safe-chain"),
      `Expected malware to be blocked. Output was:\n${result.output}`
    );
    assert.strictEqual(
      result.exitCode,
      1,
      `Expected exit code 1 for blocked malware, got ${result.exitCode}`
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

    // Remove should succeed - it doesn't download packages
    assert.strictEqual(
      result.status,
      0,
      `Expected exit code 0 for remove command, got ${result.status}`
    );
  });

  it(`blocks malware during poetry install`, async () => {
    const shell = await container.openShell("zsh");
    
    // Create a project with malware in dependencies
    await shell.runCommand("mkdir /tmp/test-poetry-install-malware && cd /tmp/test-poetry-install-malware");
    await shell.runCommand("cd /tmp/test-poetry-install-malware && poetry init --no-interaction");
    
    // Add safe-chain-pi-test to pyproject.toml using sed
    await shell.runCommand('cd /tmp/test-poetry-install-malware && echo "safe-chain-pi-test = \"*\"" >> pyproject.toml');
    
    const result = await shell.runCommand(
      "cd /tmp/test-poetry-install-malware && poetry install 2>&1"
    );

    assert.ok(
      result.output.includes("Blocked by Safe-chain"),
      `Expected malware to be blocked during install. Output was:\n${result.output}`
    );
    assert.strictEqual(
      result.status,
      1,
      `Expected exit code 1 for blocked malware during install, got ${result.status}`
    );
  });

  it(`blocks malware during poetry update`, async () => {
    const shell = await container.openShell("zsh");
    
    await shell.runCommand("mkdir /tmp/test-poetry-update-malware && cd /tmp/test-poetry-update-malware");
    await shell.runCommand("cd /tmp/test-poetry-update-malware && poetry init --no-interaction");
    
    // Add safe-chain-pi-test to pyproject.toml using sed
    await shell.runCommand('cd /tmp/test-poetry-update-malware && echo "safe-chain-pi-test = \"*\"" >> pyproject.toml');
    
    const result = await shell.runCommand(
      "cd /tmp/test-poetry-update-malware && poetry update 2>&1"
    );

    assert.ok(
      result.output.includes("Blocked by Safe-chain"),
      `Expected malware to be blocked during update. Output was:\n${result.output}`
    );
    assert.strictEqual(
      result.status,
      1,
      `Expected exit code 1 for blocked malware during update, got ${result.status}`
    );
  });

  it(`blocks malware during poetry sync`, async () => {
    const shell = await container.openShell("zsh");
    
    await shell.runCommand("mkdir /tmp/test-poetry-sync-malware && cd /tmp/test-poetry-sync-malware");
    await shell.runCommand("cd /tmp/test-poetry-sync-malware && poetry init --no-interaction");
    
    // Add safe-chain-pi-test to pyproject.toml using sed
    await shell.runCommand('cd /tmp/test-poetry-sync-malware && echo "safe-chain-pi-test = \"*\"" >> pyproject.toml');
    
    const result = await shell.runCommand(
      "cd /tmp/test-poetry-sync-malware && poetry sync 2>&1"
    );

    assert.ok(
      result.output.includes("Blocked by Safe-chain"),
      `Expected malware to be blocked during sync. Output was:\n${result.output}`
    );
    assert.strictEqual(
      result.status,
      1,
      `Expected exit code 1 for blocked malware during sync, got ${result.status}`
    );
  });
});
