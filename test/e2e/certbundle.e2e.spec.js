import { describe, it, before, beforeEach, afterEach } from "node:test";
import { DockerTestContainer } from "./DockerTestContainer.js";
import assert from "node:assert";

describe("E2E: NODE_EXTRA_CA_CERTS merging", () => {
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

  it(`npm install works without NODE_EXTRA_CA_CERTS set`, async () => {
    const shell = await container.openShell("zsh");
    
    // Ensure NODE_EXTRA_CA_CERTS is not set
    await shell.runCommand("unset NODE_EXTRA_CA_CERTS");
    
    const result = await shell.runCommand("npm install axios");

    assert.ok(
      result.output.includes("added") || result.output.includes("up to date"),
      `npm install failed without NODE_EXTRA_CA_CERTS. Output was:\n${result.output}`
    );
  });

  it(`npm install works with valid NODE_EXTRA_CA_CERTS set`, async () => {
    const shell = await container.openShell("zsh");
    
    // Create a temporary valid certificate (using the system's Mozilla CA bundle)
    await shell.runCommand("cp /etc/ssl/certs/ca-certificates.crt /tmp/valid-certs.pem");
    
    // Verify the cert file was created
    const { output: checkOutput } = await shell.runCommand("test -f /tmp/valid-certs.pem && echo exists");
    assert.ok(
      checkOutput.includes("exists"),
      `Certificate file was not created at /tmp/valid-certs.pem`
    );
    
    // Set NODE_EXTRA_CA_CERTS and run npm install
    const result = await shell.runCommand(
      "NODE_EXTRA_CA_CERTS=/tmp/valid-certs.pem npm install axios"
    );

    assert.ok(
      result.output.includes("added") || result.output.includes("up to date"),
      `npm install failed with valid NODE_EXTRA_CA_CERTS. Output was:\n${result.output}`
    );
  });

  it(`npm install works with non-existent NODE_EXTRA_CA_CERTS path`, async () => {
    const shell = await container.openShell("zsh");
    
    // Set NODE_EXTRA_CA_CERTS to a non-existent path
    const result = await shell.runCommand(
      'export NODE_EXTRA_CA_CERTS="/tmp/nonexistent-certs.pem" && npm install axios'
    );

    // Should still succeed - safe-chain should gracefully handle missing user certs
    assert.ok(
      result.output.includes("added") || result.output.includes("up to date"),
      `npm install failed with non-existent NODE_EXTRA_CA_CERTS. Output was:\n${result.output}`
    );
    
    // Should show a warning
    assert.ok(
      result.output.includes("Safe-chain") || result.output.includes("Could not read"),
      `Expected safe-chain warning about missing certs. Output was:\n${result.output}`
    );
  });

  it(`npm install works with invalid (non-PEM) NODE_EXTRA_CA_CERTS`, async () => {
    const shell = await container.openShell("zsh");
    
    // Create an invalid certificate file (not valid PEM)
    await shell.runCommand(
      'echo "This is not a valid PEM certificate" > /tmp/invalid-certs.pem'
    );
    
    // Set NODE_EXTRA_CA_CERTS to invalid cert
    const result = await shell.runCommand(
      'export NODE_EXTRA_CA_CERTS="/tmp/invalid-certs.pem" && npm install axios'
    );

    // Should still succeed - safe-chain should skip invalid user certs
    assert.ok(
      result.output.includes("added") || result.output.includes("up to date"),
      `npm install failed with invalid NODE_EXTRA_CA_CERTS. Output was:\n${result.output}`
    );
    
    // Should show a warning about invalid cert
    assert.ok(
      result.output.includes("Safe-chain") || result.output.includes("Could not read"),
      `Expected safe-chain warning about invalid certs. Output was:\n${result.output}`
    );
  });

  it(`npm install handles NODE_EXTRA_CA_CERTS with path traversal attempt`, async () => {
    const shell = await container.openShell("zsh");
    
    // Try to set NODE_EXTRA_CA_CERTS with path traversal
    const result = await shell.runCommand(
      'export NODE_EXTRA_CA_CERTS="/tmp/../../../etc/passwd" && npm install axios'
    );

    // Should still succeed - safe-chain should reject path traversal
    assert.ok(
      result.output.includes("added") || result.output.includes("up to date"),
      `npm install failed with path traversal NODE_EXTRA_CA_CERTS. Output was:\n${result.output}`
    );
  });

  it(`npm install handles empty NODE_EXTRA_CA_CERTS`, async () => {
    const shell = await container.openShell("zsh");
    
    // Create an empty certificate file
    await shell.runCommand("touch /tmp/empty-certs.pem");
    
    const result = await shell.runCommand(
      'export NODE_EXTRA_CA_CERTS="/tmp/empty-certs.pem" && npm install axios'
    );

    // Should still succeed - empty file should be ignored gracefully
    assert.ok(
      result.output.includes("added") || result.output.includes("up to date"),
      `npm install failed with empty NODE_EXTRA_CA_CERTS. Output was:\n${result.output}`
    );
  });

  it(`npm install handles NODE_EXTRA_CA_CERTS pointing to a directory`, async () => {
    const shell = await container.openShell("zsh");
    
    // Create a directory instead of a file
    await shell.runCommand("mkdir -p /tmp/cert-dir");
    
    const result = await shell.runCommand(
      'export NODE_EXTRA_CA_CERTS="/tmp/cert-dir" && npm install axios'
    );

    // Should still succeed - directory should be treated as invalid cert file
    assert.ok(
      result.output.includes("added") || result.output.includes("up to date"),
      `npm install failed when NODE_EXTRA_CA_CERTS points to directory. Output was:\n${result.output}`
    );
  });

  it(`npm install handles relative NODE_EXTRA_CA_CERTS path`, async () => {
    const shell = await container.openShell("zsh");
    
    // Create a cert file and try to reference it with relative path
    await shell.runCommand(
      "mkdir -p /tmp/cert-test && cp /etc/ssl/certs/ca-certificates.crt /tmp/cert-test/certs.pem"
    );
    
    const result = await shell.runCommand(
      'cd /tmp/cert-test && export NODE_EXTRA_CA_CERTS="./certs.pem" && npm install axios'
    );

    // Should still succeed - relative paths should be resolved properly
    assert.ok(
      result.output.includes("added") || result.output.includes("up to date"),
      `npm install failed with relative NODE_EXTRA_CA_CERTS path. Output was:\n${result.output}`
    );
  });

  it(`npm install handles absolute NODE_EXTRA_CA_CERTS path`, async () => {
    const shell = await container.openShell("zsh");
    
    // Create cert file with absolute path
    await shell.runCommand("cp /etc/ssl/certs/ca-certificates.crt /tmp/absolute-certs.pem");
    
    const result = await shell.runCommand(
      "NODE_EXTRA_CA_CERTS=/tmp/absolute-certs.pem npm install axios"
    );

    assert.ok(
      result.output.includes("added") || result.output.includes("up to date"),
      `npm install failed with absolute NODE_EXTRA_CA_CERTS path. Output was:\n${result.output}`
    );
  });

  it(`npm install with multiple packages still respects merged certificates`, async () => {
    const shell = await container.openShell("zsh");
    
    // Create valid cert
    await shell.runCommand("cp /etc/ssl/certs/ca-certificates.crt /tmp/merge-certs.pem");
    
    const result = await shell.runCommand(
      "NODE_EXTRA_CA_CERTS=/tmp/merge-certs.pem npm install axios lodash"
    );

    assert.ok(
      result.output.includes("added") || result.output.includes("up to date"),
      `npm install with multiple packages failed. Output was:\n${result.output}`
    );
  });

  it(`npm install correctly blocks malware even with merged certificates`, async () => {
    const shell = await container.openShell("zsh");
    
    // Create valid cert
    await shell.runCommand("cp /etc/ssl/certs/ca-certificates.crt /tmp/secure-merge-certs.pem");
    
    const result = await shell.runCommand(
      "NODE_EXTRA_CA_CERTS=/tmp/secure-merge-certs.pem npm install safe-chain-test"
    );

    // Should block the malware package
    assert.ok(
      result.output.includes("Malicious") || result.output.includes("blocked"),
      `Malware package should be blocked even with merged certificates. Output was:\n${result.output}`
    );
  });

  it(`pip install works without NODE_EXTRA_CA_CERTS set`, async () => {
    const shell = await container.openShell("zsh");
    
    await shell.runCommand("safe-chain setup --include-python");
    await shell.runCommand("unset NODE_EXTRA_CA_CERTS");
    
    const result = await shell.runCommand(
      "pip3 install --break-system-packages requests"
    );

    assert.ok(
      result.output.includes("Successfully installed") || result.output.includes("Requirement already satisfied"),
      `pip3 install failed without NODE_EXTRA_CA_CERTS. Output was:\n${result.output}`
    );
  });

  it(`pip install works with valid NODE_EXTRA_CA_CERTS set`, async () => {
    const shell = await container.openShell("zsh");
    
    await shell.runCommand("safe-chain setup --include-python");
    
    // Create a temporary valid certificate
    await shell.runCommand("cp /etc/ssl/certs/ca-certificates.crt /tmp/pip-valid-certs.pem");
    
    const result = await shell.runCommand(
      "NODE_EXTRA_CA_CERTS=/tmp/pip-valid-certs.pem pip3 install --break-system-packages requests"
    );

    assert.ok(
      result.output.includes("Successfully installed") || result.output.includes("Requirement already satisfied"),
      `pip3 install failed with valid NODE_EXTRA_CA_CERTS. Output was:\n${result.output}`
    );
  });

  it(`pip install handles non-existent NODE_EXTRA_CA_CERTS gracefully`, async () => {
    const shell = await container.openShell("zsh");
    
    await shell.runCommand("safe-chain setup --include-python");
    
    const result = await shell.runCommand(
      'export NODE_EXTRA_CA_CERTS="/tmp/nonexistent-pip-certs.pem" && pip3 install --break-system-packages requests'
    );

    // Should still work - gracefully handle missing user certs
    assert.ok(
      result.output.includes("Successfully installed") || result.output.includes("Requirement already satisfied"),
      `pip3 install failed with non-existent NODE_EXTRA_CA_CERTS. Output was:\n${result.output}`
    );
  });

  it(`pip install handles invalid NODE_EXTRA_CA_CERTS gracefully`, async () => {
    const shell = await container.openShell("zsh");
    
    await shell.runCommand("safe-chain setup --include-python");
    
    // Create invalid cert
    await shell.runCommand(
      'echo "invalid certificate content" > /tmp/pip-invalid-certs.pem'
    );
    
    const result = await shell.runCommand(
      'export NODE_EXTRA_CA_CERTS="/tmp/pip-invalid-certs.pem" && pip3 install --break-system-packages requests'
    );

    // Should still work - skip invalid user certs
    assert.ok(
      result.output.includes("Successfully installed") || result.output.includes("Requirement already satisfied"),
      `pip3 install failed with invalid NODE_EXTRA_CA_CERTS. Output was:\n${result.output}`
    );
  });

  it(`yarn install works with valid NODE_EXTRA_CA_CERTS set`, async () => {
    const shell = await container.openShell("zsh");
    
    // Create valid cert
    await shell.runCommand("cp /etc/ssl/certs/ca-certificates.crt /tmp/yarn-certs.pem");
    
    const result = await shell.runCommand(
      "NODE_EXTRA_CA_CERTS=/tmp/yarn-certs.pem yarn add axios"
    );

    assert.ok(
      !result.output.toLowerCase().includes("error") || result.output.includes("Done"),
      `yarn add failed with valid NODE_EXTRA_CA_CERTS. Output was:\n${result.output}`
    );
  });

  it(`pnpm install works with valid NODE_EXTRA_CA_CERTS set`, async () => {
    const shell = await container.openShell("zsh");
    
    // Create valid cert
    await shell.runCommand("cp /etc/ssl/certs/ca-certificates.crt /tmp/pnpm-certs.pem");
    
    const result = await shell.runCommand(
      "NODE_EXTRA_CA_CERTS=/tmp/pnpm-certs.pem pnpm add axios"
    );

    assert.ok(
      !result.output.toLowerCase().includes("error") || result.output.includes("Progress"),
      `pnpm add failed with valid NODE_EXTRA_CA_CERTS. Output was:\n${result.output}`
    );
  });

  it(`bun install works with valid NODE_EXTRA_CA_CERTS set`, async () => {
    const shell = await container.openShell("bash");
    
    // Create valid cert and run bun in the same command to ensure file exists
    const result = await shell.runCommand(
      "cp /etc/ssl/certs/ca-certificates.crt /tmp/bun-certs.pem && NODE_EXTRA_CA_CERTS=/tmp/bun-certs.pem bun i axios"
    );

    assert.ok(
      !result.output.toLowerCase().includes("error") || result.output.includes("installed"),
      `bun i failed with valid NODE_EXTRA_CA_CERTS. Output was:\n${result.output}`
    );
  });
});
