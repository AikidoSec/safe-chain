/**
 * @type {{loggingLevel: string | undefined, includePython: boolean}}
 */
const state = {
  loggingLevel: undefined,
  includePython: false,
};

const SAFE_CHAIN_ARG_PREFIX = "--safe-chain-";

/**
 * @param {string[]} args
 * @returns {string[]}
 */
export function initializeCliArguments(args) {
  // Reset state on each call
  state.loggingLevel = undefined;

  const safeChainArgs = [];
  const remainingArgs = [];

  for (const arg of args) {
    if (arg.toLowerCase().startsWith(SAFE_CHAIN_ARG_PREFIX)) {
      safeChainArgs.push(arg);
    } else {
      remainingArgs.push(arg);
    }
  }

  setLoggingLevel(safeChainArgs);
  setIncludePython(args);

  return remainingArgs;
}

/**
 * @param {string[]} args
 * @param {string} prefix
 * @returns {string | undefined}
 */
function getLastArgEqualsValue(args, prefix) {
  for (var i = args.length - 1; i >= 0; i--) {
    const arg = args[i];
    if (arg.toLowerCase().startsWith(prefix)) {
      return arg.substring(prefix.length);
    }
  }

  return undefined;
}

/**
 * @param {string[]} args
 * @returns {void}
 */
function setLoggingLevel(args) {
  const safeChainLoggingArg = SAFE_CHAIN_ARG_PREFIX + "logging=";

  const level = getLastArgEqualsValue(args, safeChainLoggingArg);
  if (!level) {
    return;
  }
  state.loggingLevel = level.toLowerCase();
}

export function getLoggingLevel() {
  return state.loggingLevel;
}

/**
 * @param {string[]} args
 */
function setIncludePython(args) {
  // This flag doesn't have the --safe-chain- prefix because
  // it is only used for the safe-chain command itself and
  // not when wrapped around package manager commands.
  state.includePython = hasFlagArg(args, "--include-python");
}

export function includePython() {
  return state.includePython;
}

/**
 * @param {string[]} args
 * @param {string} flagName
 * @returns {boolean}
 */
function hasFlagArg(args, flagName) {
  for (const arg of args) {
    if (arg.toLowerCase() === flagName.toLowerCase()) {
      return true;
    }
  }
  return false;
}
