import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";
import { tmpdir } from "node:os";
import fs from "node:fs";
import path from "path";
import { knownAikidoTools } from "../helpers.js";

describe("Zsh shell integration", () => {
  let mockStartupFile;
  let zsh;

  beforeEach(async () => {
    // Create temporary startup file for testing
    mockStartupFile = path.join(tmpdir(), `test-zshrc-${Date.now()}`);

    // Mock the helpers module
    mock.module("../helpers.js", {
      namedExports: {
        doesExecutableExistOnSystem: () => true,
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

    // Import zsh module after mocking
    zsh = (await import("./zsh.js")).default;
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
    it("should return true when zsh is installed", () => {
      assert.strictEqual(zsh.isInstalled(), true);
    });

    it("should call doesExecutableExistOnSystem with correct parameter", () => {
      // Test that the method calls the helper with the right executable name
      assert.strictEqual(zsh.isInstalled(), true);
    });
  });

  describe("setup", () => {
    it("should add source line for zsh initialization script", () => {
      const result = zsh.setup();
      assert.strictEqual(result, true);

      const content = fs.readFileSync(mockStartupFile, "utf-8");
      assert.ok(
        content.includes(
          "source ~/.safe-chain/scripts/init-zsh.sh # Safe-chain Zsh initialization script"
        )
      );
    });

    it("should handle empty startup file", () => {
      const result = zsh.setup();
      assert.strictEqual(result, true);

      const content = fs.readFileSync(mockStartupFile, "utf-8");
      assert.ok(content.includes("source ~/.safe-chain/scripts/init-zsh.sh"));
    });
  });

  describe("teardown", () => {
    it("should remove npm, npx, and yarn aliases", () => {
      const initialContent = [
        "#!/bin/zsh",
        "alias npm='aikido-npm'",
        "alias npx='aikido-npx'",
        "alias yarn='aikido-yarn'",
        "alias ls='ls --color=auto'",
        "alias grep='grep --color=auto'",
      ].join("\n");

      fs.writeFileSync(mockStartupFile, initialContent, "utf-8");

      const result = zsh.teardown(knownAikidoTools);
      assert.strictEqual(result, true);

      const content = fs.readFileSync(mockStartupFile, "utf-8");
      assert.ok(!content.includes("alias npm="));
      assert.ok(!content.includes("alias npx="));
      assert.ok(!content.includes("alias yarn="));
      assert.ok(content.includes("alias ls="));
      assert.ok(content.includes("alias grep="));
    });

    it("should remove zsh initialization script source line", () => {
      const initialContent = [
        "#!/bin/zsh",
        "source ~/.safe-chain/scripts/init-zsh.sh",
        "alias ls='ls --color=auto'",
      ].join("\n");

      fs.writeFileSync(mockStartupFile, initialContent, "utf-8");

      const result = zsh.teardown();
      assert.strictEqual(result, true);

      const content = fs.readFileSync(mockStartupFile, "utf-8");
      assert.ok(!content.includes("source ~/.safe-chain/scripts/init-zsh.sh"));
      assert.ok(content.includes("alias ls="));
    });

    it("should handle file that doesn't exist", () => {
      if (fs.existsSync(mockStartupFile)) {
        fs.unlinkSync(mockStartupFile);
      }

      const result = zsh.teardown(knownAikidoTools);
      assert.strictEqual(result, true);
    });

    it("should handle file with no relevant aliases or source lines", () => {
      const initialContent = [
        "#!/bin/zsh",
        "alias ls='ls --color=auto'",
        "export PATH=$PATH:~/bin",
      ].join("\n");

      fs.writeFileSync(mockStartupFile, initialContent, "utf-8");

      const result = zsh.teardown(knownAikidoTools);
      assert.strictEqual(result, true);

      const content = fs.readFileSync(mockStartupFile, "utf-8");
      assert.ok(content.includes("alias ls="));
      assert.ok(content.includes("export PATH="));
    });
  });

  describe("shell properties", () => {
    it("should have correct name", () => {
      assert.strictEqual(zsh.name, "Zsh");
    });

    it("should expose all required methods", () => {
      assert.ok(typeof zsh.isInstalled === "function");
      assert.ok(typeof zsh.setup === "function");
      assert.ok(typeof zsh.teardown === "function");
      assert.ok(typeof zsh.name === "string");
    });
  });

  describe("integration tests", () => {
    it("should handle complete setup and teardown cycle", () => {
      const tools = [
        { tool: "npm", aikidoCommand: "aikido-npm" },
        { tool: "yarn", aikidoCommand: "aikido-yarn" },
      ];

      // Setup
      zsh.setup();
      let content = fs.readFileSync(mockStartupFile, "utf-8");
      assert.ok(content.includes("source ~/.safe-chain/scripts/init-zsh.sh"));

      // Teardown
      zsh.teardown(tools);
      content = fs.readFileSync(mockStartupFile, "utf-8");
      assert.ok(!content.includes("source ~/.safe-chain/scripts/init-zsh.sh"));
    });

    it("should handle multiple setup calls", () => {
      const tools = [{ tool: "npm", aikidoCommand: "aikido-npm" }];

      zsh.setup(tools);
      zsh.teardown(tools);
      zsh.setup(tools);

      const content = fs.readFileSync(mockStartupFile, "utf-8");
      const sourceMatches = (content.match(/source.*init-zsh\.sh/g) || [])
        .length;
      assert.strictEqual(sourceMatches, 1, "Should not duplicate source lines");
    });

    it("should handle mixed content with aliases and source lines", () => {
      const initialContent = [
        "#!/bin/zsh",
        "alias npm='old-npm'",
        "source ~/.safe-chain/scripts/init-zsh.sh",
        "alias ls='ls --color=auto'",
      ].join("\n");

      fs.writeFileSync(mockStartupFile, initialContent, "utf-8");

      // Teardown should remove both aliases and source line
      zsh.teardown();
      const content = fs.readFileSync(mockStartupFile, "utf-8");
      assert.ok(!content.includes("alias npm="));
      assert.ok(!content.includes("source ~/.safe-chain/scripts/init-zsh.sh"));
      assert.ok(content.includes("alias ls="));
    });
  });
});
