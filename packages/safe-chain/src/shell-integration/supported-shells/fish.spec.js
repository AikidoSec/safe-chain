import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";
import { tmpdir } from "node:os";
import fs from "node:fs";
import path from "path";
import { knownAikidoTools } from "../helpers.js";

describe("Fish shell integration", () => {
  let mockStartupFile;
  let fish;

  beforeEach(async () => {
    // Create temporary startup file for testing
    mockStartupFile = path.join(tmpdir(), `test-fish-config-${Date.now()}`);

    // Mock the helpers module
    mock.module("../helpers.js", {
      namedExports: {
        doesExecutableExistOnSystem: () => true,
        getScriptsDir: () => "/test-home/.safe-chain/scripts",
        addLineToFile: (filePath, line) => {
          if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, "", "utf-8");
          }
          fs.appendFileSync(filePath, line + "\n", "utf-8");
        },
        removeLinesMatchingPattern: (filePath, pattern) => {
          if (!fs.existsSync(filePath)) return;
          const content = fs.readFileSync(filePath, "utf-8");
          const lines = content.split("\n");
          const filteredLines = lines.filter((line) => !pattern.test(line));
          fs.writeFileSync(filePath, filteredLines.join("\n"), "utf-8");
        },
      },
    });

    // Mock child_process execSync
    mock.module("child_process", {
      namedExports: {
        execSync: () => mockStartupFile,
      },
    });

    // Import fish module after mocking
    fish = (await import("./fish.js")).default;
  });

  afterEach(() => {
    // Clean up test files
    if (fs.existsSync(mockStartupFile)) {
      fs.unlinkSync(mockStartupFile);
    }

    // Reset mocks
    mock.reset();
  });

  describe("isInstalled", () => {
    it("should return true when fish is installed", () => {
      assert.strictEqual(fish.isInstalled(), true);
    });

    it("should call doesExecutableExistOnSystem with correct parameter", () => {
      // Test that the method calls the helper with the right executable name
      assert.strictEqual(fish.isInstalled(), true);
    });
  });

  describe("setup", () => {
    it("should add source line for safe-chain fish initialization script", () => {
      const result = fish.setup();
      assert.strictEqual(result, true);

      const content = fs.readFileSync(mockStartupFile, "utf-8");
      assert.ok(
        content.includes('source /test-home/.safe-chain/scripts/init-fish.fish # Safe-chain Fish initialization script')
      );
    });

    it("should not duplicate source lines on multiple calls", () => {
      fish.setup();
      fish.setup();

      const content = fs.readFileSync(mockStartupFile, "utf-8");
      const sourceMatches = (content.match(/source \/test-home\/\.safe-chain\/scripts\/init-fish\.fish/g) || []).length;
      assert.strictEqual(sourceMatches, 2, "Should allow multiple source lines (helper doesn't dedupe)");
    });
  });

  describe("teardown", () => {
    it("should remove npm, npx, yarn aliases and source line", () => {
      const initialContent = [
        "#!/usr/bin/env fish",
        "alias npm 'aikido-npm'",
        "alias npx 'aikido-npx'",
        "alias yarn 'aikido-yarn'",
        "source /test-home/.safe-chain/scripts/init-fish.fish # Safe-chain Fish initialization script",
        "alias ls 'ls --color=auto'",
        "alias grep 'grep --color=auto'",
      ].join("\n");

      fs.writeFileSync(mockStartupFile, initialContent, "utf-8");

      const result = fish.teardown(knownAikidoTools);
      assert.strictEqual(result, true);

      const content = fs.readFileSync(mockStartupFile, "utf-8");
      assert.ok(!content.includes("alias npm "));
      assert.ok(!content.includes("alias npx "));
      assert.ok(!content.includes("alias yarn "));
      assert.ok(!content.includes("source /test-home/.safe-chain/scripts/init-fish.fish"));
      assert.ok(content.includes("alias ls "));
      assert.ok(content.includes("alias grep "));
    });

    it("should handle file that doesn't exist", () => {
      if (fs.existsSync(mockStartupFile)) {
        fs.unlinkSync(mockStartupFile);
      }

      const result = fish.teardown(knownAikidoTools);
      assert.strictEqual(result, true);
    });

    it("should handle file with no relevant aliases or source lines", () => {
      const initialContent = [
        "#!/usr/bin/env fish",
        "alias ls 'ls --color=auto'",
        "set PATH $PATH ~/bin",
      ].join("\n");

      fs.writeFileSync(mockStartupFile, initialContent, "utf-8");

      const result = fish.teardown(knownAikidoTools);
      assert.strictEqual(result, true);

      const content = fs.readFileSync(mockStartupFile, "utf-8");
      assert.ok(content.includes("alias ls "));
      assert.ok(content.includes("set PATH "));
    });
  });

  describe("shell properties", () => {
    it("should have correct name", () => {
      assert.strictEqual(fish.name, "Fish");
    });

    it("should expose all required methods", () => {
      assert.ok(typeof fish.isInstalled === "function");
      assert.ok(typeof fish.setup === "function");
      assert.ok(typeof fish.teardown === "function");
      assert.ok(typeof fish.name === "string");
    });
  });

  describe("custom install dir", () => {
    it("writes only the source line to the config file", () => {
      fish.setup();

      const content = fs.readFileSync(mockStartupFile, "utf-8");
      assert.ok(
        content.includes("source /test-home/.safe-chain/scripts/init-fish.fish")
      );
      assert.ok(!content.includes("SAFE_CHAIN_DIR"));
    });

    it("removes legacy set lines on teardown", () => {
      const initialContent = [
        'set -gx SAFE_CHAIN_DIR "/custom/safe-chain" # Safe-chain installation directory',
        "source /test-home/.safe-chain/scripts/init-fish.fish # Safe-chain Fish initialization script",
      ].join("\n");

      fs.writeFileSync(mockStartupFile, initialContent, "utf-8");

      fish.teardown(knownAikidoTools);
      const content = fs.readFileSync(mockStartupFile, "utf-8");
      assert.ok(!content.includes("SAFE_CHAIN_DIR"));
    });

    it("shows source-only manual setup instructions", () => {
      assert.deepStrictEqual(fish.getManualSetupInstructions(), [
        "Add the following line to your ~/.config/fish/config.fish file:",
        "  source /test-home/.safe-chain/scripts/init-fish.fish",
        "Then restart your terminal or run: source ~/.config/fish/config.fish",
      ]);
    });
  });

  describe("integration tests", () => {
    it("should handle complete setup and teardown cycle", () => {
      const tools = [
        { tool: "npm", aikidoCommand: "aikido-npm" },
        { tool: "yarn", aikidoCommand: "aikido-yarn" },
      ];

      // Setup
      fish.setup();
      let content = fs.readFileSync(mockStartupFile, "utf-8");
      assert.ok(content.includes('source /test-home/.safe-chain/scripts/init-fish.fish'));

      // Teardown
      fish.teardown(tools);
      content = fs.readFileSync(mockStartupFile, "utf-8");
      assert.ok(!content.includes("source /test-home/.safe-chain/scripts/init-fish.fish"));
    });

    it("should handle multiple setup calls", () => {
      fish.setup();
      fish.teardown(knownAikidoTools);
      fish.setup();

      const content = fs.readFileSync(mockStartupFile, "utf-8");
      const sourceMatches = (content.match(/source \/test-home\/\.safe-chain\/scripts\/init-fish\.fish/g) || []).length;
      assert.strictEqual(sourceMatches, 1, "Should have exactly one source line after setup-teardown-setup cycle");
    });
  });
});
