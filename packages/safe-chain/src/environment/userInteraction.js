// oxlint-disable no-console
import chalk from "chalk";
import ora from "ora";
import { isCi } from "./environment.js";
import { getLoggingLevel, LOGGING_SILENT } from "../config/settings.js";

function isSilentMode() {
  return getLoggingLevel() === LOGGING_SILENT;
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

  console.log(message, ...optionalParams);
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
  console.warn(message, ...optionalParams);
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
  console.error(message, ...optionalParams);
}

function writeExitWithoutInstallingMaliciousPackages() {
  let message = "Safe-chain: Exiting without installing malicious packages.";
  if (!isCi()) {
    message = chalk.red(message);
  }
  console.error(message);
}

/**
 * @typedef {Object} Spinner
 * @property {(message: string) => void} succeed
 * @property {(message: string) => void} fail
 * @property {() => void} stop
 * @property {(message: string) => void} setText
 */

/**
 * @param {string} message
 *
 * @returns {Spinner}
 */
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

export const ui = {
  writeInformation,
  writeWarning,
  writeError,
  writeExitWithoutInstallingMaliciousPackages,
  emptyLine,
  startProcess,
};
