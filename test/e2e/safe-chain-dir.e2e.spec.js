import { describe, it, before, beforeEach, afterEach } from "node:test";
import { DockerTestContainer } from "./DockerTestContainer.js";
import assert from "node:assert";

const CUSTOM_DIR = "/usr/local/.safe-chain";

describe("E2E: SAFE_CHAIN_DIR support", () => {
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

  it("setup-ci installs shims in the custom directory when SAFE_CHAIN_DIR is set", async () => {
    const shell = await container.openShell("bash");
    await shell.runCommand(`export SAFE_CHAIN_DIR=${CUSTOM_DIR}`);
    await shell.runCommand("safe-chain setup-ci");

    // Shims should be in the custom dir
    const customShimResult = await shell.runCommand(
      `test -f ${CUSTOM_DIR}/shims/npm && echo "EXISTS"`
    );
    assert.ok(
      customShimResult.output.includes("EXISTS"),
      `Expected npm shim at ${CUSTOM_DIR}/shims/npm. Output:\n${customShimResult.output}`
    );

    // Default location should NOT have been created
    const defaultShimResult = await shell.runCommand(
      `test -d $HOME/.safe-chain/shims && echo "EXISTS" || echo "ABSENT"`
    );
    assert.ok(
      defaultShimResult.output.includes("ABSENT"),
      `Expected default shims dir to be absent. Output:\n${defaultShimResult.output}`
    );
  });

  it("setup-ci writes the custom directory path to GITHUB_PATH when SAFE_CHAIN_DIR is set", async () => {
    const shell = await container.openShell("bash");
    await shell.runCommand("export GITHUB_PATH=/tmp/github_path");
    await shell.runCommand(`export SAFE_CHAIN_DIR=${CUSTOM_DIR}`);
    await shell.runCommand("safe-chain setup-ci");

    const result = await shell.runCommand("cat /tmp/github_path");
    assert.ok(
      result.output.includes(`${CUSTOM_DIR}/shims`),
      `Expected GITHUB_PATH to contain custom shims dir. Output:\n${result.output}`
    );
    assert.ok(
      result.output.includes(`${CUSTOM_DIR}/bin`),
      `Expected GITHUB_PATH to contain custom bin dir. Output:\n${result.output}`
    );
  });

  it("safe-chain protects a non-root user when installed to a shared dir with SAFE_CHAIN_DIR", async () => {
    // Step 1: create a non-root user inside the container
    container.dockerExec("useradd -m safeuser");

    // Step 2: as root, run setup-ci with the shared SAFE_CHAIN_DIR
    const rootShell = await container.openShell("bash");
    await rootShell.runCommand(`export SAFE_CHAIN_DIR=${CUSTOM_DIR}`);
    await rootShell.runCommand("safe-chain setup-ci");

    // Step 3: simulate what install-safe-chain.sh does — place the safe-chain binary
    // in SAFE_CHAIN_DIR/bin. In Docker tests safe-chain is installed via npm/Volta,
    // so we symlink it there.
    container.dockerExec(`mkdir -p ${CUSTOM_DIR}/bin`);
    container.dockerExec(
      `ln -sf \\$(which safe-chain) ${CUSTOM_DIR}/bin/safe-chain`
    );

    // Step 4: make npm accessible to all users (in real Dockerfiles npm is installed
    // before the user switch; here Volta manages it for root, so we symlink it).
    container.dockerExec("ln -sf \\$(which npm) /usr/local/bin/npm");

    // Step 5: make the shared safe-chain dir readable + executable by all users
    container.dockerExec(`chmod -R a+rx ${CUSTOM_DIR}`);

    // Step 6: Volta installs under /root/.volta which is only accessible to root by
    // default. /root/ itself is mode 700, so safeuser can't traverse into it even
    // if .volta/ is world-readable. Fix both levels. Safe in a throw-away container.
    container.dockerExec("chmod a+x /root && chmod -R a+rX /root/.volta");

    // Step 7: as the non-root user, set SAFE_CHAIN_DIR and PATH, then run npm.
    // SAFE_CHAIN_DIR must be set so the shim knows which dir to strip from PATH
    // when invoking the real npm (prevents infinite loop).
    const userShell = await container.openShell("bash", { user: "safeuser" });
    await userShell.runCommand(`export SAFE_CHAIN_DIR=${CUSTOM_DIR}`);
    // Reuse root's Volta dir so safeuser doesn't trigger a slow first-run setup
    await userShell.runCommand("export VOLTA_HOME=/root/.volta");
    await userShell.runCommand(
      `export PATH="${CUSTOM_DIR}/shims:${CUSTOM_DIR}/bin:$PATH"`
    );
    const result = await userShell.runCommand(
      "npm i axios@1.13.0 --safe-chain-logging=verbose"
    );

    assert.ok(
      result.output.includes("Safe-chain: Scanned"),
      `Expected safe-chain to protect non-root user. Output:\n${result.output}`
    );
  });
});
