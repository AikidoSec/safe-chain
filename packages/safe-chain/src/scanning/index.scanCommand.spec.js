import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { setTimeout } from "node:timers/promises";
import {
  MALWARE_ACTION_PROMPT,
  MALWARE_ACTION_BLOCK,
} from "../config/settings.js";

describe("scanCommand", async () => {
  const getScanTimeoutMock = mock.fn(() => 1000);
  const mockGetDependencyUpdatesForCommand = mock.fn();
  const mockStartProcess = mock.fn(() => ({
    setText: () => {},
    succeed: () => {},
    fail: () => {},
  }));
  const mockConfirm = mock.fn(() => true);
  let malwareAction = MALWARE_ACTION_PROMPT;

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
        startProcess: mockStartProcess,
        writeError: () => {},
        writeInformation: () => {},
        writeWarning: () => {},
        emptyLine: () => {},
        confirm: mockConfirm,
      },
    },
  });

  mock.module("../config/settings.js", {
    namedExports: {
      getMalwareAction: () => malwareAction,
      MALWARE_ACTION_PROMPT,
      MALWARE_ACTION_BLOCK,
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

  it("should succeed when there are no changes", async () => {
    let successMessageWasSet = false;
    mockStartProcess.mock.mockImplementationOnce(() => ({
      setText: () => {},
      succeed: () => {
        successMessageWasSet = true;
      },
      fail: () => {},
    }));
    mockGetDependencyUpdatesForCommand.mock.mockImplementation(() => []);

    await scanCommand(["install", "lodash"]);

    assert.equal(successMessageWasSet, true);
  });

  it("should succeed when changes are not malicious", async () => {
    let successMessageWasSet = false;
    mockStartProcess.mock.mockImplementationOnce(() => ({
      setText: () => {},
      succeed: () => {
        successMessageWasSet = true;
      },
      fail: () => {},
    }));
    mockGetDependencyUpdatesForCommand.mock.mockImplementation(() => [
      { name: "lodash", version: "4.17.21" },
    ]);

    await scanCommand(["install", "lodash"]);

    assert.equal(successMessageWasSet, true);
  });

  it("should throw an error when timing out", async () => {
    let failureMessageWasSet = false;
    mockStartProcess.mock.mockImplementationOnce(() => ({
      setText: () => {},
      succeed: () => {},
      fail: () => {
        failureMessageWasSet = true;
      },
    }));
    getScanTimeoutMock.mock.mockImplementationOnce(() => 100);
    mockGetDependencyUpdatesForCommand.mock.mockImplementation(async () => {
      await setTimeout(150);
      return [{ name: "lodash", version: "4.17.21" }];
    });

    await assert.rejects(scanCommand(["install", "lodash"]));

    assert.equal(failureMessageWasSet, true);
  });

  it("should fail and prompt the user when malicious changes are detected", async () => {
    let failureMessageWasSet = false;
    mockStartProcess.mock.mockImplementationOnce(() => ({
      setText: () => {},
      succeed: () => {},
      fail: () => {
        failureMessageWasSet = true;
      },
    }));
    mockGetDependencyUpdatesForCommand.mock.mockImplementation(() => [
      { name: "malicious", version: "1.0.0" },
    ]);
    let userWasPrompted = false;
    mockConfirm.mock.mockImplementationOnce(() => {
      userWasPrompted = true;
      return true; // Simulate user accepting the risk, otherwise the process would exit
    });

    await scanCommand(["install", "malicious"]);

    assert.equal(failureMessageWasSet, true);
    assert.equal(userWasPrompted, true);
  });

  it("should not report a timeout when the user takes a long time to respond (it should not affect the timeout)", async () => {
    let failureMessages = [];
    mockStartProcess.mock.mockImplementationOnce(() => ({
      setText: () => {},
      succeed: () => {},
      fail: (message) => {
        failureMessages.push(message);
      },
    }));
    getScanTimeoutMock.mock.mockImplementationOnce(() => 100);
    mockGetDependencyUpdatesForCommand.mock.mockImplementation(async () => {
      return [{ name: "malicious", version: "4.17.21" }];
    });
    mockConfirm.mock.mockImplementationOnce(async () => {
      await setTimeout(200);
      return true; // Simulate user accepting the risk, otherwise the process would exit
    });

    await scanCommand(["install", "malicious"]);

    assert.equal(failureMessages.length, 1);
    const failureMessage = failureMessages[0];
    assert.equal(failureMessage.toLowerCase().includes("timeout"), false);
    assert.equal(failureMessage.toLowerCase().includes("malicious"), true);
  });

  it("should exit immediately when malicious changes are detected in block mode", async () => {
    // Set malware action to block mode for this test
    malwareAction = MALWARE_ACTION_BLOCK;
    
    // Reset mock call count
    mockConfirm.mock.resetCalls();
    
    let failureMessageWasSet = false;
    let exitCode = null;
    
    mockStartProcess.mock.mockImplementationOnce(() => ({
      setText: () => {},
      succeed: () => {},
      fail: () => {
        failureMessageWasSet = true;
      },
    }));
    
    mockGetDependencyUpdatesForCommand.mock.mockImplementation(() => [
      { name: "malicious", version: "1.0.0" },
    ]);

    // Mock process.exit
    const originalExit = process.exit;
    process.exit = mock.fn((code) => {
      exitCode = code;
      throw new Error("Process exit called"); // Prevent actual exit
    });

    try {
      await assert.rejects(
        scanCommand(["install", "malicious"]),
        /Process exit called/
      );
    } finally {
      // Restore original process.exit
      process.exit = originalExit;
      // Reset malware action back to prompt mode for other tests
      malwareAction = MALWARE_ACTION_PROMPT;
    }

    assert.equal(failureMessageWasSet, true);
    assert.equal(exitCode, 1);
    // Confirm should not have been called in block mode
    assert.equal(mockConfirm.mock.callCount(), 0);
  });

  it("should exit immediately when malicious changes are detected in block mode without prompting", async () => {
    // Set malware action to block mode for this test
    malwareAction = MALWARE_ACTION_BLOCK;
    
    // Reset mock call count
    mockConfirm.mock.resetCalls();
    
    let processExited = false;
    let userWasPrompted = false;
    
    mockStartProcess.mock.mockImplementationOnce(() => ({
      setText: () => {},
      succeed: () => {},
      fail: () => {},
    }));
    
    mockGetDependencyUpdatesForCommand.mock.mockImplementation(() => [
      { name: "malicious", version: "1.0.0" },
    ]);

    mockConfirm.mock.mockImplementationOnce(() => {
      userWasPrompted = true;
      return false;
    });

    // Mock process.exit
    const originalExit = process.exit;
    process.exit = mock.fn(() => {
      processExited = true;
      throw new Error("Process exit called"); // Prevent actual exit
    });

    try {
      await assert.rejects(
        scanCommand(["install", "malicious"]),
        /Process exit called/
      );
    } finally {
      // Restore original process.exit
      process.exit = originalExit;
      // Reset malware action back to prompt mode for other tests
      malwareAction = MALWARE_ACTION_PROMPT;
    }

    assert.equal(processExited, true);
    assert.equal(userWasPrompted, false);
  });
});
