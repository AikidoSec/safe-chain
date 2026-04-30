// oxlint-disable no-console
import chalk from "chalk";
import { isCi } from "./environment.js";
import {
  getLoggingLevel,
  LOGGING_SILENT,
  LOGGING_VERBOSE,
} from "../config/settings.js";
import { writeToLogFile } from "./fileLogger.js";

/**
 * @type {{ bufferOutput: boolean, bufferedMessages:(() => void)[]}}
 */
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

  writeOrBuffer(() => console.log(""));
}

/**
 * @param {string} message
 * @param {...any} optionalParams
 * @returns {void}
 */
function writeInformation(message, ...optionalParams) {
  writeToLogFile("info", message, ...optionalParams);

  if (isSilentMode()) return;

  writeOrBuffer(() => console.log(message, ...optionalParams));
}

/**
 * @param {string} message
 * @param {...any} optionalParams
 * @returns {void}
 */
function writeWarning(message, ...optionalParams) {
  writeToLogFile("warning", message, ...optionalParams);
  writeWarningToConsole(message, ...optionalParams);
}

/**
 * Console-only warning. Used by fileLogger to surface its own failures
 * without re-entering writeToLogFile and creating a runtime cycle.
 *
 * @param {string} message
 * @param {...any} optionalParams
 * @returns {void}
 */
function writeWarningToConsole(message, ...optionalParams) {
  if (isSilentMode()) return;

  if (!isCi()) {
    message = chalk.yellow(message);
  }
  writeOrBuffer(() => console.warn(message, ...optionalParams));
}

/**
 * @param {string} message
 * @param {...any} optionalParams
 * @returns {void}
 */
function writeError(message, ...optionalParams) {
  writeToLogFile("error", message, ...optionalParams);

  if (!isCi()) {
    message = chalk.red(message);
  }
  writeOrBuffer(() => console.error(message, ...optionalParams));
}

function writeExitWithoutInstallingMaliciousPackages() {
  let message = "Safe-chain: Exiting without installing malicious packages.";
  writeToLogFile("error", message);

  if (!isCi()) {
    message = chalk.red(message);
  }
  writeOrBuffer(() => console.error(message));
}

/**
 * @param {string} message
 * @param {...any} optionalParams
 * @returns {void}
 */
function writeVerbose(message, ...optionalParams) {
  writeToLogFile("verbose", message, ...optionalParams);

  if (!isVerboseMode()) return;

  writeOrBuffer(() => console.log(message, ...optionalParams));
}

/**
 *
 * @param {() => void} messageFunction
 */
function writeOrBuffer(messageFunction) {
  if (state.bufferOutput) {
    state.bufferedMessages.push(messageFunction);
  } else {
    messageFunction();
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
  writeVerbose,
  writeInformation,
  writeWarning,
  writeWarningToConsole,
  writeError,
  writeExitWithoutInstallingMaliciousPackages,
  emptyLine,
  startBufferingLogs,
  writeBufferedLogsAndStopBuffering,
};
