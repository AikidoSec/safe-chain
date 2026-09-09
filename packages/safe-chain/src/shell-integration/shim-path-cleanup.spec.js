import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.join(
  __dirname,
  "path-wrappers/templates/unix-wrapper.template.sh",
);

const isWindows = os.platform() === "win32";

/**
 * Renders the unix wrapper template for a tool into dir/<tool> and returns
 * the shim path, mirroring what setup-ci does.
 * @param {string} dir
 * @param {string} tool
 */
function renderShim(dir, tool) {
  const template = fs.readFileSync(templatePath, "utf-8");
  const content = template
    .replaceAll("{{PACKAGE_MANAGER}}", tool)
    .replaceAll("{{AIKIDO_COMMAND}}", `aikido-${tool}`);
  const shimPath = path.join(dir, tool);
  fs.writeFileSync(shimPath, content, "utf-8");
  fs.chmodSync(shimPath, 0o755);
  return shimPath;
}

/**
 * @param {string} dir
 * @param {string} name
 * @param {string} script
 */
function writeScript(dir, name, script) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, script, "utf-8");
  fs.chmodSync(p, 0o755);
  return p;
}

describe("unix shim PATH cleanup", { skip: isWindows }, () => {
  /** @type {string} */
  let tmpDir;
  /** @type {string} */
  let shimsDir;
  /** @type {string} */
  let binDir;
  /** @type {string} */
  let shimPath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "safe-chain-shim-test-"));
    shimsDir = path.join(tmpDir, "shims");
    binDir = path.join(tmpDir, "bin");
    fs.mkdirSync(shimsDir);
    fs.mkdirSync(binDir);
    shimPath = renderShim(shimsDir, "python");
    // Fake safe-chain binary that reports how it was invoked
    writeScript(
      binDir,
      "safe-chain",
      `#!/bin/sh\necho "SAFE_CHAIN_CALLED tool=$1"\necho "SAFE_CHAIN_PATH=$PATH"\nexit 0\n`,
    );
    // Fake real python
    writeScript(
      binDir,
      "python",
      `#!/bin/sh\necho "REAL_PYTHON args=$*"\necho "REAL_PYTHON_PATH=$PATH"\nexit 0\n`,
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /**
   * @param {string} pathEnv
   */
  function runShim(pathEnv) {
    return spawnSync(shimPath, ["--version"], {
      env: { PATH: pathEnv },
      encoding: "utf-8",
      timeout: 10000,
    });
  }

  it("strips the shim directory from PATH when it is in the middle", () => {
    const res = runShim(`${shimsDir}:${binDir}:/usr/bin:/bin`);
    assert.match(res.stdout, /SAFE_CHAIN_CALLED tool=python/);
    const pathLine = res.stdout.match(/SAFE_CHAIN_PATH=(.*)/)?.[1] ?? "";
    assert.ok(
      !pathLine.split(":").includes(shimsDir),
      `shim dir must be removed from PATH, got: ${pathLine}`,
    );
  });

  it("strips the shim directory from PATH when it is the last entry", () => {
    // Regression test: the old sed-based removal required a trailing colon and
    // silently kept the shim dir when it was the last PATH entry, which caused
    // an infinite exec loop in combination with pyenv shims.
    const res = runShim(`${binDir}:/usr/bin:/bin:${shimsDir}`);
    assert.match(res.stdout, /SAFE_CHAIN_CALLED tool=python/);
    const pathLine = res.stdout.match(/SAFE_CHAIN_PATH=(.*)/)?.[1] ?? "";
    assert.ok(
      !pathLine.split(":").includes(shimsDir),
      `shim dir must be removed from PATH even as last entry, got: ${pathLine}`,
    );
  });

  it("strips the shim directory when PATH spells it with a trailing slash", () => {
    const res = runShim(`${binDir}:${shimsDir}/:/usr/bin:/bin`);
    assert.match(res.stdout, /SAFE_CHAIN_CALLED tool=python/);
    const pathLine = res.stdout.match(/SAFE_CHAIN_PATH=(.*)/)?.[1] ?? "";
    assert.ok(
      !pathLine.includes(shimsDir),
      `shim dir must be removed from PATH with trailing slash, got: ${pathLine}`,
    );
  });

  it("resolves the original tool when safe-chain is not available", () => {
    // No safe-chain on PATH: the shim must find and run the original python
    // even when its own directory is the first PATH entry.
    fs.rmSync(path.join(binDir, "safe-chain"));
    const res = runShim(`${shimsDir}:${binDir}:/usr/bin:/bin`);
    assert.match(res.stdout, /REAL_PYTHON args=--version/);
  });

  it("terminates instead of looping when pyenv resolves python back to the shim", () => {
    // Full regression scenario for the pyenv <-> safe-chain exec loop:
    // - pyenv's shim dir is first on PATH, safe-chain's shim dir is LAST
    //   (where the old PATH strip failed), and the only real python lives
    //   behind pyenv's system-version fallback.
    // - the fake safe-chain binary behaves like the python bypass: it
    //   re-spawns bare "python" via the PATH the shim handed it.
    const pyenvRoot = path.join(tmpDir, "pyenv");
    const pyenvShims = path.join(pyenvRoot, "shims");
    const pyenvBin = path.join(pyenvRoot, "bin");
    fs.mkdirSync(pyenvShims, { recursive: true });
    fs.mkdirSync(pyenvBin, { recursive: true });

    writeScript(
      pyenvShims,
      "python",
      `#!/bin/sh\nexport PYENV_ROOT="${pyenvRoot}"\nexec "${pyenvBin}/pyenv" exec python "$@"\n`,
    );
    // Mimics pyenv's system-version fallback: strip pyenv's own shim dir from
    // PATH and exec the next python found. Aborts loudly if the chain recurses.
    writeScript(
      pyenvBin,
      "pyenv",
      `#!/bin/sh
DEPTH=$((\${DEPTH:-0}+1)); export DEPTH
if [ "$DEPTH" -gt 5 ]; then echo "INFINITE_LOOP_DETECTED" >&2; exit 99; fi
shift
prog=$1; shift
newpath=$(echo "$PATH" | tr ':' '\\n' | grep -v -x "$PYENV_ROOT/shims" | tr '\\n' ':' | sed 's/:$//')
target=$(PATH="$newpath" command -v "$prog" || true)
if [ -z "$target" ]; then echo "NO_PYTHON_FOUND" >&2; exit 127; fi
exec "$target" "$@"
`,
    );
    // Fake safe-chain binary emulating the real one's python bypass
    writeScript(
      binDir,
      "safe-chain",
      `#!/bin/sh\nshift\nexec python "$@"\n`,
    );
    // No real python outside pyenv/safe-chain dirs
    fs.rmSync(path.join(binDir, "python"));

    const res = spawnSync(path.join(pyenvShims, "python"), ["--version"], {
      env: { PATH: `${pyenvShims}:${binDir}:/usr/bin:/bin:${shimsDir}` },
      encoding: "utf-8",
      timeout: 10000,
    });

    assert.notStrictEqual(res.status, null, "shim chain must not hang");
    assert.doesNotMatch(
      res.stderr ?? "",
      /INFINITE_LOOP_DETECTED/,
      `exec chain must terminate, got stderr: ${res.stderr}`,
    );
  });
});
