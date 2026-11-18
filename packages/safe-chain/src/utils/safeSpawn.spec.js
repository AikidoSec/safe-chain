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
          // Simulate 'where' on Windows returning full path (multiple lines)
          const whereMatch = cmd.match(/where (.+)/);
          if (whereMatch) {
            // Simulate Windows where.exe output with system path
            return `C:\\Program Files\\nodejs\\${whereMatch[1]}.cmd\n`;
          }
          // Simulate 'command -v' returning full path on Unix
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

  it("should pass basic command and arguments correctly", async () => {
    await safeSpawn("echo", ["hello"]);

    assert.strictEqual(spawnCalls.length, 1);
    assert.strictEqual(spawnCalls[0].command, "C:\\Program Files\\nodejs\\echo.cmd hello");
    assert.strictEqual(spawnCalls[0].options.shell, true);
  });

  it("should escape arguments containing spaces", async () => {
    await safeSpawn("echo", ["hello world"]);

    assert.strictEqual(spawnCalls.length, 1);
    // Argument should be escaped to prevent shell interpretation
    assert.strictEqual(spawnCalls[0].command, 'C:\\Program Files\\nodejs\\echo.cmd "hello world"');
    assert.strictEqual(spawnCalls[0].options.shell, true);
  });

  it("should prevent shell injection attacks", async () => {
    await safeSpawn("ls", ["; rm test123.txt"]);

    assert.strictEqual(spawnCalls.length, 1);
    // Malicious command should be escaped to prevent execution
    assert.strictEqual(spawnCalls[0].command, 'C:\\Program Files\\nodejs\\ls.cmd "; rm test123.txt"');
    assert.strictEqual(spawnCalls[0].options.shell, true);
  });

  it("should escape single quotes in arguments", async () => {
    await safeSpawn("echo", ["don't break"]);

    assert.strictEqual(spawnCalls.length, 1);
    // Single quote should be properly escaped with double quotes
    assert.strictEqual(spawnCalls[0].command, 'C:\\Program Files\\nodejs\\echo.cmd "don\'t break"');
    assert.strictEqual(spawnCalls[0].options.shell, true);
  });

  it("should handle double quotes with simpler escaping", async () => {
    await safeSpawn("echo", ['say "hello"']);

    assert.strictEqual(spawnCalls.length, 1);
    // If we switch to double quotes, this should be: "say \"hello\""
    assert.strictEqual(spawnCalls[0].command, 'C:\\Program Files\\nodejs\\echo.cmd "say \\"hello\\""');
    assert.strictEqual(spawnCalls[0].options.shell, true);
  });

  it("should not escape arguments with only safe characters", async () => {
    await safeSpawn("npm", ["install", "axios", "--save"]);

    assert.strictEqual(spawnCalls.length, 1);
    // Safe arguments (alphanumeric, dash, underscore, dot, slash) shouldn't be quoted
    // Now uses full path to prevent CWD hijacking on Windows
    assert.strictEqual(spawnCalls[0].command, "C:\\Program Files\\nodejs\\npm.cmd install axios --save");
    assert.strictEqual(spawnCalls[0].options.shell, true);
  });

  it(`should escape ampersand character`, async () => {
    await safeSpawn("npx", ["cypress", "run", "--env", "password=foo&bar"]);

    assert.strictEqual(spawnCalls.length, 1);
    // & should be escaped by wrapping the arg in quotes
    assert.strictEqual(
      spawnCalls[0].command,
      'C:\\\\Program Files\\\\nodejs\\\\npx.cmd cypress run --env "password=foo&bar"'
    );
    assert.strictEqual(spawnCalls[0].options.shell, true);
  });

  it("should escape dollar signs to prevent variable expansion", async () => {
    await safeSpawn("echo", ["$HOME/test"]);

    assert.strictEqual(spawnCalls.length, 1);
    assert.strictEqual(spawnCalls[0].command, 'C:\\Program Files\\nodejs\\echo.cmd "\\$HOME/test"');
  });

  it("should escape backticks to prevent command substitution", async () => {
    await safeSpawn("echo", ["file`whoami`.txt"]);

    assert.strictEqual(spawnCalls.length, 1);
    assert.strictEqual(spawnCalls[0].command, 'C:\\Program Files\\nodejs\\echo.cmd "file\\`whoami\\`.txt"');
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
    assert.strictEqual(spawnCalls[0].command, 'C:\\Program Files\\nodejs\\echo.cmd "foo|bar"');
  });

  it("should handle parentheses", async () => {
    await safeSpawn("echo", ["(test)"]);

    assert.strictEqual(spawnCalls.length, 1);
    assert.strictEqual(spawnCalls[0].command, 'C:\\Program Files\\nodejs\\echo.cmd "(test)"');
  });

  it("should handle angle brackets for redirection", async () => {
    await safeSpawn("echo", ["foo>output.txt"]);

    assert.strictEqual(spawnCalls.length, 1);
    assert.strictEqual(spawnCalls[0].command, 'C:\\Program Files\\nodejs\\echo.cmd "foo>output.txt"');
  });

  it("should handle wildcard characters", async () => {
    await safeSpawn("echo", ["*.txt"]);

    assert.strictEqual(spawnCalls.length, 1);
    assert.strictEqual(spawnCalls[0].command, 'C:\\Program Files\\nodejs\\echo.cmd "*.txt"');
  });

  it("should handle multiple arguments with mixed escaping needs", async () => {
    await safeSpawn("cmd", ["safe", "needs space", "$dangerous", "also-safe"]);

    assert.strictEqual(spawnCalls.length, 1);
    assert.strictEqual(
      spawnCalls[0].command,
      'cmd safe "needs space" "\\$dangerous" also-safe'
    );
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
    assert.strictEqual(spawnCalls[0].command, "C:\\Program Files\\nodejs\\valid_command-123.cmd");
  });

  it("should handle Python version specifiers with comparison operators on Windows", async () => {
    os = "win32";
    await safeSpawn("pip3", ["install", "Jinja2>=3.1,<3.2"]);

    assert.strictEqual(spawnCalls.length, 1);
    // On Windows, args are built into a command string with proper escaping
    // Now uses full path to prevent CWD hijacking
    assert.strictEqual(spawnCalls[0].command, 'C:\\Program Files\\nodejs\\pip3.cmd install "Jinja2>=3.1,<3.2"');
    assert.strictEqual(spawnCalls[0].options.shell, true);
  });

  it("should handle Python version specifiers with comparison operators on Unix", async () => {
    os = "darwin"; // or "linux"
    await safeSpawn("pip3", ["install", "Jinja2>=3.1,<3.2"]);

    assert.strictEqual(spawnCalls.length, 1);
    // On Unix, resolves full path and passes args as array (no shell interpretation)
    assert.strictEqual(spawnCalls[0].command, "/usr/bin/pip3");
    assert.deepStrictEqual(spawnCalls[0].args, ["install", "Jinja2>=3.1,<3.2"]);
    assert.deepStrictEqual(spawnCalls[0].options, {});
  });

  it("should handle Python not-equal version specifiers", async () => {
    os = "win32";
    await safeSpawn("pip3", ["install", "idna!=3.5,>=3.0"]);

    assert.strictEqual(spawnCalls.length, 1);
    assert.strictEqual(spawnCalls[0].command, 'C:\\Program Files\\nodejs\\pip3.cmd install "idna!=3.5,>=3.0"');
    assert.strictEqual(spawnCalls[0].options.shell, true);
  });

  it("should handle Python extras with square brackets", async () => {
    os = "win32";
    await safeSpawn("pip3", ["install", "requests[socks]"]);

    assert.strictEqual(spawnCalls.length, 1);
    assert.strictEqual(spawnCalls[0].command, 'C:\\Program Files\\nodejs\\pip3.cmd install "requests[socks]"');
    assert.strictEqual(spawnCalls[0].options.shell, true);
  });

  // Security tests for CWD hijacking vulnerability mitigation
  describe("CWD hijacking prevention", () => {
    let originalCwd;
    let mockExecSync;
    
    beforeEach(() => {
      originalCwd = process.cwd;
      // Store reference to the mock execSync so we can modify its behavior
      mockExecSync = null;
    });
    
    afterEach(() => {
      if (originalCwd) {
        process.cwd = originalCwd;
      }
    });

    it("should reject commands found only in current working directory on Windows", async () => {
      os = "win32";
      
      // Override process.cwd to return a test directory
      process.cwd = () => "C:\\Users\\victim\\malicious-repo";
      
      // Create a custom mock for this test that returns CWD path
      mock.module("child_process", {
        namedExports: {
          spawn: (command, argsOrOptions, options) => {
            if (Array.isArray(argsOrOptions)) {
              spawnCalls.push({ command, args: argsOrOptions, options: options || {} });
            } else {
              spawnCalls.push({ command, options: argsOrOptions || {} });
            }
            return {
              on: (event, callback) => {
                if (event === "close") {
                  setTimeout(() => callback(0), 0);
                }
              },
            };
          },
          execSync: (cmd) => {
            const whereMatch = cmd.match(/where (.+)/);
            if (whereMatch) {
              // Simulate finding the command only in CWD (malicious scenario)
              return `C:\\Users\\victim\\malicious-repo\\${whereMatch[1]}.cmd\n`;
            }
            return "";
          },
        },
      });

      // Re-import after mocking
      const safeSpawnModule = await import("./safeSpawn.js");
      const testSafeSpawn = safeSpawnModule.safeSpawn;

      // Should reject execution when command is only found in CWD
      await assert.rejects(
        async () => await testSafeSpawn("npm", ["install"]),
        {
          message: /only found in current directory, refusing to execute for security reasons/,
        }
      );

      // Verify no spawn call was made
      assert.strictEqual(spawnCalls.length, 0);
    });

    it("should use system path when both CWD and system paths are available on Windows", async () => {
      os = "win32";
      
      // Override process.cwd to return a test directory
      process.cwd = () => "C:\\Users\\victim\\malicious-repo";
      
      // Create a custom mock that returns both CWD and system paths
      mock.module("child_process", {
        namedExports: {
          spawn: (command, argsOrOptions, options) => {
            if (Array.isArray(argsOrOptions)) {
              spawnCalls.push({ command, args: argsOrOptions, options: options || {} });
            } else {
              spawnCalls.push({ command, options: argsOrOptions || {} });
            }
            return {
              on: (event, callback) => {
                if (event === "close") {
                  setTimeout(() => callback(0), 0);
                }
              },
            };
          },
          execSync: (cmd) => {
            const whereMatch = cmd.match(/where (.+)/);
            if (whereMatch) {
              // Simulate finding the command in both CWD (first) and system path (second)
              // The CWD path should be filtered out, and system path should be used
              return `C:\\Users\\victim\\malicious-repo\\${whereMatch[1]}.cmd\nC:\\Program Files\\nodejs\\${whereMatch[1]}.cmd\n`;
            }
            return "";
          },
        },
      });

      // Re-import after mocking
      const safeSpawnModule = await import("./safeSpawn.js");
      const testSafeSpawn = safeSpawnModule.safeSpawn;

      await testSafeSpawn("npm", ["install", "axios"]);

      // Verify the system path was used, not the CWD path
      assert.strictEqual(spawnCalls.length, 1);
      assert.strictEqual(
        spawnCalls[0].command,
        "C:\\Program Files\\nodejs\\npm.cmd install axios"
      );
      assert.strictEqual(spawnCalls[0].options.shell, true);
    });

    it("should prevent execution of malicious npm.cmd in repository on Windows", async () => {
      os = "win32";
      
      // This test simulates the exact attack scenario from the pentest:
      // An attacker places npm.cmd in their repository, and when a user
      // runs the Safe Chain wrapper, it should NOT execute the malicious file
      
      process.cwd = () => "C:\\Users\\victim\\untrusted-repo";
      
      mock.module("child_process", {
        namedExports: {
          spawn: (command, argsOrOptions, options) => {
            if (Array.isArray(argsOrOptions)) {
              spawnCalls.push({ command, args: argsOrOptions, options: options || {} });
            } else {
              spawnCalls.push({ command, options: argsOrOptions || {} });
            }
            return {
              on: (event, callback) => {
                if (event === "close") {
                  setTimeout(() => callback(0), 0);
                }
              },
            };
          },
          execSync: (cmd) => {
            const whereMatch = cmd.match(/where (.+)/);
            if (whereMatch) {
              // Simulate the attack: npm.cmd found in untrusted repository
              return `C:\\Users\\victim\\untrusted-repo\\${whereMatch[1]}.cmd\n`;
            }
            return "";
          },
        },
      });

      const safeSpawnModule = await import("./safeSpawn.js");
      const testSafeSpawn = safeSpawnModule.safeSpawn;

      // Attempt to run npm install - should be blocked
      await assert.rejects(
        async () => await testSafeSpawn("npm", ["install"]),
        {
          message: /only found in current directory, refusing to execute for security reasons/,
        }
      );

      // Verify the malicious command was NOT executed
      assert.strictEqual(spawnCalls.length, 0);
    });

    it("should use full path on Windows to prevent bare command lookup", async () => {
      os = "win32";
      
      // Verify that the full path is used in the command string,
      // not just the bare command name like "npm"
      
      await safeSpawn("npm", ["install", "axios"]);

      assert.strictEqual(spawnCalls.length, 1);
      
      // The command should start with the full path, not just "npm"
      assert.ok(
        spawnCalls[0].command.startsWith("C:\\Program Files\\nodejs\\npm.cmd"),
        `Command should start with full path, got: ${spawnCalls[0].command}`
      );
      
      // Verify it does NOT start with bare "npm" which would be vulnerable
      assert.ok(
        !spawnCalls[0].command.startsWith("npm "),
        "Command should not start with bare 'npm' command"
      );
    });

    it("should handle case-insensitive path comparison on Windows", async () => {
      os = "win32";
      
      // Windows paths are case-insensitive, so C:\Users\... and c:\users\... are the same
      // The security check should handle this correctly
      
      process.cwd = () => "C:\\Users\\Victim\\Repo"; // Different casing
      
      mock.module("child_process", {
        namedExports: {
          spawn: (command, argsOrOptions, options) => {
            if (Array.isArray(argsOrOptions)) {
              spawnCalls.push({ command, args: argsOrOptions, options: options || {} });
            } else {
              spawnCalls.push({ command, options: argsOrOptions || {} });
            }
            return {
              on: (event, callback) => {
                if (event === "close") {
                  setTimeout(() => callback(0), 0);
                }
              },
            };
          },
          execSync: (cmd) => {
            const whereMatch = cmd.match(/where (.+)/);
            if (whereMatch) {
              // Return path with different casing than CWD
              return `c:\\users\\victim\\repo\\${whereMatch[1]}.cmd\n`;
            }
            return "";
          },
        },
      });

      const safeSpawnModule = await import("./safeSpawn.js");
      const testSafeSpawn = safeSpawnModule.safeSpawn;

      // Should still reject despite different casing
      await assert.rejects(
        async () => await testSafeSpawn("npm", ["install"]),
        {
          message: /only found in current directory, refusing to execute for security reasons/,
        }
      );

      assert.strictEqual(spawnCalls.length, 0);
    });

    it("should allow execution when command is in subdirectory of system path", async () => {
      os = "win32";
      
      // Verify that commands in system directories are allowed
      // even if CWD happens to be a parent of the system path (edge case)
      
      process.cwd = () => "C:\\Users\\victim\\project";
      
      // Use the default mock which returns system path
      await safeSpawn("npm", ["install"]);

      // Should succeed because the command is in a system path
      assert.strictEqual(spawnCalls.length, 1);
      assert.ok(spawnCalls[0].command.includes("C:\\Program Files\\nodejs\\npm.cmd"));
    });
  });
});
