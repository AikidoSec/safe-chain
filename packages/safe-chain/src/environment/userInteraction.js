// oxlint-disable no-console
import chalk from "chalk";
import ora from "ora";
import { isCi } from "./environment.js";
import {
  getLoggingLevel,
  LOGGING_SILENT,
  LOGGING_VERBOSE,
} from "../config/settings.js";

const state = {
  bufferOutput: false,
  bufferedMessages: [],
};

function isSilentMode() {
  return getLoggingLevel() === LOGGING_SILENT;
}

function isVerboseMode() {
  return getLoggingLevel() === LOGGING_VERBOSE;
}

function emptyLine() {
  if (isSilentMode()) return;

  writeInformation("");
}

function writeInformation(message, ...optionalParams) {
  if (isSilentMode()) return;

  writeOrBuffer(() => console.log(message, ...optionalParams));
}

function writeWarning(message, ...optionalParams) {
  if (isSilentMode()) return;

  if (!isCi()) {
    message = chalk.yellow(message);
  }
  writeOrBuffer(() => console.warn(message, ...optionalParams));
}

function writeError(message, ...optionalParams) {
  if (!isCi()) {
    message = chalk.red(message);
  }
  writeOrBuffer(() => console.error(message, ...optionalParams));
}

function writeExitWithoutInstallingMaliciousPackages() {
  let message = "Safe-chain: Exiting without installing malicious packages.";
  if (!isCi()) {
    message = chalk.red(message);
  }
  writeOrBuffer(() => console.error(message));
}

function writeVerboseInformation(message, ...optionalParams) {
  if (!isVerboseMode()) return;

  writeOrBuffer(() => console.log(message, ...optionalParams));
}

function writeOrBuffer(messageFunction) {
  if (state.bufferOutput) {
    state.bufferedMessages.push(messageFunction);
  } else {
    messageFunction();
  }
}

function startProcess(message) {
  if (isSilentMode()) {
    return {
      succeed: () => {},
      fail: () => {},
      stop: () => {},
      setText: () => {},
    };
  }

  if (isCi()) {
    return {
      succeed: (message) => {
        writeInformation(message);
      },
      fail: (message) => {
        writeError(message);
      },
      stop: () => {},
      setText: (message) => {
        writeInformation(message);
      },
    };
  } else {
    const spinner = ora(message).start();
    return {
      succeed: (message) => {
        spinner.succeed(message);
      },
      fail: (message) => {
        spinner.fail(message);
      },
      stop: () => {
        spinner.stop();
      },
      setText: (message) => {
        spinner.text = message;
      },
    };
  }
}

function startBufferingLogs() {
  state.bufferOutput = true;
  state.bufferedMessages = [];
}

function writeBufferedLogsAndStopBuffering() {
  state.bufferOutput = false;
  for (const log of state.bufferedMessages) {
    log();
  }
  state.bufferedMessages = [];
}

export const ui = {
  writeInformation,
  writeVerboseInformation,
  writeWarning,
  writeError,
  writeExitWithoutInstallingMaliciousPackages,
  emptyLine,
  startProcess,
  startBufferingLogs,
  writeBufferedLogsAndStopBuffering,
};
