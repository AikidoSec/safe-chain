import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const startupScriptsDir = path.join(__dirname, "startup-scripts");

const isWindows = os.platform() === "win32";

/**
 * @param {string} shell
 */
function hasShell(shell) {
  return spawnSync(shell, ["-c", "exit 0"]).status === 0;
}

const shells = [
  {
    shell: "bash",
    initFile: "init-posix.sh",
    command: '. "$1"; PATH="$2"; removeSafeChainShimFromPath',
  },
  {
    shell: "zsh",
    initFile: "init-posix.sh",
    command: '. "$1"; PATH="$2"; removeSafeChainShimFromPath',
  },
  {
    shell: "fish",
    initFile: "init-fish.fish",
    // fish splits PATH on ":" when it is assigned as a single string.
    // `string join` exits 1 for a single entry, which is fine inside PATH=(...).
    command:
      "source $argv[1]; set PATH $argv[2]; removeSafeChainShimFromPath; true",
  },
];

for (const { shell, initFile, command } of shells) {
  describe(
    `${initFile} removeSafeChainShimFromPath (${shell})`,
    { skip: isWindows || !hasShell(shell) },
    () => {
      /** @type {string} */
      let tmpDir;
      /** @type {string} */
      let shimsDir;
      /** @type {string} */
      let initScript;

      beforeEach(() => {
        // Resolve the tmp dir so the expected shims dir matches `pwd -P`
        // (on macOS /var is a symlink to /private/var).
        tmpDir = fs.realpathSync(
          fs.mkdtempSync(path.join(os.tmpdir(), "safe-chain-init-test-")),
        );
        shimsDir = path.join(tmpDir, "shims");
        fs.mkdirSync(shimsDir);
        fs.mkdirSync(path.join(tmpDir, "scripts"));
        initScript = path.join(tmpDir, "scripts", initFile);
        fs.copyFileSync(path.join(startupScriptsDir, initFile), initScript);
      });

      afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      });

      /**
       * Sources the init script and prints PATH with the shims removed.
       * @param {string} pathValue
       */
      function removeShims(pathValue) {
        const result = spawnSync(
          shell,
          shell === "fish"
            ? ["-c", command, initScript, pathValue]
            : ["-c", command, shell, initScript, pathValue],
          {
            encoding: "utf-8",
            // Keep fish from writing history/cache into the real home dir
            env: {
              ...process.env,
              XDG_DATA_HOME: tmpDir,
              XDG_CACHE_HOME: tmpDir,
              XDG_CONFIG_HOME: tmpDir,
            },
          },
        );
        assert.strictEqual(result.status, 0, result.stderr);
        // fish prints a trailing newline; command substitution strips it anyway
        return result.stdout.replace(/\n$/, "");
      }

      it("removes the shims dir", () => {
        assert.strictEqual(
          removeShims(`/usr/bin:${shimsDir}:/bin`),
          "/usr/bin:/bin",
        );
      });

      it("removes the shims dir when it is first or last in PATH", () => {
        assert.strictEqual(removeShims(`${shimsDir}:/usr/bin`), "/usr/bin");
        assert.strictEqual(removeShims(`/usr/bin:${shimsDir}`), "/usr/bin");
      });

      it("removes the shims dir with trailing slashes", () => {
        assert.strictEqual(
          removeShims(`/usr/bin:${shimsDir}//:/bin`),
          "/usr/bin:/bin",
        );
      });

      it("removes a symlink pointing at the shims dir", () => {
        const link = path.join(tmpDir, "link");
        fs.mkdirSync(link);
        fs.symlinkSync(shimsDir, path.join(link, "shims"));
        assert.strictEqual(
          removeShims(`/usr/bin:${path.join(link, "shims")}:/bin`),
          "/usr/bin:/bin",
        );
      });

      it("removes a symlink to the shims dir with a different name", () => {
        const alias = path.join(tmpDir, "sc-link");
        fs.symlinkSync(shimsDir, alias);
        assert.strictEqual(
          removeShims(`/usr/bin:${alias}:/bin`),
          "/usr/bin:/bin",
        );
      });

      it("keeps other dirs named shims and prefixes of the shims dir", () => {
        const otherShims = path.join(tmpDir, "other", "shims");
        fs.mkdirSync(otherShims, { recursive: true });
        const pathValue = `${otherShims}:${shimsDir}-old:/usr/bin`;
        assert.strictEqual(removeShims(pathValue), pathValue);
      });

      it("keeps empty PATH entries", () => {
        // fish itself turns empty PATH entries into "." on assignment
        assert.strictEqual(
          removeShims(`/usr/bin::${shimsDir}:/bin`),
          shell === "fish" ? "/usr/bin:.:/bin" : "/usr/bin::/bin",
        );
      });
    },
  );
}
