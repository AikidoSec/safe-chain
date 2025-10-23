const state = {
  malwareAction: undefined,
  loggingLevel: undefined,
};

const SAFE_CHAIN_ARG_PREFIX = "--safe-chain-";

export function initializeCliArguments(args) {
  // Reset state on each call
  state.malwareAction = undefined;
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

  setMalwareAction(safeChainArgs);
  setLoggingLevel(safeChainArgs);

  return remainingArgs;
}

function setMalwareAction(args) {
  const safeChainMalwareActionArg = SAFE_CHAIN_ARG_PREFIX + "malware-action=";

  const action = getLastArgEqualsValue(args, safeChainMalwareActionArg);
  if (!action) {
    return;
  }
  state.malwareAction = action.toLowerCase();
}

function getLastArgEqualsValue(args, prefix) {
  for (var i = args.length - 1; i >= 0; i--) {
    const arg = args[i];
    if (arg.toLowerCase().startsWith(prefix)) {
      return arg.substring(prefix.length);
    }
  }

  return undefined;
}

export function getMalwareAction() {
  return state.malwareAction;
}

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
