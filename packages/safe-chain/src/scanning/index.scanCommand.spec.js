import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { setTimeout } from "node:timers/promises";

describe("scanCommand", async () => {
  const getScanTimeoutMock = mock.fn(() => 1000);
  const mockGetDependencyUpdatesForCommand = mock.fn();

  // import { getPackageManager } from "../packagemanager/currentPackageManager.js";
  mock.module("../packagemanager/currentPackageManager.js", {
    namedExports: {
      getPackageManager: () => {
        return {
          isSupportedCommand: () => true,
          getDependencyUpdatesForCommand: mockGetDependencyUpdatesForCommand,
        };
      },
    },
  });

  // import { getScanTimeout } from "../config/configFile.js";
  mock.module("../config/configFile.js", {
    namedExports: {
      getScanTimeout: getScanTimeoutMock,
      getBaseUrl: () => undefined,
    },
  });

  // import { ui } from "../environment/userInteraction.js";
  mock.module("../environment/userInteraction.js", {
    namedExports: {
      ui: {
        writeError: () => {},
        writeInformation: () => {},
        writeWarning: () => {},
        writeExitWithoutInstallingMaliciousPackages: () => {},
        emptyLine: () => {},
      },
    },
  });

  // import { auditChanges, MAX_LENGTH_EXCEEDED } from "./audit/index.js";
  mock.module("./audit/index.js", {
    namedExports: {
      auditChanges: (changes) => {
        const malisciousChangeName = "malicious";
        const allowedChanges = changes.filter(
          (change) => change.name !== malisciousChangeName
        );
        const disallowedChanges = changes
          .filter((change) => change.name === malisciousChangeName)
          .map((change) => ({
            ...change,
            reason: "malicious",
          }));
        const auditResults = {
          allowedChanges,
          disallowedChanges,
          isAllowed: disallowedChanges.length === 0,
        };

        return auditResults;
      },
      MAX_LENGTH_EXCEEDED: "MAX_LENGTH_EXCEEDED",
    },
  });

  const { scanCommand } = await import("./index.js");

  it("should fail when there are no changes to prevent bypass", async () => {
    mockGetDependencyUpdatesForCommand.mock.mockImplementation(() => []);

    const result = await scanCommand(["install"]);

    assert.equal(result, 1);
  });

  it("should block no-operand install command (CVE mitigation)", async () => {
    mockGetDependencyUpdatesForCommand.mock.mockImplementation(() => []);

    const result = await scanCommand(["install"]);

    assert.equal(result, 1, "No-operand install should be blocked");
  });

  it("should block no-operand install --offline command (CVE mitigation)", async () => {
    mockGetDependencyUpdatesForCommand.mock.mockImplementation(() => []);

    const result = await scanCommand(["install", "--offline"]);

    assert.equal(result, 1, "No-operand install --offline should be blocked");
  });

  it("should block no-operand up command (CVE mitigation)", async () => {
    mockGetDependencyUpdatesForCommand.mock.mockImplementation(() => []);

    const result = await scanCommand(["up"]);

    assert.equal(result, 1, "No-operand up command should be blocked");
  });

  it("should block no-operand upgrade command (CVE mitigation)", async () => {
    mockGetDependencyUpdatesForCommand.mock.mockImplementation(() => []);

    const result = await scanCommand(["upgrade"]);

    assert.equal(result, 1, "No-operand upgrade command should be blocked");
  });

  it("should block install with only flags and no packages (CVE mitigation)", async () => {
    mockGetDependencyUpdatesForCommand.mock.mockImplementation(() => []);

    const result = await scanCommand(["install", "--production", "--frozen-lockfile"]);

    assert.equal(result, 1, "Install with only flags should be blocked");
  });

  it("should block install with cache-related flags (CVE mitigation)", async () => {
    mockGetDependencyUpdatesForCommand.mock.mockImplementation(() => []);

    const result = await scanCommand(["install", "--prefer-offline"]);

    assert.equal(result, 1, "Install with cache flags should be blocked");
  });

  it("should succeed when changes are not malicious", async () => {
    mockGetDependencyUpdatesForCommand.mock.mockImplementation(() => [
      { name: "lodash", version: "4.17.21" },
    ]);

    const result = await scanCommand(["install", "lodash"]);

    assert.equal(result, 0, "Install with explicit package should succeed");
  });

  it("should succeed when installing explicit package with version", async () => {
    mockGetDependencyUpdatesForCommand.mock.mockImplementation(() => [
      { name: "lodash", version: "4.17.21" },
    ]);

    const result = await scanCommand(["add", "lodash@4.17.21"]);

    assert.equal(result, 0, "Install with explicit package and version should succeed");
  });

  it("should succeed when installing multiple explicit packages", async () => {
    mockGetDependencyUpdatesForCommand.mock.mockImplementation(() => [
      { name: "lodash", version: "4.17.21" },
      { name: "express", version: "4.18.2" },
    ]);

    const result = await scanCommand(["add", "lodash", "express"]);

    assert.equal(result, 0, "Install with multiple explicit packages should succeed");
  });

  it("should throw an error when timing out", async () => {
    getScanTimeoutMock.mock.mockImplementationOnce(() => 100);
    mockGetDependencyUpdatesForCommand.mock.mockImplementation(async () => {
      await setTimeout(150);
      return [{ name: "lodash", version: "4.17.21" }];
    });

    await assert.rejects(scanCommand(["install", "lodash"]));
  });

  it("should fail and return 1 malicious changes are detected", async () => {
    mockGetDependencyUpdatesForCommand.mock.mockImplementation(() => [
      { name: "malicious", version: "1.0.0" },
    ]);

    const result = await scanCommand(["install", "malicious"]);

    assert.equal(result, 1);
  });
});
