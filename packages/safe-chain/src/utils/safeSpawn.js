import { spawn, execSync } from "child_process";

function escapeArg(arg) {
  // If argument contains spaces or quotes, wrap in double quotes and escape double quotes
  if (arg.includes(" ") || arg.includes('"') || arg.includes("'")) {
    return '"' + arg.replaceAll('"', '\\"') + '"';
  }
  return arg;
}

function buildCommand(command, args) {
  const escapedArgs = args.map(escapeArg);

  return `${command} ${escapedArgs.join(" ")}`;
}

function resolveCommandPath(command) {
  // command will be "npm", "yarn", etc.
  // Use 'which' to find the full path
  const fullPath = execSync(`which ${command}`, {
    encoding: "utf8",
    shell: true,
  }).trim();

  if (!fullPath) {
    throw new Error(`Command not found: ${command}`);
  }

  return fullPath;
}

export async function safeSpawn(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    // Windows requires shell: true because .bat and .cmd files are not executable
    // without a terminal. On Unix/macOS, we resolve the full path first, then use
    // array args (safer, no escaping needed).
    // See: https://nodejs.org/api/child_process.html#child_processspawncommand-args-options
    let child;
    if (process.platform === "win32") {
      const fullCommand = buildCommand(command, args);
      child = spawn(fullCommand, { ...options, shell: true });
    } else {
      const fullPath = resolveCommandPath(command);
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
