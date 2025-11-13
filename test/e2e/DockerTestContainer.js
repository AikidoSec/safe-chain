import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import * as pty from "node-pty";
import { parseShellOutput } from "./parseShellOutput.js";

const imageName = "safe-chain-e2e-test";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dockerFile = path.join(__dirname, "Dockerfile");
const contextPath = path.join(__dirname, "../..");

const nodeVersion = process.env.NODE_VERSION || "lts";
const npmVersion = process.env.NPM_VERSION || "latest";
const yarnVersion = process.env.YARN_VERSION || "latest";
const pnpmVersion = process.env.PNPM_VERSION || "latest";

export class DockerTestContainer {
  constructor() {
    this.containerName = `safe-chain-test-${Math.random()
      .toString(36)
      .substring(2, 15)}`;
    this.isRunning = false;
  }

  static buildImage() {
    try {
      const buildArgs = [
        `--build-arg NODE_VERSION=${nodeVersion}`,
        `--build-arg NPM_VERSION=${npmVersion}`,
        `--build-arg YARN_VERSION=${yarnVersion}`,
        `--build-arg PNPM_VERSION=${pnpmVersion}`,
      ].join(" ");

      execSync(
        `docker build -t ${imageName} -f ${dockerFile} ${contextPath} ${buildArgs}`,
        {
          stdio: "ignore",
        }
      );
    } catch (error) {
      throw new Error(`Failed to build Docker image: ${error.message}`);
    }
  }

  async start() {
    if (this.isRunning) {
      throw new Error("Container is already running");
    }

    try {
      // Start a long-running container that we can exec commands into
      execSync(
        `docker run -d --name ${this.containerName} ${imageName} sleep infinity`,
        { stdio: "ignore" }
      );
      this.isRunning = true;
    } catch (error) {
      throw new Error(`Failed to start container: ${error.message}`);
    }
  }

  dockerExec(command, daemon = false) {
    if (!this.isRunning) {
      throw new Error("Container is not running");
    }

    try {
      const dockerExecCommand = `docker exec ${daemon ? "-d " : " "}${
        this.containerName
      } bash -c "${command}"`;
      const output = execSync(dockerExecCommand, {
        encoding: "utf-8",
        stdio: "pipe",
        timeout: 10000,
      });
      return output;
    } catch (error) {
      throw new Error(`Failed to execute command: ${error.message}`);
    }
  }

  async openShell(shell) {
    let ptyProcess = pty.spawn(
      "docker",
      ["exec", "-it", this.containerName, shell],
      {
        name: "xterm-color",
        cols: 80,
        rows: 30,
      }
    );

    await new Promise((resolve, reject) => {
      ptyProcess.on("data", (data) => {
        if (data.includes("\u001b[?2004h")) {
          // This indicates that the shell is ready
          resolve();
        }
      });

      ptyProcess.on("error", (err) => {
        reject(err);
      });
    });

    function runCommand(command) {
      if (!ptyProcess) {
        throw new Error("Shell is not running");
      }

      return new Promise((resolve) => {
        let allData = [];

        ptyProcess.on("data", handleInput);

        const timeout = setTimeout(() => {
          // Fallback in case the command doesn't finish in a reasonable time
          // oxlint-disable-next-line no-console - having this log in CI helps diagnose issues
          console.log("Command timeout reached");
          resolve({ allData, output: parseShellOutput(allData), command });
          ptyProcess.removeListener("data", handleInput);
        }, 15000);

        function handleInput(data) {
          allData.push(data);

          if (data.includes("\u001b[?2004h")) {
            // This indicates that the command has finished executing
            resolve({ allData, output: parseShellOutput(allData), command });
            ptyProcess.removeListener("data", handleInput);
            clearTimeout(timeout);
          }
        }

        ptyProcess.write(`${command}\n`);
      });
    }

    return { runCommand };
  }

  async stop() {
    if (!this.isRunning) {
      return; // Already stopped
    }

    try {
      // Force stop and remove the container
      execSync(`docker kill ${this.containerName}`, {
        stdio: "ignore",
        timeout: 10000,
      });
    } catch {
      // Container might already be stopped
    }

    try {
      execSync(`docker rm -f ${this.containerName}`, {
        stdio: "ignore",
        timeout: 5000,
      });
    } catch {
      // Container might already be removed
    }

    this.isRunning = false;
  }
}
