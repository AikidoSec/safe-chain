import { describe, it } from "node:test";
import assert from "node:assert";
import {
  deriveInstallDirFromExecutablePath,
  getInstalledSafeChainDir,
} from "./installLocation.js";

describe("deriveInstallDirFromExecutablePath", () => {
  it("derives the install dir from a Unix binary path", () => {
    assert.strictEqual(
      deriveInstallDirFromExecutablePath("/usr/local/.safe-chain/bin/safe-chain"),
      "/usr/local/.safe-chain",
    );
  });

  it("derives the install dir from a Windows binary path", () => {
    assert.strictEqual(
      deriveInstallDirFromExecutablePath("C:\\ProgramData\\safe-chain\\bin\\safe-chain.exe"),
      "C:\\ProgramData\\safe-chain",
    );
  });

  it("returns undefined when the executable is not inside a bin directory", () => {
    assert.strictEqual(
      deriveInstallDirFromExecutablePath("/usr/local/.safe-chain/safe-chain"),
      undefined,
    );
  });
});

describe("getInstalledSafeChainDir", () => {
  it("returns undefined for non-packaged executions", () => {
    assert.strictEqual(
      getInstalledSafeChainDir({
        isPackaged: false,
        executablePath: "/usr/local/.safe-chain/bin/safe-chain",
      }),
      undefined,
    );
  });

  it("returns the install dir for packaged executions", () => {
    assert.strictEqual(
      getInstalledSafeChainDir({
        isPackaged: true,
        executablePath: "/usr/local/.safe-chain/bin/safe-chain",
      }),
      "/usr/local/.safe-chain",
    );
  });
});
