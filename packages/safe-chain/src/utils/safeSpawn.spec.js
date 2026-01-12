import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";

describe("safeSpawn", () => {
  let safeSpawn;
  let spawnCalls = [];
  let os;

  beforeEach(async () => {
    spawnCalls = [];
    os = "win32"; // Test Windows behavior by default

    // Mock child_process module to capture what command string gets built
    mock.module("child_process", {
      namedExports: {
        spawn: (command, argsOrOptions, options) => {
          // Handle both signatures: spawn(cmd, {opts}) and spawn(cmd, [args], {opts})
          if (Array.isArray(argsOrOptions)) {
            spawnCalls.push({ command, args: argsOrOptions, options: options || {} });
          } else {
            spawnCalls.push({ command, options: argsOrOptions || {} });
          }
          return {
            on: (event, callback) => {
              if (event === "close") {
                // Simulate immediate success
                setTimeout(() => callback(0), 0);
              }
            },
          };
        },
        execSync: (cmd) => {
          // Simulate 'command -v' returning full path
          const match = cmd.match(/command -v (.+)/);
          if (match) {
            return `/usr/bin/${match[1]}\n`;
          }
          return "";
        },
      },
    });

    mock.module("os", {
      namedExports: {
        platform: () => os,
      },
    });

    // Import after mocking
    const safeSpawnModule = await import("./safeSpawn.js");
    safeSpawn = safeSpawnModule.safeSpawn;
  });

  afterEach(() => {
    mock.reset();
  });

  // ============================================
  // WINDOWS TESTS (shell: true, args as array)
  // ============================================

  it("should pass basic command and arguments correctly on Windows", async () => {
    os = "win32";
    await safeSpawn("echo", ["hello"]);

    assert.strictEqual(spawnCalls.length, 1);
    assert.strictEqual(spawnCalls[0].command, "echo");
    assert.deepStrictEqual(spawnCalls[0].args, ["hello"]);
    assert.strictEqual(spawnCalls[0].options.shell, true);
  });

  it("should pass arguments with spaces correctly on Windows", async () => {
    os = "win32";
    await safeSpawn("echo", ["hello world"]);

    assert.strictEqual(spawnCalls.length, 1);
    assert.strictEqual(spawnCalls[0].command, "echo");
    assert.deepStrictEqual(spawnCalls[0].args, ["hello world"]);
    assert.strictEqual(spawnCalls[0].options.shell, true);
  });

  it("should pass special characters safely on Windows", async () => {
    os = "win32";
    await safeSpawn("npm", ["install", "axios", "--save"]);

    assert.strictEqual(spawnCalls.length, 1);
    assert.strictEqual(spawnCalls[0].command, "npm");
    assert.deepStrictEqual(spawnCalls[0].args, ["install", "axios", "--save"]);
    assert.strictEqual(spawnCalls[0].options.shell, true);
  });

  it("should handle Python version specifiers with comparison operators on Windows", async () => {
    os = "win32";
    await safeSpawn("pip3", ["install", "Jinja2>=3.1,<3.2"]);

    assert.strictEqual(spawnCalls.length, 1);
    assert.strictEqual(spawnCalls[0].command, "pip3");
    assert.deepStrictEqual(spawnCalls[0].args, ["install", "Jinja2>=3.1,<3.2"]);
    assert.strictEqual(spawnCalls[0].options.shell, true);
  });

  it("should handle Python not-equal version specifiers on Windows", async () => {
    os = "win32";
    await safeSpawn("pip3", ["install", "idna!=3.5,>=3.0"]);

    assert.strictEqual(spawnCalls.length, 1);
    assert.strictEqual(spawnCalls[0].command, "pip3");
    assert.deepStrictEqual(spawnCalls[0].args, ["install", "idna!=3.5,>=3.0"]);
    assert.strictEqual(spawnCalls[0].options.shell, true);
  });

  it("should handle Python extras with square brackets on Windows", async () => {
    os = "win32";
    await safeSpawn("pip3", ["install", "requests[socks]"]);

    assert.strictEqual(spawnCalls.length, 1);
    assert.strictEqual(spawnCalls[0].command, "pip3");
    assert.deepStrictEqual(spawnCalls[0].args, ["install", "requests[socks]"]);
    assert.strictEqual(spawnCalls[0].options.shell, true);
  });

  // ============================================
  // UNIX TESTS (no shell, args as array)
  // ============================================

  it("should resolve full path and pass args as array on Unix", async () => {
    os = "darwin";
    await safeSpawn("npm", ["install", "axios"]);

    assert.strictEqual(spawnCalls.length, 1);
    assert.strictEqual(spawnCalls[0].command, "/usr/bin/npm");
    assert.deepStrictEqual(spawnCalls[0].args, ["install", "axios"]);
    assert.deepStrictEqual(spawnCalls[0].options, {});
  });

  it("should handle Python version specifiers with comparison operators on Unix", async () => {
    os = "darwin";
    await safeSpawn("pip3", ["install", "Jinja2>=3.1,<3.2"]);

    assert.strictEqual(spawnCalls.length, 1);
    assert.strictEqual(spawnCalls[0].command, "/usr/bin/pip3");
    assert.deepStrictEqual(spawnCalls[0].args, ["install", "Jinja2>=3.1,<3.2"]);
    assert.deepStrictEqual(spawnCalls[0].options, {});
  });

  it("should handle Python version specifiers with comparison operators on Unix", async () => {
    os = "darwin";
    await safeSpawn("pip3", ["install", "Jinja2>=3.1,<3.2"]);

    assert.strictEqual(spawnCalls.length, 1);
    assert.strictEqual(spawnCalls[0].command, "/usr/bin/pip3");
    assert.deepStrictEqual(spawnCalls[0].args, ["install", "Jinja2>=3.1,<3.2"]);
    assert.deepStrictEqual(spawnCalls[0].options, {});
  });

  it("should reject command names with special characters", async () => {
    await assert.rejects(async () => await safeSpawn("npm; echo hacked", []), {
      message: "Invalid command name: npm; echo hacked",
    });
  });

  it("should reject command names with spaces", async () => {
    await assert.rejects(async () => await safeSpawn("npm install", []), {
      message: "Invalid command name: npm install",
    });
  });

  it("should reject command names with slashes", async () => {
    await assert.rejects(async () => await safeSpawn("../../malicious", []), {
      message: "Invalid command name: ../../malicious",
    });
  });

  it("should accept valid command names with letters, numbers, underscores and hyphens", async () => {
    await safeSpawn("valid_command-123", []);

    assert.strictEqual(spawnCalls.length, 1);
    assert.strictEqual(spawnCalls[0].command, "valid_command-123");
  });
});
