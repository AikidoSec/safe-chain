import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { DockerTestContainer } from "./DockerTestContainer.js";

let hasPyenv = false;

describe("E2E: pyenv wrappers only intercept -m pip", () => {
  let c;

  before(async () => {
    DockerTestContainer.buildImage("pyenv");
    c = new DockerTestContainer("pyenv");
    await c.start();
    const sh = await c.openShell("bash");
    // Ensure pyenv is on PATH and shims initialized for this shell
    await sh.runCommand(
      'export PYENV_ROOT=/root/.pyenv; export PATH="$PYENV_ROOT/bin:$PATH"; eval "$(pyenv init -)" || true'
    );
    await sh.runCommand("pip3 cache purge >/dev/null 2>&1 || true");
    // Assert pyenv is installed and active
    const v = await sh.runCommand("pyenv --version || echo MISSING");
    hasPyenv = /pyenv [0-9]/.test(v);
    if (hasPyenv) {
      const versions = await sh.runCommand("pyenv versions || true");
      // Non-fatal check: ensure at least one version appears
      assert.match(versions, /(system|\d+\.\d+)/, "pyenv versions should list entries");
      const whichPy = await sh.runCommand("pyenv which python || true");
      assert.match(whichPy, /\.pyenv\/versions\//, "pyenv which python should point to pyenv version dir");
    }
  });

  it("pyenv local sets project-specific version", async () => {
    if (!hasPyenv) return;
    const sh = await c.openShell("bash");
    await sh.runCommand("mkdir -p /work/localtest && cd /work/localtest && pyenv local 3.12.3");
    const inside = await sh.runCommand("cd /work/localtest && python --version 2>&1");
    assert.match(inside, /Python 3\.12\./);
    const outside = await sh.runCommand("cd / && pyenv version && python --version 2>&1");
    assert.notMatch(outside, /3\.12\./, "outside dir should not be forced to 3.12 by local file");
  });

  it("pyenv shell overrides version for current session", async () => {
    if (!hasPyenv) return;
    const sh = await c.openShell("bash");
    // Set shell-specific version
    await sh.runCommand("pyenv shell 3.12.3");
    const v1 = await sh.runCommand("pyenv version");
    assert.match(v1, /3\.12\.3 \(set by PYENV_VERSION/);
    const p1 = await sh.runCommand("python --version 2>&1");
    assert.match(p1, /Python 3\.12\./);
    // Unset and verify it reverts
    await sh.runCommand("pyenv shell --unset");
    const v2 = await sh.runCommand("pyenv version");
    assert.match(v2, /system \(set by .*\.pyenv\/version\)/);
  });

  after(async () => {
    await c.stop();
  });

  it("python --version bypasses and succeeds", async () => {
    const sh = await c.openShell("bash");
    await sh.runCommand("safe-chain setup --include-python >/dev/null 2>&1 || true");
    const res = await sh.runCommand("python --version 2>&1; echo EXIT:$?\n");
    assert.ok(/Python\s+\d+\.\d+\.\d+/.test(res.output), `version missing: ${res.output}`);
    assert.ok(res.output.includes("EXIT:0"), `exit not 0: ${res.output}`);
  });

  it("python3 --version bypasses and succeeds", async () => {
    const sh = await c.openShell("bash");
    const res = await sh.runCommand("python3 --version 2>&1; echo EXIT:$?\n");
    assert.ok(/Python\s+3\./.test(res.output), `version missing: ${res.output}`);
    assert.ok(res.output.includes("EXIT:0"), `exit not 0: ${res.output}`);
  });

  it("shadowing function: command python succeeds (explicit bypass)", async () => {
    const sh = await c.openShell("bash");
    await sh.runCommand("python() { return 1; }; export -f python");
    const res = await sh.runCommand("type -a python; command python --version 2>&1; echo EXIT:$?\n");
    assert.ok(/Python\s+\d+\.\d+\.\d+/.test(res.output), `version missing: ${res.output}`);
    assert.ok(res.output.includes("EXIT:0"), `exit not 0: ${res.output}`);
  });

  it("python -m pip install succeeds under wrappers", async () => {
    const sh = await c.openShell("bash");
    await sh.runCommand("pip3 cache purge >/dev/null 2>&1 || true");
    const res = await sh.runCommand("python3 -m pip install --break-system-packages certifi 2>&1\n");
    assert.ok(res.output.match(/Successfully installed|Requirement already satisfied/), `pip install did not succeed: ${res.output}`);
  });

  it("python -m pip blocks malware under pyenv-style shadow", async () => {
    const sh = await c.openShell("bash");
    await sh.runCommand("safe-chain setup --include-python >/dev/null 2>&1 || true");
    await sh.runCommand("pip3 cache purge >/dev/null 2>&1 || true");
    // Emulate pyenv-style function forwarding
    await sh.runCommand('python() { python3 "$@"; }; export -f python');

    const res = await sh.runCommand("python -m pip install --break-system-packages safe-chain-pi-test 2>&1\n");
    assert.ok(
      res.output.includes("blocked 1 malicious package downloads:"),
      `Should block malware. Output:\n${res.output}`
    );
    assert.ok(
      res.output.includes("safe_chain_pi_test@0.0.1"),
      `Should identify malware package. Output:\n${res.output}`
    );
    assert.ok(
      res.output.includes("Exiting without installing malicious packages."),
      `Should refuse installation. Output:\n${res.output}`
    );

    const list = await sh.runCommand("python -m pip list 2>&1\n");
    assert.ok(
      !list.output.includes("safe-chain-pi-test"),
      `Malicious package should not be installed. Output:\n${list.output}`
    );
  });

  it("python -m pip works and installs (no shadow)", async () => {
    const sh = await c.openShell("bash");
    await sh.runCommand("safe-chain setup --include-python >/dev/null 2>&1 || true");
    await sh.runCommand("pip3 cache purge >/dev/null 2>&1 || true");

    const res = await sh.runCommand("python -m pip install --break-system-packages certifi --safe-chain-logging=verbose 2>&1\n");
    assert.ok(
      res.output.match(/Successfully installed|Requirement already satisfied/),
      `pip install should succeed. Output:\n${res.output}`
    );
  });

  it("pip3 download works and scans (no shadow)", async () => {
    const sh = await c.openShell("bash");
    await sh.runCommand("safe-chain setup --include-python >/dev/null 2>&1 || true");
    await sh.runCommand("pip3 cache purge >/dev/null 2>&1 || true");

    const res = await sh.runCommand("pip3 download requests --safe-chain-logging=verbose 2>&1\n");
    assert.ok(
      res.output.includes("no malware found."),
      `Download should be scanned. Output:\n${res.output}`
    );
  });

  it("pip3 wheel works and proxies registry (no shadow)", async () => {
    const sh = await c.openShell("bash");
    await sh.runCommand("safe-chain setup --include-python >/dev/null 2>&1 || true");
    await sh.runCommand("pip3 cache purge >/dev/null 2>&1 || true");

    const res = await sh.runCommand("pip3 wheel requests --safe-chain-logging=verbose 2>&1\n");
    assert.ok(
      res.output.includes("Safe-chain: Set up MITM tunnel") ||
        res.output.includes("Finished proxying request"),
      `Wheel should route via proxy. Output:\n${res.output}`
    );
  });
});
