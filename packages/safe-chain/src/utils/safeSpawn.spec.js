import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";

describe("safeSpawn", () => {
  let safeSpawn;
  let spawnCalls = [];

  beforeEach(async () => {
    spawnCalls = [];

    // Mock child_process module to capture what command string gets built
    mock.module("child_process", {
      namedExports: {
        spawn: (command, options) => {
          spawnCalls.push({ command, options });
          return {
            on: (event, callback) => {
              if (event === "close") {
                // Simulate immediate success
                setTimeout(() => callback(0), 0);
              }
            },
          };
        },
        execSync: (cmd, opts) => {
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
        platform: () => "win32",
      },
    });

    // Import after mocking
    const safeSpawnModule = await import("./safeSpawn.js");
    safeSpawn = safeSpawnModule.safeSpawn;
  });

  afterEach(() => {
    mock.reset();
  });

  it("should pass basic command and arguments correctly", async () => {
    await safeSpawn("echo", ["hello"]);

    assert.strictEqual(spawnCalls.length, 1);
    assert.strictEqual(spawnCalls[0].command, "echo hello");
    assert.strictEqual(spawnCalls[0].options.shell, true);
  });

  it("should escape arguments containing spaces", async () => {
    await safeSpawn("echo", ["hello world"]);

    assert.strictEqual(spawnCalls.length, 1);
    // Argument should be escaped to prevent shell interpretation
    assert.strictEqual(spawnCalls[0].command, 'echo "hello world"');
    assert.strictEqual(spawnCalls[0].options.shell, true);
  });

  it("should prevent shell injection attacks", async () => {
    await safeSpawn("ls", ["; rm test123.txt"]);

    assert.strictEqual(spawnCalls.length, 1);
    // Malicious command should be escaped to prevent execution
    assert.strictEqual(spawnCalls[0].command, 'ls "; rm test123.txt"');
    assert.strictEqual(spawnCalls[0].options.shell, true);
  });

  it("should escape single quotes in arguments", async () => {
    await safeSpawn("echo", ["don't break"]);

    assert.strictEqual(spawnCalls.length, 1);
    // Single quote should be properly escaped with double quotes
    assert.strictEqual(spawnCalls[0].command, 'echo "don\'t break"');
    assert.strictEqual(spawnCalls[0].options.shell, true);
  });

  it("should handle double quotes with simpler escaping", async () => {
    await safeSpawn("echo", ['say "hello"']);

    assert.strictEqual(spawnCalls.length, 1);
    // If we switch to double quotes, this should be: "say \"hello\""
    assert.strictEqual(spawnCalls[0].command, 'echo "say \\"hello\\""');
    assert.strictEqual(spawnCalls[0].options.shell, true);
  });

  it("should not escape arguments with only safe characters", async () => {
    await safeSpawn("npm", ["install", "axios", "--save"]);

    assert.strictEqual(spawnCalls.length, 1);
    // Safe arguments (alphanumeric, dash, underscore, dot, slash) shouldn't be quoted
    assert.strictEqual(spawnCalls[0].command, "npm install axios --save");
    assert.strictEqual(spawnCalls[0].options.shell, true);
  });

  it(`should escape ampersand character`, async () => {
    await safeSpawn("npx", ["cypress", "run", "--env", "password=foo&bar"]);

    assert.strictEqual(spawnCalls.length, 1);
    // & should be escaped by wrapping the arg in quotes
    assert.strictEqual(
      spawnCalls[0].command,
      'npx cypress run --env "password=foo&bar"'
    );
    assert.strictEqual(spawnCalls[0].options.shell, true);
  });

  it("should escape dollar signs to prevent variable expansion", async () => {
    await safeSpawn("echo", ["$HOME/test"]);

    assert.strictEqual(spawnCalls.length, 1);
    assert.strictEqual(spawnCalls[0].command, 'echo "\\$HOME/test"');
  });

  it("should escape backticks to prevent command substitution", async () => {
    await safeSpawn("echo", ["file`whoami`.txt"]);

    assert.strictEqual(spawnCalls.length, 1);
    assert.strictEqual(spawnCalls[0].command, 'echo "file\\`whoami\\`.txt"');
  });

  it("should escape backslashes properly", async () => {
    await safeSpawn("echo", ["path\\with\\backslash"]);

    assert.strictEqual(spawnCalls.length, 1);
    assert.strictEqual(
      spawnCalls[0].command,
      'echo "path\\\\with\\\\backslash"'
    );
  });

  it("should handle multiple special characters in one argument", async () => {
    await safeSpawn("cmd", ['test "quoted" $var `cmd` & more']);

    assert.strictEqual(spawnCalls.length, 1);
    assert.strictEqual(
      spawnCalls[0].command,
      'cmd "test \\"quoted\\" \\$var \\`cmd\\` & more"'
    );
  });

  it("should handle pipe character", async () => {
    await safeSpawn("echo", ["foo|bar"]);

    assert.strictEqual(spawnCalls.length, 1);
    assert.strictEqual(spawnCalls[0].command, 'echo "foo|bar"');
  });

  it("should handle parentheses", async () => {
    await safeSpawn("echo", ["(test)"]);

    assert.strictEqual(spawnCalls.length, 1);
    assert.strictEqual(spawnCalls[0].command, 'echo "(test)"');
  });

  it("should handle angle brackets for redirection", async () => {
    await safeSpawn("echo", ["foo>output.txt"]);

    assert.strictEqual(spawnCalls.length, 1);
    assert.strictEqual(spawnCalls[0].command, 'echo "foo>output.txt"');
  });

  it("should handle wildcard characters", async () => {
    await safeSpawn("echo", ["*.txt"]);

    assert.strictEqual(spawnCalls.length, 1);
    assert.strictEqual(spawnCalls[0].command, 'echo "*.txt"');
  });

  it("should handle multiple arguments with mixed escaping needs", async () => {
    await safeSpawn("cmd", ["safe", "needs space", "$dangerous", "also-safe"]);

    assert.strictEqual(spawnCalls.length, 1);
    assert.strictEqual(
      spawnCalls[0].command,
      'cmd safe "needs space" "\\$dangerous" also-safe'
    );
  });
});
