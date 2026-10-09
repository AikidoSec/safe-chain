import { spawn, execSync } from "child_process";
import os from "os";
import { ui } from "../environment/userInteraction.js";

/**
 * @param {string} arg
 *
 * @returns {string}
 */
function sanitizeShellArgument(arg) {
  // If argument contains shell metacharacters, wrap in double quotes
  // and escape characters that are special even inside double quotes
  if (hasShellMetaChars(arg)) {
    // Inside double quotes, we need to escape: " $ ` \
    return '"' + escapeDoubleQuoteContent(arg) + '"';
  }
  return arg;
}

/**
 * @param {string} arg
 *
 * @returns {boolean}
 */
function hasShellMetaChars(arg) {
  // Shell metacharacters that need escaping
  // These characters have special meaning in shells and need to be quoted
  // Whenever one of these characters is present, we should quote the argument
  // Characters: space, ", &, ', |, ;, <, >, (, ), $, `, \, !, *, ?, [, ], {, }, ~, #
  const shellMetaChars = /[ "&'|;<>()$`\\!*?[\]{}~#]/;
  return shellMetaChars.test(arg);
}

/**
 * @param {string} arg
 *
 * @returns {string}
 */
function escapeDoubleQuoteContent(arg) {
  // Escape special characters for shell safety
  // This escapes ", $, `, and \ by prefixing them with a backslash
  return arg.replace(/(["`$\\])/g, "\\$1");
}

/**
 * @param {string} command
 * @param {string[]} args
 *
 * @returns {string}
 */
function buildCommand(command, args) {
  if (args.length === 0) {
    return command;
  }

  const escapedArgs = args.map(sanitizeShellArgument);

  return `${command} ${escapedArgs.join(" ")}`;
}

/**
 * @param {string} command
 *
 * @returns {string}
 */
function resolveCommandPath(command) {
  // command will be "npm", "yarn", etc.
  // Resolve the full path to prevent CWD hijacking attacks
  let fullPath;
  
  if (os.platform() === "win32") {
    // On Windows, use 'where' to find the full path
    // where.exe returns multiple matches (one per line) if the command exists in multiple locations
    // We take the first non-CWD match to prevent hijacking attacks
    try {
      const output = execSync(`where ${command}`, {
        encoding: "utf8",
      }).trim();
      
      const paths = output.split(/\r?\n/).map(p => p.trim()).filter(p => p);
      
      if (paths.length === 0) {
        throw new Error(`Command not found: ${command}`);
      }
      
      // Filter out any paths from the current working directory
      // We want the system-installed version, not a local hijack attempt
      const cwd = process.cwd();
      const systemPaths = paths.filter(p => {
        // Normalize paths for comparison
        const normalizedPath = p.toLowerCase();
        const normalizedCwd = cwd.toLowerCase();
        // Reject if the path is in the current directory
        return !normalizedPath.startsWith(normalizedCwd + "\\") && 
               normalizedPath !== normalizedCwd;
      });
      
      if (systemPaths.length === 0) {
        throw new Error(`Command ${command} only found in current directory, refusing to execute for security reasons`);
      }
      
      fullPath = systemPaths[0];
    } catch (error) {
      // If the error is already our custom error, re-throw it
      if (error instanceof Error && error.message.includes("only found in current directory")) {
        throw error;
      }
      // Otherwise, it's a command not found error
      throw new Error(`Command not found: ${command}`);
    }
  } else {
    // On Unix-like systems, use 'command -v' to find the full path
    fullPath = execSync(`command -v ${command}`, {
      encoding: "utf8",
    }).trim();

    if (!fullPath) {
      throw new Error(`Command not found: ${command}`);
    }
  }

  return fullPath;
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {import("child_process").SpawnOptions} options
 *
 * @returns {Promise<{status: number, stdout: string, stderr: string}>}
 */
export async function safeSpawn(command, args, options = {}) {
  // The command is always one of our supported package managers.
  // It should always be alphanumeric or _ or -
  // Reject any command names with suspicious characters
  if (!/^[a-zA-Z0-9_-]+$/.test(command)) {
    throw new Error(`Invalid command name: ${command}`);
  }

  return new Promise((resolve, reject) => {
    // Resolve the full path to the command to prevent CWD hijacking attacks
    // where a malicious npm.cmd in the current directory could be executed
    // instead of the system-installed package manager.
    const fullPath = resolveCommandPath(command);
    
    let child;
    if (os.platform() === "win32") {
      // Windows requires shell: true because .bat and .cmd files are not executable
      // without a terminal. We use the full path to prevent CWD hijacking.
      const fullCommand = buildCommand(fullPath, args);
      child = spawn(fullCommand, { ...options, shell: true });
    } else {
      // On Unix/macOS, we use array args (safer, no escaping needed).
      child = spawn(fullPath, args, options);
    }

    // When stdio is piped, we need to collect the output
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      // Code is null if it terminated by a signal. This should never
      // happen in our code. If this happens, return 1 error code.

      code = code ?? 1;

      resolve({
        status: code,
        stdout: stdout,
        stderr: stderr,
      });
    });

    child.on("error", (error) => {
      reject(error);
    });
  });
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {import("child_process").SpawnOptions} options
 *
 * @returns {Promise<{status: number, stdout: string, stderr: string}>}
 */
export async function printVerboseAndSafeSpawn(command, args, options = {}) {
  ui.writeVerbose(`Running: ${command} ${args.join(" ")}`);

  const result = await safeSpawn(command, args, options);

  return result;
}
