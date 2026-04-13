import path from "path";

/**
 * @param {string} executablePath
 * @returns {string | undefined}
 */
export function deriveInstallDirFromExecutablePath(executablePath) {
  if (!executablePath) {
    return undefined;
  }

  const pathLibrary = executablePath.includes("\\") ? path.win32 : path.posix;
  const executableDir = pathLibrary.dirname(executablePath);
  if (pathLibrary.basename(executableDir) !== "bin") {
    return undefined;
  }

  return pathLibrary.dirname(executableDir);
}

/**
 * Returns the install directory for a packaged safe-chain binary.
 * Custom installation directories only apply to packaged binary installs.
 * For npm/global/dev-script executions this intentionally returns undefined,
 * which causes callers to fall back to the default ~/.safe-chain layout.
 *
 * @param {{ isPackaged?: boolean, executablePath?: string }} [options]
 * @returns {string | undefined}
 */
export function getInstalledSafeChainDir(options = {}) {
  const isPackaged = options.isPackaged ?? Boolean(process.pkg);
  if (!isPackaged) {
    return undefined;
  }

  return deriveInstallDirFromExecutablePath(
    options.executablePath ?? process.execPath,
  );
}
