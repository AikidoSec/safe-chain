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

const malwareMirrorLog = "/tmp/malwarelistmirror.log";
const malwareMirrorReadyTimeoutMs = 90000;
const commandTimeoutMs = 15000;

let commandCounter = 0;

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
        `docker build --progress=plain -t ${imageName} -f ${dockerFile} ${contextPath} ${buildArgs}`,
        {
          stdio: "pipe",
          maxBuffer: 10 * 1024 * 1024, // Default is 1MB, increase to 10MB to account for large build logs
        }
      );
    } catch (error) {
      // Only print the build logs if the build fails
      if (error.stdout) console.log(error.stdout.toString());
      if (error.stderr) console.error(error.stderr.toString());
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

    try {
      await this.startMalwareMirror();
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  async startMalwareMirror() {
    // Run as its own detached process rather than a background job of a pty
    // shell: a shell we stop reading from takes the mirror down with it, and
    // its output would be lost when we most need it.
    this.dockerExec(
      `node /utils/malwarelistmirror.mjs > ${malwareMirrorLog} 2>&1`,
      true
    );

    const deadline = Date.now() + malwareMirrorReadyTimeoutMs;

    while (Date.now() < deadline) {
      if (this.isMalwareMirrorReady()) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    throw new Error(
      `Malware list mirror did not become ready within ${malwareMirrorReadyTimeoutMs}ms. Mirror log:\n${this.readMalwareMirrorLog()}`
    );
  }

  isMalwareMirrorReady() {
    try {
      this.dockerExec("curl -sf http://127.0.0.1:5555/ready");
      return true;
    } catch {
      return false;
    }
  }

  readMalwareMirrorLog() {
    try {
      return this.dockerExec(`cat ${malwareMirrorLog}`);
    } catch (error) {
      return `<could not read ${malwareMirrorLog}: ${error.message}>`;
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

  async openShell(shell, { user } = {}) {
    const execArgs = user
      ? ["exec", "-it", "-u", user, this.containerName, shell]
      : ["exec", "-it", this.containerName, shell];

    let ptyProcess = pty.spawn(
      "docker",
      execArgs,
      {
        name: "xterm-color",
        cols: 80,
        rows: 30,
      }
    );

    await new Promise((resolve, reject) => {
      function onShellReady(data) {
        if (data.includes("\u001b[?2004h")) {
          // This indicates that the shell is ready
          ptyProcess.removeListener("data", onShellReady);
          resolve();
        }
      }

      ptyProcess.on("data", onShellReady);

      ptyProcess.on("error", (err) => {
        reject(err);
      });
    });

    function runCommand(command) {
      if (!ptyProcess) {
        throw new Error("Shell is not running");
      }

      // A prompt marker only tells us a prompt was drawn, which also happens for
      // job status notices and async prompt redraws. Echoing a unique sentinel on
      // the line after the command is what proves the command itself finished.
      const id = `${commandCounter++}-${Math.random().toString(36).slice(2, 8)}`;
      const sentinel = `__SC_DONE_${id}__`;
      // Split so the terminal echo of this line can never match the sentinel.
      const emitSentinel = `echo "__SC_""DONE_${id}__"`;

      return new Promise((resolve) => {
        let allData = [];
        let recent = "";

        ptyProcess.on("data", handleInput);

        const timeout = setTimeout(() => {
          // Fallback in case the command doesn't finish in a reasonable time
          // oxlint-disable-next-line no-console - having this log in CI helps diagnose issues
          console.log(`Command timeout reached for "${command}"`);
          finish();
        }, commandTimeoutMs);

        function handleInput(data) {
          allData.push(data);

          // Keep a small tail so a sentinel split across chunks still matches.
          const chunk = recent + data;
          recent = chunk.slice(-1024);

          if (chunk.includes(sentinel)) {
            finish();
          }
        }

        function finish() {
          clearTimeout(timeout);
          ptyProcess.removeListener("data", handleInput);
          resolve({
            allData,
            output: parseShellOutput(allData, sentinel),
            command,
          });
        }

        ptyProcess.write(`${command}\n`);
        ptyProcess.write(`${emitSentinel}\n`);
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
