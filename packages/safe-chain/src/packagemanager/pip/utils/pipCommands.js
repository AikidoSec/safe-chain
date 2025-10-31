export const pipInstallCommand = "install";
export const pipDownloadCommand = "download";
export const pipWheelCommand = "wheel";

export function getPipCommandForArgs(args) {
  if (!args || args.length === 0) {
    return null;
  }

  // The first non-flag argument is the command
  for (const arg of args) {
    if (!arg.startsWith("-")) {
      return arg;
    }
  }

  return null;
}

export function hasDryRunArg(args) {
  return args.some((arg) => arg === "--dry-run");
}
