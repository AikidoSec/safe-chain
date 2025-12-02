import { describe, it, before, beforeEach, afterEach } from "node:test";
import { DockerTestContainer } from "./DockerTestContainer.js";
import assert from "node:assert";

describe("E2E: pip coverage", () => {
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

  it(`successfully installs known safe packages with pip3`, async () => {
    const shell = await container.openShell("zsh");
    const result = await shell.runCommand(
      "pip3 install --break-system-packages requests"
    );

    assert.ok(
      result.output.includes("no malware found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`pip3 download`, async () => {
    const shell = await container.openShell("zsh");
    const result = await shell.runCommand("pip3 download requests");

    assert.ok(
      result.output.includes("no malware found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`pip3 .whl`, async () => {
    const shell = await container.openShell("zsh");
    const result = await shell.runCommand("pip3 wheel requests");

    assert.ok(
      result.output.includes("no malware found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`pip3 install --dry-run is respected by scanner`, async () => {
    const shell = await container.openShell("zsh");
    const result = await shell.runCommand(
      "pip3 install --dry-run --break-system-packages requests"
    );

    assert.ok(
      result.output.includes("no malware found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`pip3 install with extras such as requests[socks]`, async () => {
    const shell = await container.openShell("zsh");
    const result = await shell.runCommand(
      'pip3 install --break-system-packages "requests[socks]==2.32.3"'
    );

    assert.ok(
      result.output.includes("no malware found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`pip3 install with range version specifier`, async () => {
    const shell = await container.openShell("zsh");
    const result = await shell.runCommand(
      'pip3 install --break-system-packages "Jinja2>=3.1,<3.2"'
    );

    assert.ok(
      result.output.includes("no malware found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`python3 -m pip install routes through safe-chain`, async () => {
    const shell = await container.openShell("zsh");
    const result = await shell.runCommand(
      "python3 -m pip install --break-system-packages requests"
    );

    assert.ok(
      result.output.includes("no malware found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`python3 -m pip download routes through safe-chain`, async () => {
    const shell = await container.openShell("zsh");
    const result = await shell.runCommand("python3 -m pip download requests");

    assert.ok(
      result.output.includes("no malware found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`safe-chain blocks installation of malicious Python packages`, async () => {
    const shell = await container.openShell("zsh");
    // Clear pip cache to ensure network download through proxy
    await shell.runCommand("pip3 cache purge");

    const result = await shell.runCommand(
      "pip3 install --break-system-packages safe-chain-pi-test"
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

    const listResult = await shell.runCommand("pip3 list");
    assert.ok(
      !listResult.output.includes("safe-chain-pi-test"),
      `Malicious package was installed despite safe-chain protection. Output of 'pip3 list' was:\n${listResult.output}`
    );
  });

  it(`python -m pip routes to aikido-pip (uses pip command)`, async () => {
    const shell = await container.openShell("zsh");
    const result = await shell.runCommand(
      "python -m pip install --break-system-packages requests"
    );

    assert.ok(
      result.output.includes("no malware found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );
    // Verify it completed successfully (would fail if routing was incorrect)
    assert.ok(
      result.output.includes("Successfully installed") ||
        result.output.includes("Requirement already satisfied"),
      `Installation did not succeed. Output was:\n${result.output}`
    );
  });

  it(`python -m pip3 routes to aikido-pip3 (uses pip3 command)`, async () => {
    const shell = await container.openShell("zsh");
    const result = await shell.runCommand(
      "python -m pip3 install --break-system-packages requests"
    );

    assert.ok(
      result.output.includes("no malware found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );
    // Verify it completed successfully (would fail if routing was incorrect)
    assert.ok(
      result.output.includes("Successfully installed") ||
        result.output.includes("Requirement already satisfied"),
      `Installation did not succeed. Output was:\n${result.output}`
    );
  });

  it(`python3 -m pip routes to aikido-pip3 (uses pip3 command)`, async () => {
    const shell = await container.openShell("zsh");
    const result = await shell.runCommand(
      "python3 -m pip install --break-system-packages requests"
    );

    assert.ok(
      result.output.includes("no malware found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );
    // Verify it completed successfully (would fail if routing was incorrect)
    assert.ok(
      result.output.includes("Successfully installed") ||
        result.output.includes("Requirement already satisfied"),
      `Installation did not succeed. Output was:\n${result.output}`
    );
  });

  it(`python3 -m pip3 routes to aikido-pip3 (uses pip3 command)`, async () => {
    const shell = await container.openShell("zsh");
    const result = await shell.runCommand(
      "python3 -m pip3 install --break-system-packages requests"
    );

    assert.ok(
      result.output.includes("no malware found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );
    // Verify it completed successfully (would fail if routing was incorrect)
    assert.ok(
      result.output.includes("Successfully installed") ||
        result.output.includes("Requirement already satisfied"),
      `Installation did not succeed. Output was:\n${result.output}`
    );
  });

  it(`pip3 can install from GitHub URL using the CA bundle`, async () => {
    const shell = await container.openShell("zsh");
    // Install a simple package from GitHub - this should use TCP tunnel, not MITM
    // Using a popular, small package for testing
    const result = await shell.runCommand(
      "pip3 install --break-system-packages git+https://github.com/psf/requests.git@v2.32.3"
    );

    assert.ok(
      result.output.includes("no malware found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );

    // Verify installation succeeded (would fail if certificate validation via env CA bundle broke)
    assert.ok(
      result.output.includes("Successfully installed") ||
        result.output.includes("Requirement already satisfied"),
      `Installation from GitHub failed - CA bundle may not be working. Output was:\n${result.output}`
    );

    // Verify package was actually installed
    const listResult = await shell.runCommand("pip3 list");
    assert.ok(
      listResult.output.includes("requests"),
      `Package from GitHub was not installed. Output was:\n${listResult.output}`
    );
  });

  it(`pip3 successfully validates certificates for HTTPS downloads`, async () => {
    const shell = await container.openShell("zsh");
    // Clear cache to force network download through proxy
    await shell.runCommand("pip3 cache purge");

    const result = await shell.runCommand(
      "pip3 install --break-system-packages certifi"
    );

    assert.ok(
      result.output.includes("no malware found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );

    // Verify successful installation (would fail with SSL/certificate errors if the env CA bundle wasn't working)
    assert.ok(
      result.output.includes("Successfully installed"),
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

  it(`pip3 handles external HTTPS correctly (e.g., downloading from CDN)`, async () => {
    const shell = await container.openShell("zsh");
    // Test installing from a direct HTTPS URL (not a registry)
    // This validates that non-registry HTTPS traffic works with our env-provided CA bundle
    const result = await shell.runCommand(
      "pip3 install --break-system-packages https://files.pythonhosted.org/packages/70/8e/0e2d847013cb52cd35b38c009bb167a1a26b2ce6cd6965bf26b47bc0bf44/requests-2.31.0-py3-none-any.whl"
    );

    assert.ok(
      result.output.includes("no malware found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );

    // Since this is from pythonhosted.org, it should be MITM'd by safe-chain
    // But the certificate validation should still work
    assert.ok(
      result.output.includes("Successfully installed") ||
        result.output.includes("Requirement already satisfied"),
      `Installation from direct HTTPS URL failed. Output was:\n${result.output}`
    );
  });

  it(`pip3 can install from alternate PyPI mirror (tunneled, not MITM)`, async () => {
    const shell = await container.openShell("zsh");
    // Use Test PyPI which is NOT in knownPipRegistries
    // This tests tunneled HTTPS with our env-provided CA bundle (Safe Chain CA + Mozilla + Node roots)
    // If the CA bundle doesn't include public roots, this will fail with CERTIFICATE_VERIFY_FAILED
    const result = await shell.runCommand(
      "pip3 install --break-system-packages --index-url https://test.pypi.org/simple certifi"
    );

    assert.ok(
      result.output.includes("no malware found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );

    // Should succeed if CA bundle properly handles tunneled hosts
    assert.ok(
      result.output.includes("Successfully installed") ||
        result.output.includes("Requirement already satisfied"),
      `Installation from Test PyPI failed. This may indicate the CA bundle lacks public roots. Output was:\n${result.output}`
    );

    // Should NOT contain certificate verification errors
    assert.ok(
      !result.output.match(
        /SSL|certificate verify failed|CERTIFICATE_VERIFY_FAILED/i
      ),
      `Should not have SSL/certificate errors for tunneled hosts. Output was:\n${result.output}`
    );
  });

  it(`pip3 install requests with --safe-chain-logging=verbose`, async () => {
    const shell = await container.openShell("zsh");
    const result = await shell.runCommand(
      "pip3 install --break-system-packages requests --safe-chain-logging=verbose"
    );
    assert.ok(
      result.output.includes("no malware found."),
      `Output did not include expected text. Output was:\n${result.output}`
    );
  });

  it(`pip3 config set should work and persist configuration`, async () => {
    const shell = await container.openShell("zsh");
    
    // Set a config value
    const setResult = await shell.runCommand(
      "pip3 config set global.timeout 60"
    );
    
    assert.ok(
      setResult.output.includes("Writing to"),
      `pip3 config set should write config. Output was:\n${setResult.output}`
    );
    
    // Verify it was persisted by reading it back
    const getResult = await shell.runCommand(
      "pip3 config get global.timeout"
    );
    
    assert.ok(
      getResult.output.includes("60"),
      `Config value should be 60. Output was:\n${getResult.output}`
    );
  });

  it(`pip3 config list should show user configuration`, async () => {
    const shell = await container.openShell("zsh");
    
    // Set a value first
    await shell.runCommand("pip3 config set global.timeout 90");
    
    // List config
    const listResult = await shell.runCommand("pip3 config list");
    
    assert.ok(
      listResult.output.includes("timeout") && listResult.output.includes("90"),
      `Config list should show timeout=90. Output was:\n${listResult.output}`
    );
  });

  it(`pip3 config unset should remove configuration`, async () => {
    const shell = await container.openShell("zsh");
    
    // Set a value
    await shell.runCommand("pip3 config set global.timeout 120");
    
    // Verify it exists
    const getResult = await shell.runCommand("pip3 config get global.timeout");
    assert.ok(getResult.output.includes("120"));
    
    // Unset it
    const unsetResult = await shell.runCommand("pip3 config unset global.timeout");
    assert.ok(
      unsetResult.output.includes("Writing to"),
      `pip3 config unset should write config. Output was:\n${unsetResult.output}`
    );
  });

  it(`pip3 cache dir should return cache directory path`, async () => {
    const shell = await container.openShell("zsh");
    
    const result = await shell.runCommand("pip3 cache dir");
    
    // Should output a directory path
    assert.ok(
      result.output.includes("/") && result.output.includes("cache"),
      `Should output a cache directory path. Output was:\n${result.output}`
    );
  });

  it(`pip3 cache info should show cache information`, async () => {
    const shell = await container.openShell("zsh");
    
    // Install something first to populate cache
    await shell.runCommand("pip3 install --break-system-packages certifi");
    
    const result = await shell.runCommand("pip3 cache info");
    
    // Output should contain cache-related information
    assert.ok(
      result.output.match(/cache|wheel|http/i),
      `Should output cache information. Output was:\n${result.output}`
    );
  });

  it(`pip3 cache list should list cached packages`, async () => {
    const shell = await container.openShell("zsh");
    
    // Download a package to ensure something is in cache
    await shell.runCommand("pip3 download certifi");
    
    const result = await shell.runCommand("pip3 cache list certifi");
    
    // Should show either cached wheels or "No locally built wheels"
    assert.ok(
      result.output.includes("certifi") || result.output.includes("No locally built"),
      `Should output cache list information. Output was:\n${result.output}`
    );
  });

  it(`pip3 debug should output debug information`, async () => {
    const shell = await container.openShell("zsh");
    
    const result = await shell.runCommand("pip3 debug");
    
    // Should contain debug information about pip environment
    assert.ok(
      result.output.match(/pip version|sys\.version|sys\.executable/i),
      `Should output debug information. Output was:\n${result.output}`
    );
    
    // Should NOT show safe-chain's temporary config file in the debug output
    assert.ok(
      !result.output.includes("safe-chain-pip-"),
      `Debug output should not reference safe-chain temp config. Output was:\n${result.output}`
    );
  });

  it(`pip3 completion should generate shell completion script`, async () => {
    const shell = await container.openShell("zsh");
    
    const result = await shell.runCommand("pip3 completion --zsh");
    
    // Should output shell completion code
    assert.ok(
      result.output.includes("compdef") || result.output.includes("_pip") || result.output.includes("pip completion"),
      `Should output completion code. Output was:\n${result.output}`
    );
  });

  it(`pip3 install still works after config operations`, async () => {
    const shell = await container.openShell("zsh");
    
    // Perform config operations
    await shell.runCommand("pip3 config set global.timeout 60");
    await shell.runCommand("pip3 cache dir");
    
    // Now install should still work with malware protection
    const result = await shell.runCommand(
      "pip3 install --break-system-packages certifi"
    );
    
    assert.ok(
      result.output.includes("Successfully installed") ||
        result.output.includes("Requirement already satisfied"),
      `Install should succeed after config operations. Output was:\n${result.output}`
    );
    
    assert.ok(
      result.output.includes("no malware found."),
      `Should still scan for malware. Output was:\n${result.output}`
    );
  });
});
