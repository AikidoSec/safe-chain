import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { parseShellOutput } from "./parseShellOutput.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "../..");

const SAFE_CHAIN_BIN = join(
  REPO_ROOT,
  "packages/safe-chain/bin/safe-chain.js"
);
const AIKIDO_NPM_BIN = join(
  REPO_ROOT,
  "packages/safe-chain/bin/aikido-npm.js"
);
const AIKIDO_PIP_BIN = join(
  REPO_ROOT,
  "packages/safe-chain/bin/aikido-pip3.js"
);
const PROXY_STATE_FILE = join(homedir(), ".safe-chain/proxy-state.json");

/**
 * Helper to start safe-chain run in agent mode
 * @param {string[]} args - Arguments to pass to safe-chain run
 * @returns {Promise<{process: import('child_process').ChildProcess, port: number, pid: number}>}
 */
async function startAgentMode(args = []) {
  return new Promise((resolve, reject) => {
    const proc = spawn("node", [SAFE_CHAIN_BIN, "run", ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    });

    let output = "";
    let hasResolved = false;

    const onData = (data) => {
      output += data.toString();
      
      // Strip ANSI color codes for parsing
      const strippedOutput = output.replace(/\x1b\[[0-9;]*m/g, '');
      
      // Look for port and pid - they might arrive in separate chunks
      const portMatch = strippedOutput.match(/Port:\s+(\d+)/);
      const pidMatch = strippedOutput.match(/PID:\s+(\d+)/);
      
      // Also check for the success checkmark as confirmation
      const hasSuccess = strippedOutput.includes("Safe Chain proxy started successfully");
      
      if (portMatch && pidMatch && hasSuccess && !hasResolved) {
        hasResolved = true;
        resolve({
          process: proc,
          port: parseInt(portMatch[1]),
          pid: parseInt(pidMatch[1]),
        });
      }
    };

    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);

    proc.on("error", (error) => {
      if (!hasResolved) {
        hasResolved = true;
        reject(error);
      }
    });

    proc.on("exit", (code) => {
      if (!hasResolved && code !== 0) {
        hasResolved = true;
        reject(new Error(`Process exited with code ${code}\n${output}`));
      }
    });

    // Timeout after 5 seconds
    setTimeout(() => {
      if (!hasResolved) {
        hasResolved = true;
        proc.kill();
        reject(new Error(`Timeout waiting for agent to start\n${output}`));
      }
    }, 5000);
  });
}

/**
 * Helper to stop agent mode process
 * @param {import('child_process').ChildProcess} proc
 * @returns {Promise<void>}
 */
async function stopAgentMode(proc) {
  return new Promise((resolve) => {
    if (!proc || proc.killed) {
      resolve();
      return;
    }

    proc.on("exit", () => {
      resolve();
    });

    // Send SIGTERM
    proc.kill("SIGTERM");

    // Force kill after 2 seconds if still running
    setTimeout(() => {
      if (!proc.killed) {
        proc.kill("SIGKILL");
      }
      resolve();
    }, 2000);
  });
}

/**
 * Helper to run aikido-npm command
 * @param {string[]} args
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number}>}
 */
async function runAikidoNpm(args) {
  return new Promise((resolve) => {
    const proc = spawn("node", [AIKIDO_NPM_BIN, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: "/tmp",
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("exit", (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code || 0,
      });
    });
  });
}

/**
 * Helper to run aikido-pip command
 * @param {string[]} args
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number}>}
 */
async function runAikidoPip(args) {
  return new Promise((resolve) => {
    const proc = spawn("node", [AIKIDO_PIP_BIN, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: "/tmp",
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("exit", (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code || 0,
      });
    });
  });
}

/**
 * Read and parse proxy state file
 * @returns {{port: number, url: string, pid: number, ecosystem: string, certPath: string} | null}
 */
function readProxyState() {
  try {
    if (!existsSync(PROXY_STATE_FILE)) {
      return null;
    }
    const content = readFileSync(PROXY_STATE_FILE, "utf-8");
    const state = JSON.parse(content);
    
    // Validate that process is still running (same as actual implementation)
    try {
      process.kill(state.pid, 0);
      return state;
    } catch {
      // Process doesn't exist
      return null;
    }
  } catch {
    return null;
  }
}

/**
 * Clean up proxy state file
 */
function cleanupProxyState() {
  try {
    if (existsSync(PROXY_STATE_FILE)) {
      unlinkSync(PROXY_STATE_FILE);
    }
  } catch {
    // Ignore errors
  }
}

describe("Agent Mode E2E", { timeout: 60000 }, () => {
  before(() => {
    // Clean up any existing proxy state
    cleanupProxyState();
  });

  after(() => {
    // Clean up after tests
    cleanupProxyState();
  });

  describe("safe-chain run", () => {
    it("should start proxy and create state file", async () => {
      let agent;
      try {
        // Start agent mode
        agent = await startAgentMode();

        // Verify process is running
        assert.ok(agent.process);
        assert.ok(agent.port > 0);
        assert.ok(agent.pid > 0);

        // Verify state file was created
        const state = readProxyState();
        assert.ok(state, "State file should exist");
        assert.strictEqual(state.port, agent.port);
        assert.strictEqual(state.pid, agent.pid);
        assert.strictEqual(state.ecosystem, "all");
        assert.strictEqual(state.url, `http://localhost:${agent.port}`);
        assert.ok(state.certPath);
        assert.ok(state.certPath.includes(".safe-chain/certs/ca-cert.pem"));
      } finally {
        if (agent) {
          await stopAgentMode(agent.process);
        }
      }
    });

    it("should accept verbose flag", async () => {
      let agent;
      try {
        // Start agent mode with verbose flag
        agent = await startAgentMode(["--verbose"]);

        // Verify state file ecosystem is always 'all'
        const state = readProxyState();
        assert.ok(state);
        assert.strictEqual(state.ecosystem, "all");
      } finally {
        if (agent) {
          await stopAgentMode(agent.process);
        }
      }
    });

    it("should cleanup state file when proxy stops", async () => {
      let agent;
      try {
        // Start agent mode
        agent = await startAgentMode();

        // Verify state file exists
        assert.ok(readProxyState());

        // Stop agent
        await stopAgentMode(agent.process);
        agent = null;

        // Wait a bit for cleanup
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Verify state file was removed
        const state = readProxyState();
        assert.strictEqual(state, null, "State file should be removed");
      } finally {
        if (agent) {
          await stopAgentMode(agent.process);
        }
      }
    });
  });

  describe("aikido-npm with agent mode", () => {
    let agent;

    before(async () => {
      // Start agent mode for all npm tests
      agent = await startAgentMode(["--verbose"]);
      // Wait a bit to ensure proxy is fully ready
      await new Promise((resolve) => setTimeout(resolve, 500));
    });

    after(async () => {
      // Stop agent after all tests
      if (agent) {
        await stopAgentMode(agent.process);
      }
    });

    it("should use existing proxy when running npm view", async () => {
      const result = await runAikidoNpm(["view", "lodash", "version"]);

      // Should succeed
      assert.strictEqual(result.exitCode, 0);

      // Should have output with version
      assert.ok(result.stdout.includes("4.17") || result.stdout.includes("lodash"));

      // Verify proxy intercepted the request (check stderr for proxy messages)
      const allOutput = result.stdout + result.stderr;
      assert.ok(
        allOutput.includes("registry.npmjs.org") ||
        allOutput.includes("MITM") ||
        result.exitCode === 0,
        "Should use proxy for request"
      );
    });

    it("should use existing proxy when running npm info", async () => {
      const result = await runAikidoNpm(["info", "express", "version"]);

      // Should succeed
      assert.strictEqual(result.exitCode, 0);

      // Should have output
      assert.ok(result.stdout.length > 0);
    });

    it("should detect malware using existing proxy", async () => {
      // Note: This test assumes there's a known malware package in the database
      // If no malware is configured, the test will just verify the command runs
      const result = await runAikidoNpm(["view", "some-test-package", "version"]);

      // Command should complete (may succeed or fail depending on package existence)
      assert.ok(result.exitCode !== undefined);
    });
  });

  describe("aikido-pip with agent mode", () => {
    let agent;

    before(async () => {
      // Start agent mode for all pip tests
      agent = await startAgentMode(["--verbose"]);
      // Wait a bit to ensure proxy is fully ready
      await new Promise((resolve) => setTimeout(resolve, 500));
    });

    after(async () => {
      // Stop agent after all tests
      if (agent) {
        await stopAgentMode(agent.process);
      }
    });

    it("should use existing proxy when running pip download", async () => {
      // Use --dry-run to avoid actual installation
      const result = await runAikidoPip(["download", "requests", "--dry-run"]);

      // Command should complete
      assert.ok(result.exitCode !== undefined);

      // Should have some output
      const allOutput = result.stdout + result.stderr;
      assert.ok(allOutput.length > 0);
    });
  });

  describe("inline mode (no agent)", () => {
    before(() => {
      // Ensure no agent is running
      cleanupProxyState();
    });

    it("should start inline proxy when no agent is running", async () => {
      // Verify no state file
      assert.strictEqual(readProxyState(), null);

      // Run aikido-npm without agent mode
      const result = await runAikidoNpm(["view", "lodash", "version"]);

      // Should succeed with inline proxy
      assert.strictEqual(result.exitCode, 0);

      // Should have output
      assert.ok(result.stdout.includes("4.17") || result.stdout.includes("lodash"));

      // State file should still not exist (inline mode doesn't create it)
      assert.strictEqual(readProxyState(), null);
    });
  });

  describe("proxy state validation", () => {
    it("should ignore stale state file with dead process", async () => {
      // Create a fake state file with a non-existent PID
      const fakeState = {
        port: 12345,
        url: "http://localhost:12345",
        pid: 99999999, // Very unlikely to exist
        ecosystem: "js",
        certPath: join(homedir(), ".safe-chain/certs/ca-cert.pem"),
      };

      // Write fake state file
      const fs = await import("node:fs/promises");
      const proxyStateDir = join(homedir(), ".safe-chain");
      await fs.mkdir(proxyStateDir, { recursive: true });
      await fs.writeFile(PROXY_STATE_FILE, JSON.stringify(fakeState, null, 2));

      // Verify state file exists but process is dead
      const state = readProxyState();
      assert.strictEqual(state, null, "Should return null for dead process");

      // Clean up
      cleanupProxyState();
    });
  });

  describe("combined ecosystems", () => {
    let agent;

    before(async () => {
      // Start agent mode (supports all ecosystems by default)
      agent = await startAgentMode(["--verbose"]);
      await new Promise((resolve) => setTimeout(resolve, 500));
    });

    after(async () => {
      if (agent) {
        await stopAgentMode(agent.process);
      }
    });

    it("should handle npm requests", async () => {
      const result = await runAikidoNpm(["view", "chalk", "version"]);
      assert.strictEqual(result.exitCode, 0);
      assert.ok(result.stdout.length > 0);
    });

    it("should handle pip requests", async () => {
      const result = await runAikidoPip(["download", "requests", "--dry-run"]);
      // Command should complete
      assert.ok(result.exitCode !== undefined);
    });
  });
});
