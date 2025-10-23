import * as cliArguments from "./cliArguments.js";

export function getMalwareAction() {
  const action = cliArguments.getMalwareAction();

  if (action === MALWARE_ACTION_PROMPT) {
    return MALWARE_ACTION_PROMPT;
  }

  return MALWARE_ACTION_BLOCK;
}

export function getLoggingLevel() {
  const level = cliArguments.getLoggingLevel();

  if (level === LOGGING_SILENT) {
    return LOGGING_SILENT;
  }

  return LOGGING_NORMAL;
}

export const MALWARE_ACTION_BLOCK = "block";
export const MALWARE_ACTION_PROMPT = "prompt";

export const LOGGING_SILENT = "silent";
export const LOGGING_NORMAL = "normal";
