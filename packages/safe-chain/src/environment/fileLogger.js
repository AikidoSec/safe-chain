import fs from "fs";
import path from "path";
import {
  getLogFileFormat,
  getLogFileVerbosity,
  LOG_FILE_FORMAT_JSON,
  LOGGING_SILENT,
  LOGGING_VERBOSE,
} from "../config/settings.js";

/**
 * @type {{
 *   stream: fs.WriteStream | null,
 *   filePath: string,
 *   command: string,
 *   format: string,
 *   verbosity: string,
 *   warn: ((msg: string) => void) | null,
 * }}
 */
const state = {
  stream: null,
  filePath: "",
  command: "",
  // Placeholder; initializeFileLogger resolves the real value via
  // getLogFileFormat() before the first write. Must be a literal, not
  // LOG_FILE_FORMAT_JSON: settings.js -> ui -> fileLogger.js is a real
  // import cycle and the constant is in the temporal dead zone when this
  // module body runs from the settings -> ui chain.
  format: "json",
  // Same TDZ concern as `format`: literal placeholder, real value resolved
  // in initializeFileLogger.
  verbosity: "verbose",
  // One-shot. reportFailureOnce consumes it on first failure so subsequent
  // failures (sync or async) stay silent. The caller must be a sink that
  // does NOT re-enter writeToLogFile, otherwise the cycle returns.
  warn: null,
};

/**
 * Opens a write stream in append mode and writes a session-start entry.
 * Idempotent: calls while logging is active are ignored. If the file path
 * is not writable, logs a warning and stays inactive.
 *
 * @param {string} filePath
 * @param {(msg: string) => void} warnFn console-only warning sink. Must not
 *   re-enter writeToLogFile (use ui.writeWarningToConsole, not ui.writeWarning)
 *   to keep failure reporting cycle-free.
 */
export function initializeFileLogger(filePath, warnFn) {
  if (state.stream) return;

  // Set the warn sink before the try block so reportFailureOnce can be
  // used in the catch. That keeps the failure path uniform (sync init,
  // sync write, async stream error all go through the same helper, which
  // nulls state.stream defensively).
  state.warn = warnFn;

  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    state.stream = fs.createWriteStream(filePath, { flags: "a" });
  } catch (/** @type {any} */ err) {
    reportFailureOnce(`Failed to open log file ${filePath}: ${err.message}`);
    return;
  }

  state.filePath = filePath;
  state.format = getLogFileFormat();
  state.verbosity = getLogFileVerbosity();
  state.command = process.argv.slice(2).join(" ");

  state.stream.on("error", (err) => {
    reportFailureOnce(`Failed to write to log file: ${err.message}`);
  });

  writeToLogFile("info", "Log started, command:", state.command);
}

export function isFileLoggingActive() {
  return state.stream !== null;
}

/**
 * Writes a log entry to the file. No-op when not active. Accepts the same
 * trailing-params shape as console.log.
 *
 * @param {"info" | "warning" | "error" | "verbose"} level
 * @param {string} message
 * @param {...any} params
 */
export function writeToLogFile(level, message, ...params) {
  if (!state.stream) return;
  if (!shouldWriteLevel(level)) return;
  try {
    state.stream.write(formatLine(level, message, params));
  } catch (/** @type {any} */ err) {
    reportFailureOnce(`Failed to write to log file: ${err?.message ?? err}`);
  }
}

/**
 * @param {string} level
 * @returns {boolean}
 */
function shouldWriteLevel(level) {
  if (state.verbosity === LOGGING_VERBOSE) return true;
  if (state.verbosity === LOGGING_SILENT) return level === "error";
  // LOGGING_NORMAL: drop verbose, keep info/warning/error.
  return level !== "verbose";
}

/**
 * Disables further file logging and surfaces the failure to the user once.
 * Idempotent: state.warn is consumed on first call, so additional failures
 * (sync or async, same session) are silent.
 *
 * @param {string} message
 */
function reportFailureOnce(message) {
  state.stream = null;
  const warn = state.warn;
  state.warn = null;
  if (warn) warn(message);
}

/**
 * Closes the file logger asynchronously, flushing buffered writes. Safe to
 * call when inactive or multiple times. Only the first call writes the
 * session-end entry.
 *
 * @returns {Promise<void>}
 */
export function closeFileLogger() {
  if (!state.stream) return Promise.resolve();
  const closing = state.stream;
  state.stream = null;
  state.warn = null;
  if (shouldWriteLevel("info")) {
    try {
      closing.write(formatLine("info", "Log ended, command:", [state.command]));
    } catch {
      // best-effort: stream is being closed anyway
    }
  }
  return new Promise((resolve) => {
    try {
      closing.end(resolve);
    } catch {
      resolve();
    }
  });
}

/**
 * Closes the file logger synchronously, for signal handlers and crash paths
 * (uncaughtException, unhandledRejection) that call process.exit() right
 * after.
 *
 * stream.end() only QUEUES a flush; if the process exits before the event
 * loop ticks, the session-end write never reaches disk. We use
 * fs.appendFileSync for the session-end entry instead so the most
 * diagnostically useful line in the log actually lands. Earlier writes
 * still buffered in the stream may be lost on crash paths — there is no
 * sync flush API for WriteStream — but the session-end + command remains.
 */
export function closeFileLoggerSync() {
  if (!state.stream) return;
  const closing = state.stream;
  state.stream = null;
  state.warn = null;
  if (shouldWriteLevel("info")) {
    try {
      fs.appendFileSync(
        state.filePath,
        formatLine("info", "Log ended, command:", [state.command])
      );
    } catch {
      // best-effort: file may have become unwritable
    }
  }
  try {
    closing.end();
  } catch {
    // best-effort: stream is being closed anyway
  }
}

/**
 * Formats a log entry as a single newline-terminated line, either as NDJSON
 * or as bracketed plain text: `[timestamp] [level] message param1 param2 ...`
 *
 * @param {string} level
 * @param {string} message
 * @param {any[]} params - console.log-style trailing args
 * @returns {string}
 */
function formatLine(level, message, params) {
  const timestamp = new Date().toISOString();

  const fullMessage =
    params.length === 0
      ? message
      : `${message} ${params.map(formatParam).join(" ")}`;

  if (state.format === LOG_FILE_FORMAT_JSON) {
    return JSON.stringify({ timestamp, level, message: fullMessage }) + "\n";
  }

  // Escape CR/LF in plain mode so a message containing a newline can't forge
  // a separate log entry. JSON mode is already safe via JSON.stringify.
  return `[${timestamp}] [${level}] ${escapeNewlines(fullMessage)}\n`;
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeNewlines(value) {
  return value.replace(/\r/g, "\\r").replace(/\n/g, "\\n");
}

/**
 * Stringifies a log param: Errors keep their stack, strings pass through,
 * everything else becomes JSON (falling back to String() for values that
 * JSON.stringify rejects, like circular references or BigInt).
 *
 * @param {any} value
 * @returns {string}
 */
function formatParam(value) {
  if (value instanceof Error) {
    return value.stack || value.message;
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
