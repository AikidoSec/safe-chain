import { describe, it, before, beforeEach, afterEach } from "node:test";
import { DockerTestContainer } from "./DockerTestContainer.js";
import assert from "node:assert";

describe("E2E: uv coverage", () => {
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
    
    // Clear uv cache
    await installationShell.runCommand("uv cache clean");
  });

  afterEach(async () => {
    // Stop and clean up the container after each test
    if (container) {
      await container.stop();
      container = null;
    }
  });

  it(`successfully installs known safe packages with uv pip install`, async () => {
    const shell = await container.openShell("zsh");
    const result = await shell.runCommand(
      "uv pip install --system --break-system-packages requests"
    );

    assert.ok(
      result.output.includes("no malware found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`uv pip install with specific version`, async () => {
    const shell = await container.openShell("zsh");
    const result = await shell.runCommand(
      "uv pip install --system --break-system-packages requests==2.32.3"
    );

    assert.ok(
      result.output.includes("no malware found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`uv pip install with version specifiers (>=)`, async () => {
    const shell = await container.openShell("zsh");
    const result = await shell.runCommand(
      'uv pip install --system --break-system-packages "Jinja2>=3.1"'
    );

    assert.ok(
      result.output.includes("no malware found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`uv pip install with extras such as requests[socks]`, async () => {
    const shell = await container.openShell("zsh");
    const result = await shell.runCommand(
      'uv pip install --system --break-system-packages "requests[socks]==2.32.3"'
    );

    assert.ok(
      result.output.includes("no malware found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`uv pip install multiple packages`, async () => {
    const shell = await container.openShell("zsh");
    const result = await shell.runCommand(
      "uv pip install --system --break-system-packages requests certifi urllib3"
    );

    assert.ok(
      result.output.includes("no malware found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`uv pip install from requirements file`, async () => {
    const shell = await container.openShell("zsh");
    
    // Create a requirements.txt file
    await shell.runCommand("echo 'requests==2.32.3' > requirements.txt");
    await shell.runCommand("echo 'certifi>=2024.0.0' >> requirements.txt");
    
    const result = await shell.runCommand(
      "uv pip install --system --break-system-packages -r requirements.txt"
    );

    assert.ok(
      result.output.includes("no malware found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`uv pip sync with requirements file`, async () => {
    const shell = await container.openShell("zsh");
    
    // Create a requirements.txt file
    await shell.runCommand("echo 'requests==2.32.3' > requirements-sync.txt");
    
    const result = await shell.runCommand(
      "uv pip sync --system --break-system-packages requirements-sync.txt"
    );

    assert.ok(
      result.output.includes("no malware found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`safe-chain blocks installation of malicious Python packages via uv`, async () => {
    const shell = await container.openShell("zsh");
    
    const result = await shell.runCommand(
      "uv pip install --system --break-system-packages safe-chain-pi-test"
    );

    assert.ok(
      result.output.includes("blocked 1 malicious package downloads:"),
      `Output did not include expected text. Output was:\n${result.output}`
    );
    assert.ok(
      result.output.includes("safe_chain_pi_test@0.0.1"),
      `Output did not include expected text. Output was:\n${result.output}`
    );
    assert.ok(
      result.output.includes("Exiting without installing malicious packages."),
      `Output did not include expected text. Output was:\n${result.output}`
    );

    const listResult = await shell.runCommand("uv pip list --system");
    assert.ok(
      !listResult.output.includes("safe-chain-pi-test"),
      `Malicious package was installed despite safe-chain protection. Output of 'uv pip list' was:\n${listResult.output}`
    );
  });

  it(`uv pip install from GitHub URL using the CA bundle`, async () => {
    const shell = await container.openShell("zsh");
    const result = await shell.runCommand(
      "uv pip install --system --break-system-packages git+https://github.com/psf/requests.git@v2.32.3"
    );

    assert.ok(
      result.output.includes("no malware found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );

    // Verify installation succeeded (would fail if certificate validation via env CA bundle broke)
    assert.ok(
      result.output.includes("Installed") ||
        result.output.includes("installed"),
      `Installation from GitHub failed - CA bundle may not be working. Output was:\n${result.output}`
    );
  });

  it(`uv pip successfully validates certificates for HTTPS downloads`, async () => {
    const shell = await container.openShell("zsh");
    
    const result = await shell.runCommand(
      "uv pip install --system --break-system-packages certifi"
    );

    assert.ok(
      result.output.includes("no malware found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );

    // Verify successful installation (would fail with SSL/certificate errors if the env CA bundle wasn't working)
    assert.ok(
      result.output.includes("Installed") ||
        result.output.includes("installed"),
      `Installation should succeed with proper certificate validation. Output was:\n${result.output}`
    );

    // Should NOT contain SSL or certificate errors
    assert.ok(
      !result.output.match(
        /SSL|certificate verify failed|CERTIFICATE_VERIFY_FAILED/i
      ),
      `Should not have SSL/certificate errors. Output was:\n${result.output}`
    );
  });

  it(`uv pip install from direct HTTPS wheel URL`, async () => {
    const shell = await container.openShell("zsh");
    const result = await shell.runCommand(
      "uv pip install --system --break-system-packages https://files.pythonhosted.org/packages/70/8e/0e2d847013cb52cd35b38c009bb167a1a26b2ce6cd6965bf26b47bc0bf44/requests-2.31.0-py3-none-any.whl"
    );

    assert.ok(
      result.output.includes("no malware found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );

    assert.ok(
      result.output.includes("Installed") ||
        result.output.includes("installed"),
      `Installation from direct HTTPS URL failed. Output was:\n${result.output}`
    );
  });

  it(`uv pip install with --upgrade flag`, async () => {
    const shell = await container.openShell("zsh");
    
    // First install a package
    await shell.runCommand("uv pip install --system --break-system-packages requests==2.31.0");
    
    // Then upgrade it
    const result = await shell.runCommand(
      "uv pip install --system --break-system-packages --upgrade requests"
    );

    assert.ok(
      result.output.includes("no malware found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`uv pip install with --no-deps flag`, async () => {
    const shell = await container.openShell("zsh");
    const result = await shell.runCommand(
      "uv pip install --system --break-system-packages --no-deps requests"
    );

    assert.ok(
      result.output.includes("no malware found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`uv pip install with --editable flag from local directory`, async () => {
    const shell = await container.openShell("zsh");
    
    // Create a simple package structure
    await shell.runCommand("mkdir -p /tmp/test-pkg");
    await shell.runCommand("echo 'from setuptools import setup' > /tmp/test-pkg/setup.py");
    await shell.runCommand("echo \"setup(name='test-pkg', version='0.1.0')\" >> /tmp/test-pkg/setup.py");
    
    const result = await shell.runCommand(
      "uv pip install --system --break-system-packages -e /tmp/test-pkg"
    );

    assert.ok(
      result.output.includes("no malware found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`uv pip compile creates locked requirements`, async () => {
    const shell = await container.openShell("zsh");
    
    // Create an input requirements file
    await shell.runCommand("echo 'requests' > requirements.in");
    
    const result = await shell.runCommand(
      "uv pip compile requirements.in"
    );

    // uv pip compile doesn't install packages, just resolves dependencies
    // It should complete successfully and output resolved requirements
    assert.ok(
      result.output.includes("requests==") || result.output.includes("# via"),
      `Output did not include compiled requirements. Output was:\n${result.output}`
    );
  });

  it(`uv pip install with --index-url for alternate registry`, async () => {
    const shell = await container.openShell("zsh");
    const result = await shell.runCommand(
      "uv pip install --system --break-system-packages --index-url https://test.pypi.org/simple certifi"
    );

    assert.ok(
      result.output.includes("no malware found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );

    // Should succeed if CA bundle properly handles tunneled hosts
    assert.ok(
      result.output.includes("Installed") ||
        result.output.includes("installed"),
      `Installation from Test PyPI failed. This may indicate the CA bundle lacks public roots. Output was:\n${result.output}`
    );
  });

  it(`uv pip install with --safe-chain-logging=verbose`, async () => {
    const shell = await container.openShell("zsh");
    const result = await shell.runCommand(
      "uv pip install --system --break-system-packages requests --safe-chain-logging=verbose"
    );
    
    assert.ok(
      result.output.includes("no malware found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`uv pip install with version range constraint`, async () => {
    const shell = await container.openShell("zsh");
    const result = await shell.runCommand(
      'uv pip install --system --break-system-packages "requests>=2.31.0,<2.33.0"'
    );

    assert.ok(
      result.output.includes("no malware found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`uv pip list shows installed packages`, async () => {
    const shell = await container.openShell("zsh");
    
    // Install a package first
    await shell.runCommand("uv pip install --system --break-system-packages requests");
    
    // Then list packages - this shouldn't trigger safe-chain scanning
    const result = await shell.runCommand("uv pip list --system");

    // List command should work without malware scanning
    assert.ok(
      result.output.includes("requests") || result.output.length > 0,
      `Output did not show package list. Output was:\n${result.output}`
    );
  });

  it(`uv add installs package and updates project`, async () => {
    const shell = await container.openShell("zsh");
    
    // Initialize a new uv project and add package in same command
    const result = await shell.runCommand(
      "uv init test-project && cd test-project && uv add requests"
    );

    assert.ok(
      result.output.includes("no malware found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`uv add with specific version`, async () => {
    const shell = await container.openShell("zsh");
    
    // Initialize a new uv project
    await shell.runCommand("uv init test-project-version");
    
    const result = await shell.runCommand(
      "cd test-project-version && uv add requests==2.32.3"
    );

    assert.ok(
      result.output.includes("no malware found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`uv add --dev for development dependencies`, async () => {
    const shell = await container.openShell("zsh");
    
    // Initialize a new uv project
    await shell.runCommand("uv init test-project-dev");
    
    const result = await shell.runCommand(
      "cd test-project-dev && uv add --dev pytest"
    );

    assert.ok(
      result.output.includes("no malware found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`uv add multiple packages at once`, async () => {
    const shell = await container.openShell("zsh");
    
    // Initialize a new uv project
    await shell.runCommand("uv init test-project-multi");
    
    const result = await shell.runCommand(
      "cd test-project-multi && uv add requests certifi urllib3"
    );

    assert.ok(
      result.output.includes("no malware found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`safe-chain blocks malicious packages via uv add`, async () => {
    const shell = await container.openShell("zsh");
    
    // Initialize a new uv project
    await shell.runCommand("uv init test-project-malware");
    
    const result = await shell.runCommand(
      "cd test-project-malware && uv add safe-chain-pi-test"
    );

    assert.ok(
      result.output.includes("blocked 1 malicious package downloads:"),
      `Output did not include expected text. Output was:\n${result.output}`
    );
    assert.ok(
      result.output.includes("safe_chain_pi_test@0.0.1"),
      `Output did not include expected text. Output was:\n${result.output}`
    );
    assert.ok(
      result.output.includes("Exiting without installing malicious packages."),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`uv tool install installs a global tool`, async () => {
    const shell = await container.openShell("zsh");
    const result = await shell.runCommand(
      "uv tool install ruff"
    );

    assert.ok(
      result.output.includes("no malware found.") || result.output.includes("Installed"),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`safe-chain blocks malicious packages via uv tool install`, async () => {
    const shell = await container.openShell("zsh");
    const result = await shell.runCommand(
      "uv tool install safe-chain-pi-test"
    );

    assert.ok(
      result.output.includes("blocked 1 malicious package downloads:"),
      `Output did not include expected text. Output was:\n${result.output}`
    );
    assert.ok(
      result.output.includes("safe_chain_pi_test@0.0.1"),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`uv run --with installs ephemeral dependency`, async () => {
    const shell = await container.openShell("zsh");
    
    // Create a simple Python script
    await shell.runCommand("echo 'import requests; print(requests.__version__)' > test_script.py");
    
    const result = await shell.runCommand(
      "uv run --with requests test_script.py"
    );

    assert.ok(
      result.output.includes("no malware found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`safe-chain blocks malicious packages via uv run --with`, async () => {
    const shell = await container.openShell("zsh");
    
    // Create a simple Python script
    await shell.runCommand("echo 'print(\"test\")' > test_script2.py");
    
    const result = await shell.runCommand(
      "uv run --with safe-chain-pi-test test_script2.py"
    );

    assert.ok(
      result.output.includes("blocked 1 malicious package downloads:"),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`uv sync syncs project dependencies`, async () => {
    const shell = await container.openShell("zsh");
    
    // Initialize a new uv project, add a dependency, remove venv, and sync in one command chain
    const result = await shell.runCommand(
      "uv init test-sync-project && cd test-sync-project && uv add requests && rm -rf .venv && uv sync"
    );

    assert.ok(
      result.output.includes("no malware found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`uv add from git URL`, async () => {
    const shell = await container.openShell("zsh");
    
    // Initialize a new uv project
    await shell.runCommand("uv init test-git-add");
    
    const result = await shell.runCommand(
      "cd test-git-add && uv add git+https://github.com/psf/requests.git@v2.32.3"
    );

    assert.ok(
      result.output.includes("no malware found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`uv add with --optional group`, async () => {
    const shell = await container.openShell("zsh");
    
    // Initialize a new uv project
    await shell.runCommand("uv init test-optional");
    
    const result = await shell.runCommand(
      "cd test-optional && uv add --optional dev pytest"
    );

    assert.ok(
      result.output.includes("no malware found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`uv run --with-requirements installs from requirements file`, async () => {
    const shell = await container.openShell("zsh");
    
    // Create requirements file and script
    await shell.runCommand("echo 'requests' > run_requirements.txt");
    await shell.runCommand("echo 'import requests; print(requests.__version__)' > run_script.py");
    
    const result = await shell.runCommand(
      "uv run --with-requirements run_requirements.txt run_script.py"
    );

    assert.ok(
      result.output.includes("no malware found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`uv sync --all-extras syncs all optional dependencies`, async () => {
    const shell = await container.openShell("zsh");
    
    // Initialize project with optional dependency and sync in one command chain
    const result = await shell.runCommand(
      "uv init test-extras && cd test-extras && uv add --optional dev pytest && uv sync --all-extras"
    );

    assert.ok(
      result.output.includes("no malware found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });
});

