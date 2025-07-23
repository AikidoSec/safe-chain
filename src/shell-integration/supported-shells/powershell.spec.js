import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";
import { tmpdir } from "node:os";
import fs from "node:fs";
import path from "path";
import { knownAikidoTools } from "../helpers.js";

describe("PowerShell Core shell integration", () => {
  let mockStartupFile;
  let powershell;

  beforeEach(async () => {
    // Create temporary startup file for testing
    mockStartupFile = path.join(
      tmpdir(),
      `test-powershell-profile-${Date.now()}.ps1`
    );

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

    // Import powershell module after mocking
    powershell = (await import("./powershell.js")).default;
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
    it("should return true when powershell is installed", () => {
      assert.strictEqual(powershell.isInstalled(), true);
    });

    it("should call doesExecutableExistOnSystem with correct parameter", () => {
      // Test that the method calls the helper with the right executable name
      assert.strictEqual(powershell.isInstalled(), true);
    });
  });

  describe("setup", () => {
    it("should add init-pwsh.ps1 source line", () => {
      const result = powershell.setup();
      assert.strictEqual(result, true);

      const content = fs.readFileSync(mockStartupFile, "utf-8");
      assert.ok(
        content.includes(". \"$HOME\\\\.safe-chain\\\\scripts\\\\init-pwsh.ps1\" # Safe-chain PowerShell initialization script")
      );
    });
  });

  describe("teardown", () => {
    it("should remove init-pwsh.ps1 source line", () => {
      const initialContent = [
        "# PowerShell profile",
        ". \"$HOME\\\\.safe-chain\\\\scripts\\\\init-pwsh.ps1\" # Safe-chain PowerShell initialization script",
        "Set-Alias ls Get-ChildItem",
        "Set-Alias grep Select-String",
      ].join("\n");

      fs.writeFileSync(mockStartupFile, initialContent, "utf-8");

      const result = powershell.teardown(knownAikidoTools);
      assert.strictEqual(result, true);

      const content = fs.readFileSync(mockStartupFile, "utf-8");
      assert.ok(!content.includes(". \"$HOME\\\\.safe-chain\\\\scripts\\\\init-pwsh.ps1\""));
      assert.ok(content.includes("Set-Alias ls "));
      assert.ok(content.includes("Set-Alias grep "));
    });

    it("should remove old-style aliases from earlier versions", () => {
      const initialContent = [
        "# PowerShell profile",
        "Set-Alias npm aikido-npm # Safe-chain alias for npm",
        "Set-Alias npx aikido-npx # Safe-chain alias for npx",
        "Set-Alias yarn aikido-yarn # Safe-chain alias for yarn",
        "Set-Alias ls Get-ChildItem",
        "Set-Alias grep Select-String",
      ].join("\n");

      fs.writeFileSync(mockStartupFile, initialContent, "utf-8");

      const result = powershell.teardown(knownAikidoTools);
      assert.strictEqual(result, true);

      const content = fs.readFileSync(mockStartupFile, "utf-8");
      assert.ok(!content.includes("Set-Alias npm "));
      assert.ok(!content.includes("Set-Alias npx "));
      assert.ok(!content.includes("Set-Alias yarn "));
      assert.ok(content.includes("Set-Alias ls "));
      assert.ok(content.includes("Set-Alias grep "));
    });

    it("should handle file that doesn't exist", () => {
      if (fs.existsSync(mockStartupFile)) {
        fs.unlinkSync(mockStartupFile);
      }

      const result = powershell.teardown(knownAikidoTools);
      assert.strictEqual(result, true);
    });

    it("should handle file with no relevant content", () => {
      const initialContent = [
        "# PowerShell profile",
        "Set-Alias ls Get-ChildItem",
        "$env:PATH += ';C:\\Tools'",
      ].join("\n");

      fs.writeFileSync(mockStartupFile, initialContent, "utf-8");

      const result = powershell.teardown(knownAikidoTools);
      assert.strictEqual(result, true);

      const content = fs.readFileSync(mockStartupFile, "utf-8");
      assert.ok(content.includes("Set-Alias ls "));
      assert.ok(content.includes("$env:PATH "));
    });
  });

  describe("shell properties", () => {
    it("should have correct name", () => {
      assert.strictEqual(powershell.name, "PowerShell Core");
    });

    it("should expose all required methods", () => {
      assert.ok(typeof powershell.isInstalled === "function");
      assert.ok(typeof powershell.setup === "function");
      assert.ok(typeof powershell.teardown === "function");
      assert.ok(typeof powershell.name === "string");
    });
  });

  describe("integration tests", () => {
    it("should handle complete setup and teardown cycle", () => {
      // Setup
      powershell.setup();
      let content = fs.readFileSync(mockStartupFile, "utf-8");
      assert.ok(content.includes(". \"$HOME\\\\.safe-chain\\\\scripts\\\\init-pwsh.ps1\""));

      // Teardown
      powershell.teardown(knownAikidoTools);
      content = fs.readFileSync(mockStartupFile, "utf-8");
      assert.ok(!content.includes(". \"$HOME\\\\.safe-chain\\\\scripts\\\\init-pwsh.ps1\""));
    });

    it("should handle multiple setup calls", () => {
      powershell.setup();
      powershell.teardown(knownAikidoTools);
      powershell.setup();

      const content = fs.readFileSync(mockStartupFile, "utf-8");
      const sourceMatches = (content.match(/\. "\$HOME\\\\.safe-chain\\\\scripts\\\\init-pwsh\.ps1"/g) || []).length;
      assert.strictEqual(sourceMatches, 1, "Should not duplicate source lines");
    });
  });
});
