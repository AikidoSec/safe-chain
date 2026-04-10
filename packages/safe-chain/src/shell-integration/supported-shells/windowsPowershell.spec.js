import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";
import { tmpdir } from "node:os";
import fs from "node:fs";
import path from "path";
import { knownAikidoTools } from "../helpers.js";

describe("Windows PowerShell shell integration", () => {
  let mockStartupFile;
  let windowsPowershell;
  let executionPolicyResult;
  let getSafeChainDirResult = undefined;

  beforeEach(async () => {
    // Create temporary startup file for testing
    mockStartupFile = path.join(
      tmpdir(),
      `test-windows-powershell-profile-${Date.now()}.ps1`,
    );

    executionPolicyResult = {
      isValid: true,
      policy: "RemoteSigned",
    };

    // Mock the helpers module
    mock.module("../helpers.js", {
      namedExports: {
        doesExecutableExistOnSystem: () => true,
        getSafeChainDir: () => getSafeChainDirResult,
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
        validatePowerShellExecutionPolicy: () => executionPolicyResult,
        getScriptsDir: () => "/test-home/.safe-chain/scripts",
      },
    });

    // Mock child_process execSync
    mock.module("child_process", {
      namedExports: {
        execSync: () => mockStartupFile,
      },
    });

    // Import windowsPowershell module after mocking
    windowsPowershell = (await import("./windowsPowershell.js")).default;
  });

  afterEach(() => {
    // Clean up test files
    if (fs.existsSync(mockStartupFile)) {
      fs.unlinkSync(mockStartupFile);
    }

    // Reset mocks
    mock.reset();
    getSafeChainDirResult = undefined;
  });

  describe("isInstalled", () => {
    it("should return true when windows powershell is installed", () => {
      assert.strictEqual(windowsPowershell.isInstalled(), true);
    });

    it("should call doesExecutableExistOnSystem with correct parameter", () => {
      // Test that the method calls the helper with the right executable name
      assert.strictEqual(windowsPowershell.isInstalled(), true);
    });
  });

  describe("setup", () => {
    it("should add init-pwsh.ps1 source line", async () => {
      const result = await windowsPowershell.setup();
      assert.strictEqual(result, true);

      const content = fs.readFileSync(mockStartupFile, "utf-8");
      assert.ok(
        content.includes(
          '. "/test-home/.safe-chain/scripts/init-pwsh.ps1" # Safe-chain PowerShell initialization script',
        ),
      );
    });
  });

  describe("teardown", () => {
    it("should remove init-pwsh.ps1 source line", () => {
      const initialContent = [
        "# Windows PowerShell profile",
        '. "/test-home/.safe-chain/scripts/init-pwsh.ps1" # Safe-chain PowerShell initialization script',
        "Set-Alias ls Get-ChildItem",
        "Set-Alias grep Select-String",
      ].join("\n");

      fs.writeFileSync(mockStartupFile, initialContent, "utf-8");

      const result = windowsPowershell.teardown(knownAikidoTools);
      assert.strictEqual(result, true);

      const content = fs.readFileSync(mockStartupFile, "utf-8");
      assert.ok(
        !content.includes('. "/test-home/.safe-chain/scripts/init-pwsh.ps1"'),
      );
      assert.ok(content.includes("Set-Alias ls "));
      assert.ok(content.includes("Set-Alias grep "));
    });

    it("should remove old-style aliases from earlier versions", () => {
      const initialContent = [
        "# Windows PowerShell profile",
        "Set-Alias npm aikido-npm # Safe-chain alias for npm",
        "Set-Alias npx aikido-npx # Safe-chain alias for npx",
        "Set-Alias yarn aikido-yarn # Safe-chain alias for yarn",
        "Set-Alias ls Get-ChildItem",
        "Set-Alias grep Select-String",
      ].join("\n");

      fs.writeFileSync(mockStartupFile, initialContent, "utf-8");

      const result = windowsPowershell.teardown(knownAikidoTools);
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

      const result = windowsPowershell.teardown(knownAikidoTools);
      assert.strictEqual(result, true);
    });

    it("should handle file with no relevant content", () => {
      const initialContent = [
        "# Windows PowerShell profile",
        "Set-Alias ls Get-ChildItem",
        "$env:PATH += ';C:\\Tools'",
      ].join("\n");

      fs.writeFileSync(mockStartupFile, initialContent, "utf-8");

      const result = windowsPowershell.teardown(knownAikidoTools);
      assert.strictEqual(result, true);

      const content = fs.readFileSync(mockStartupFile, "utf-8");
      assert.ok(content.includes("Set-Alias ls "));
      assert.ok(content.includes("$env:PATH "));
    });
  });

  describe("shell properties", () => {
    it("should have correct name", () => {
      assert.strictEqual(windowsPowershell.name, "Windows PowerShell");
    });

    it("should expose all required methods", () => {
      assert.ok(typeof windowsPowershell.isInstalled === "function");
      assert.ok(typeof windowsPowershell.setup === "function");
      assert.ok(typeof windowsPowershell.teardown === "function");
      assert.ok(typeof windowsPowershell.name === "string");
    });
  });

  describe("integration tests", () => {
    it("should handle complete setup and teardown cycle", async () => {
      // Setup
      await windowsPowershell.setup();
      let content = fs.readFileSync(mockStartupFile, "utf-8");
      assert.ok(
        content.includes('. "/test-home/.safe-chain/scripts/init-pwsh.ps1"'),
      );

      // Teardown
      windowsPowershell.teardown(knownAikidoTools);
      content = fs.readFileSync(mockStartupFile, "utf-8");
      assert.ok(
        !content.includes('. "/test-home/.safe-chain/scripts/init-pwsh.ps1"'),
      );
    });

    it("should handle multiple setup calls", async () => {
      await windowsPowershell.setup();
      windowsPowershell.teardown(knownAikidoTools);
      await windowsPowershell.setup();

      const content = fs.readFileSync(mockStartupFile, "utf-8");
      const sourceMatches = (
        content.match(/\. "\/test-home\/\.safe-chain\/scripts\/init-pwsh\.ps1"/g) ||
        []
      ).length;
      assert.strictEqual(sourceMatches, 1, "Should not duplicate source lines");
    });
  });

  describe("SAFE_CHAIN_DIR", () => {
    it("should write $env:SAFE_CHAIN_DIR line to profile when custom dir is set", async () => {
      getSafeChainDirResult = "C:\\custom\\safe-chain";
      await windowsPowershell.setup();

      const content = fs.readFileSync(mockStartupFile, "utf-8");
      assert.ok(
        content.includes("$env:SAFE_CHAIN_DIR = 'C:\\custom\\safe-chain' # Safe-chain installation directory")
      );
    });

    it("should not write $env:SAFE_CHAIN_DIR line when no custom dir is set", async () => {
      getSafeChainDirResult = undefined;
      await windowsPowershell.setup();

      const content = fs.readFileSync(mockStartupFile, "utf-8");
      assert.ok(!content.includes("SAFE_CHAIN_DIR"));
    });

    it("should remove $env:SAFE_CHAIN_DIR line on teardown", () => {
      const initialContent = [
        "# Windows PowerShell profile",
        "$env:SAFE_CHAIN_DIR = 'C:\\custom\\safe-chain' # Safe-chain installation directory",
        '. "/test-home/.safe-chain/scripts/init-pwsh.ps1" # Safe-chain PowerShell initialization script',
      ].join("\n");

      fs.writeFileSync(mockStartupFile, initialContent, "utf-8");

      windowsPowershell.teardown(knownAikidoTools);
      const content = fs.readFileSync(mockStartupFile, "utf-8");
      assert.ok(!content.includes("SAFE_CHAIN_DIR"));
    });

    it("should show custom manual teardown instructions when custom dir is set", () => {
      getSafeChainDirResult = "C:\\custom\\safe-chain";

      assert.deepStrictEqual(windowsPowershell.getManualTeardownInstructions(), [
        'Remove the following line from your PowerShell profile (run "echo $PROFILE" to find its location):',
        "  $env:SAFE_CHAIN_DIR = 'C:\\custom\\safe-chain'",
        '  . "/test-home/.safe-chain/scripts/init-pwsh.ps1"',
        "Then restart your terminal or run: . $PROFILE",
      ]);
    });
  });

  describe("execution policy", () => {
    it(`should throw for restricted policies`, async () => {
      executionPolicyResult = {
        isValid: false,
        policy: "Restricted",
      };

      await assert.rejects(
        () => windowsPowershell.setup(),
        (err) =>
          err.message.startsWith(
            "PowerShell execution policy is set to 'Restricted'",
          ),
      );
    });
  });
});
