import { spawnSync, spawn } from "child_process";

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

export function safeSpawnSync(command, args, options = {}) {
  const fullCommand = buildCommand(command, args);
  return spawnSync(fullCommand, { ...options, shell: true });
}

export async function safeSpawn(command, args, options = {}) {
  const fullCommand = buildCommand(command, args);
  return new Promise((resolve, reject) => {
    const child = spawn(fullCommand, { ...options, shell: true });
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
