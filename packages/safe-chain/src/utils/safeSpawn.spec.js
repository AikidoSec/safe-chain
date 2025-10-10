import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";

describe("safeSpawn", () => {
  let safeSpawnSync, safeSpawn;
  let spawnCalls = [];

  beforeEach(async () => {
    spawnCalls = [];

    // Mock child_process module to capture what command string gets built
    mock.module("child_process", {
      namedExports: {
        spawnSync: (command, options) => {
          spawnCalls.push({ command, options });
          return {
            status: 0,
            stdout: Buffer.from(""),
            stderr: Buffer.from(""),
          };
        },
        spawn: (command, options) => {
          spawnCalls.push({ command, options });
          return {
            on: (event, callback) => {
              if (event === 'close') {
                // Simulate immediate success
                setTimeout(() => callback(0), 0);
              }
            }
          };
        },
      },
    });

    // Import after mocking
    const safeSpawnModule = await import("./safeSpawn.js");
    safeSpawnSync = safeSpawnModule.safeSpawnSync;
    safeSpawn = safeSpawnModule.safeSpawn;
  });

  afterEach(() => {
    mock.reset();
  });

  // Helper to run either sync or async variant
  async function runSafeSpawn(variant, command, args, options) {
    if (variant === "sync") {
      return safeSpawnSync(command, args, options);
    } else {
      return await safeSpawn(command, args, options);
    }
  }

  for (let variant of ["sync", "async"]) {
    it(`should pass basic command and arguments correctly (${variant})`, async () => {
      await runSafeSpawn(variant, "echo", ["hello"]);

      assert.strictEqual(spawnCalls.length, 1);
      assert.strictEqual(spawnCalls[0].command, "echo hello");
      assert.strictEqual(spawnCalls[0].options.shell, true);
    });

    it(`should escape arguments containing spaces (${variant})`, async () => {
      await runSafeSpawn(variant, "echo", ["hello world"]);

      assert.strictEqual(spawnCalls.length, 1);
      // Argument should be escaped to prevent shell interpretation
      assert.strictEqual(spawnCalls[0].command, 'echo "hello world"');
      assert.strictEqual(spawnCalls[0].options.shell, true);
    });

    it(`should prevent shell injection attacks (${variant})`, async () => {
      await runSafeSpawn(variant, "ls", ["; rm test123.txt"]);

      assert.strictEqual(spawnCalls.length, 1);
      // Malicious command should be escaped to prevent execution
      assert.strictEqual(spawnCalls[0].command, 'ls "; rm test123.txt"');
      assert.strictEqual(spawnCalls[0].options.shell, true);
    });

    it(`should escape single quotes in arguments (${variant})`, async () => {
      await runSafeSpawn(variant, "echo", ["don't break"]);

      assert.strictEqual(spawnCalls.length, 1);
      // Single quote should be properly escaped with double quotes
      assert.strictEqual(spawnCalls[0].command, 'echo "don\'t break"');
      assert.strictEqual(spawnCalls[0].options.shell, true);
    });

    it(`should handle double quotes with simpler escaping (${variant})`, async () => {
      await runSafeSpawn(variant, "echo", ['say "hello"']);

      assert.strictEqual(spawnCalls.length, 1);
      // If we switch to double quotes, this should be: "say \"hello\""
      assert.strictEqual(spawnCalls[0].command, 'echo "say \\"hello\\""');
      assert.strictEqual(spawnCalls[0].options.shell, true);
    });

    it(`should not escape arguments with only safe characters (${variant})`, async () => {
      await runSafeSpawn(variant, "npm", ["install", "axios", "--save"]);

      assert.strictEqual(spawnCalls.length, 1);
      // Safe arguments (alphanumeric, dash, underscore, dot, slash) shouldn't be quoted
      assert.strictEqual(spawnCalls[0].command, "npm install axios --save");
      assert.strictEqual(spawnCalls[0].options.shell, true);
    });

    it(`should escape ampersand character (${variant})`, async () => {
      await runSafeSpawn(variant, "npx", ["cypress", "run", "--env", "password=foo&bar"]);

      assert.strictEqual(spawnCalls.length, 1);
      // & should be escaped by wrapping the arg in quotes
      assert.strictEqual(spawnCalls[0].command, 'npx cypress run --env "password=foo&bar"');
      assert.strictEqual(spawnCalls[0].options.shell, true);
    });
  }
});