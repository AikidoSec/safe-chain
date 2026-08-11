import { beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert";

let platform;
let executableExists;
let kernelStatus;
let kernelName;
let spawnCalls;

mock.module("../helpers.js", {
  namedExports: {
    doesExecutableExistOnSystem: () => executableExists,
    addLineToFile: () => {},
    removeLinesMatchingPattern: () => {},
  },
});

mock.module("../../config/safeChainDir.js", {
  namedExports: {
    getScriptsDir: () => "C:\\Users\\tester\\.safe-chain\\scripts",
  },
});

mock.module("os", {
  namedExports: {
    platform: () => platform,
  },
});

mock.module("child_process", {
  namedExports: {
    execSync: () => "C:\\Users\\tester\\.bashrc\n",
    spawnSync: (command, args, options) => {
      spawnCalls.push({ command, args, options });
      if (command === "bash" && args?.[0] === "-lc" && args?.[1] === "uname -s") {
        return {
          status: kernelStatus,
          stdout: kernelName,
          stderr: kernelStatus === 0 ? "" : "probe failed",
        };
      }

      return { status: 1, stdout: "", stderr: "unexpected probe" };
    },
  },
});

const bash = (await import("./bash.js")).default;

beforeEach(() => {
  platform = "linux";
  executableExists = true;
  kernelStatus = 0;
  kernelName = "MINGW64_NT-10.0-26100\n";
  spawnCalls = [];
});

describe("Bash detection on Windows hosts with WSL installed", () => {
  it("keeps native Linux Bash detection unchanged", () => {
    assert.strictEqual(bash.isInstalled(), true);
    assert.strictEqual(spawnCalls.length, 0);
  });

  it("returns false when bash is not available", () => {
    platform = "win32";
    executableExists = false;
    assert.strictEqual(bash.isInstalled(), false);
    assert.strictEqual(spawnCalls.length, 0);
  });

  it("does not treat the WSL Linux launcher as a Windows host shell", () => {
    platform = "win32";
    kernelName = "Linux\n";
    assert.strictEqual(bash.isInstalled(), false);
    assert.deepStrictEqual(spawnCalls[0]?.args, ["-lc", "uname -s"]);
  });

  it("recognizes Git Bash as a Windows host shell", () => {
    platform = "win32";
    kernelName = "MINGW64_NT-10.0-26100\n";
    assert.strictEqual(bash.isInstalled(), true);
  });

  it("recognizes Cygwin Bash as a Windows host shell", () => {
    platform = "win32";
    kernelName = "CYGWIN_NT-10.0-26100\n";
    assert.strictEqual(bash.isInstalled(), true);
  });

  it("fails closed when the Windows Bash kernel probe cannot run", () => {
    platform = "win32";
    kernelStatus = 1;
    kernelName = "";
    assert.strictEqual(bash.isInstalled(), false);
  });

  it("normalizes whitespace and case in the WSL kernel name", () => {
    platform = "win32";
    kernelName = "  LiNuX  \r\n";
    assert.strictEqual(bash.isInstalled(), false);
  });
});
