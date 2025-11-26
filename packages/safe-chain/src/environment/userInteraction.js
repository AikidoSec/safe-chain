// oxlint-disable no-console
import chalk from "chalk";
import { isCi } from "./environment.js";
import {
  getLoggingLevel,
  LOGGING_SILENT,
  LOGGING_VERBOSE,
} from "../config/settings.js";

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

  writeInformation("");
}

/**
 * @param {string} message
 * @param {...any} optionalParams
 * @returns {void}
 */
function writeInformation(message, ...optionalParams) {
  if (isSilentMode()) return;

  writeOrBuffer(() => console.log(message, ...optionalParams));
}

/**
 * @param {string} message
 * @param {...any} optionalParams
 * @returns {void}
 */
function writeWarning(message, ...optionalParams) {
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

/**
 * @param {string} message
 * @param {...any} optionalParams
 * @returns {void}
 */
function writeVerbose(message, ...optionalParams) {
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
  writeError,
  writeExitWithoutInstallingMaliciousPackages,
  emptyLine,
  startBufferingLogs,
  writeBufferedLogsAndStopBuffering,
};
