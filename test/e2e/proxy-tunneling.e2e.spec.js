import { describe, it, before, beforeEach, afterEach } from "node:test";
import { DockerTestContainer } from "./DockerTestContainer.js";
import assert from "node:assert";

describe("E2E: Safe chain proxy tunneling", () => {
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

  it("should tunnel non-registry traffic via upstream proxy with authentication", async () => {
    // 1. Configure TinyProxy with Basic Auth
    const proxySetup = await container.openShell("zsh");
    await proxySetup.runCommand(
      `echo 'BasicAuth user password' >> /etc/tinyproxy/tinyproxy.conf`
    );
    await proxySetup.runCommand("service tinyproxy restart || tinyproxy");

    // 2. Setup a test script that makes a non-registry request (using curl)
    const setupShell = await container.openShell("zsh");
    // We use www.example.com as a stable target
    await setupShell.runCommand('npm pkg set scripts.test-curl="curl -v -I https://www.example.com"');

    // 3. Run the test script with HTTPS_PROXY set to the authenticated upstream proxy
    const testShell = await container.openShell("zsh");
    // Set the upstream proxy with credentials
    await testShell.runCommand('export HTTPS_PROXY="http://user:password@localhost:8888"');
    
    // Run the script via npm (which is wrapped by safe-chain)
    // safe-chain should inject its own proxy, which then tunnels to the upstream proxy
    const { output, command } = await testShell.runCommand("npm run test-curl");

    // 4. Verify the result
    // If safe-chain fails to authenticate with upstream, we expect a failure
    // curl -I returns HTTP 200 OK if successful
    
    const success = output.includes("HTTP/2 200") || output.includes("HTTP/1.1 200");
    
    if (!success) {
        console.log("Test failed. Output:", output);
    }

    assert.ok(success, "curl should successfully connect to example.com via the authenticated proxy");
  });
});
