import * as cliArguments from "./cliArguments.js";

export function getLoggingLevel() {
  const level = cliArguments.getLoggingLevel();

  if (level === LOGGING_SILENT) {
    return LOGGING_SILENT;
  }

  if (level === LOGGING_VERBOSE) {
    return LOGGING_VERBOSE;
  }

  return LOGGING_NORMAL;
}

export const LOGGING_SILENT = "silent";
export const LOGGING_NORMAL = "normal";
export const LOGGING_VERBOSE = "verbose";
