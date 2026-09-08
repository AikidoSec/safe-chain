import { describe, it, before, beforeEach, afterEach } from "node:test";
import { DockerTestContainer } from "./DockerTestContainer.js";
import assert from "node:assert";

// Regression tests for the infinite exec loop between pyenv and safe-chain
// shims: pyenv (on "system" version) resolves python via a PATH lookup and can
// land on safe-chain's shim; that shim execs safe-chain, which re-spawns
// python via PATH and lands back on pyenv's shim. The chain only terminates
// because safe-chain's shim removes its own directory from PATH — so that
// removal must work for every PATH spelling, or python hangs forever.
describe("E2E: pyenv and safe-chain shims interplay", () => {
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

  /**
   * Sets up safe-chain CI shims and pyenv in one shell:
   * - a fake pyenv version so `pyenv rehash` generates python shims,
   * - global version "system", so pyenv resolves python via a PATH lookup,
   * - pyenv shims first on PATH, safe-chain's shims dir (in the given
   *   spelling) before the real python locations.
   */
  async function setupPyenvWithSafeChainShims(shell, safeChainShimsDirSpelling) {
    await shell.runCommand("safe-chain setup-ci");
    await shell.runCommand(
      "mkdir -p /root/.pyenv/versions/3.99.0/bin && " +
        "ln -s /usr/local/bin/python3 /root/.pyenv/versions/3.99.0/bin/python3"
    );
    await shell.runCommand(
      'export PYENV_ROOT=/root/.pyenv && export PATH="$PYENV_ROOT/bin:$PATH" && ' +
        "pyenv rehash && pyenv global system"
    );
    await shell.runCommand(
      `export PATH="$PYENV_ROOT/shims:${safeChainShimsDirSpelling}:$PATH"`
    );

    // Precondition for the loop scenario: pyenv's system-version fallback must
    // resolve python3 to the safe-chain shim, not directly to a real python
    const which = await shell.runCommand("pyenv which python3");
    assert.ok(
      which.output.includes(".safe-chain/shims"),
      `Expected pyenv to resolve python3 to the safe-chain shim, got: ${which.output}`
    );
  }

  it("python3 runs when pyenv resolves it through the safe-chain shim", async () => {
    const shell = await container.openShell("bash");
    await setupPyenvWithSafeChainShims(shell, "/root/.safe-chain/shims");

    const result = await shell.runCommand("python3 --version");
    assert.ok(
      result.output.match(/Python \d+\.\d+\.\d+/),
      `Expected a python version (not an exec loop / hang), output was: ${result.output}`
    );
  });

  it("python3 runs when PATH spells the shims dir with a trailing slash", async () => {
    // Regression: the old sed-based PATH cleanup in the shim only matched the
    // exact "dir:" spelling, so "dir/:" (or the dir as last PATH entry) kept
    // the shim reachable and python looped forever between the pyenv and
    // safe-chain shims.
    const shell = await container.openShell("bash");
    await setupPyenvWithSafeChainShims(shell, "/root/.safe-chain/shims/");

    const result = await shell.runCommand("python3 --version");
    assert.ok(
      result.output.match(/Python \d+\.\d+\.\d+/),
      `Expected a python version (not an exec loop / hang), output was: ${result.output}`
    );
  });
});
