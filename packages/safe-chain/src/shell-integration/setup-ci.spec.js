import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";
import { tmpdir } from "node:os";
import fs from "node:fs";
import path from "path";

describe("Setup CI shell integration", () => {
  let mockShimsDir;
  let mockTemplateDir;
  let setupCi;
  let mockHomeDir;
  let mockPlatform;

  beforeEach(async () => {
    mockPlatform = "linux";
    // Create temporary directories for testing
    mockHomeDir = path.join(tmpdir(), `test-home-${Date.now()}`);
    mockShimsDir = path.join(mockHomeDir, ".safe-chain", "shims");
    mockTemplateDir = path.join(tmpdir(), `test-templates-${Date.now()}`);

    // Create template directories and files
    fs.mkdirSync(path.join(mockTemplateDir, "path-wrappers", "templates"), { recursive: true });
    fs.writeFileSync(
      path.join(mockTemplateDir, "path-wrappers", "templates", "unix-wrapper.template.sh"),
      "#!/bin/bash\n# Template for {{PACKAGE_MANAGER}}\nexec {{AIKIDO_COMMAND}} \"$@\"\n",
      "utf-8"
    );
    fs.writeFileSync(
      path.join(mockTemplateDir, "path-wrappers", "templates", "windows-wrapper.template.cmd"),
      "@echo off\nREM Template for {{PACKAGE_MANAGER}}\n{{AIKIDO_COMMAND}} %*\n",
      "utf-8"
    );

    // Mock the ui module
    mock.module("../environment/userInteraction.js", {
      namedExports: {
        ui: {
          writeInformation: () => {},
          emptyLine: () => {},
          writeError: () => {},
        },
      },
    });

    // Mock the helpers module
    mock.module("./helpers.js", {
      namedExports: {
        knownAikidoTools: [
          { tool: "npm", aikidoCommand: "aikido-npm" },
          { tool: "yarn", aikidoCommand: "aikido-yarn" },
        ],
        getPackageManagerList: () => "npm, yarn",
      },
    });

    // Mock os module
    mock.module("os", {
      namedExports: {
        homedir: () => mockHomeDir,
        platform: () => mockPlatform,
        EOL: "\n",
      },
    });

    // Mock path module to resolve templates correctly
    mock.module("path", {
      namedExports: {
        join: path.join,
        dirname: () => mockTemplateDir,
        resolve: (...args) => path.resolve(mockTemplateDir, ...args.slice(1)),
      },
    });

    // Mock fileURLToPath
    mock.module("url", {
      namedExports: {
        fileURLToPath: () => path.join(mockTemplateDir, "setup-ci.js"),
      },
    });

    // Import setupCi module after mocking
    setupCi = (await import("./setup-ci.js")).setupCi;
  });

  afterEach(() => {
    // Clean up test directories
    if (fs.existsSync(mockShimsDir)) {
      fs.rmSync(mockShimsDir, { recursive: true, force: true });
    }
    if (fs.existsSync(mockHomeDir)) {
      fs.rmSync(mockHomeDir, { recursive: true, force: true });
    }
    if (fs.existsSync(mockTemplateDir)) {
      fs.rmSync(mockTemplateDir, { recursive: true, force: true });
    }

    // Reset mocks
    mock.reset();
    mockPlatform = "linux";
  });

  describe("setupCi", () => {
    it("should create shims directory and Unix shims", async () => {
      await setupCi();

      // Check if shims directory was created
      assert.ok(fs.existsSync(mockShimsDir), "Shims directory should exist");

      // Check if npm shim was created
      const npmShimPath = path.join(mockShimsDir, "npm");
      assert.ok(fs.existsSync(npmShimPath), "npm shim should exist");

      // Check if yarn shim was created
      const yarnShimPath = path.join(mockShimsDir, "yarn");
      assert.ok(fs.existsSync(yarnShimPath), "yarn shim should exist");

      // Check content of npm shim
      const npmShimContent = fs.readFileSync(npmShimPath, "utf-8");
      assert.ok(npmShimContent.includes("aikido-npm"), "npm shim should contain aikido-npm");
      assert.ok(npmShimContent.includes("#!/bin/bash"), "npm shim should have bash shebang");
    });

    it("should create Windows .cmd shims on win32 platform", async () => {
      // Change platform for this test
      mockPlatform = "win32";

      await setupCi();

      // Check if shims directory was created
      assert.ok(fs.existsSync(mockShimsDir), "Shims directory should exist");

      // Check if .cmd files were created instead of Unix scripts
      const npmShimPath = path.join(mockShimsDir, "npm.cmd");
      assert.ok(fs.existsSync(npmShimPath), "npm.cmd shim should exist");

      const yarnShimPath = path.join(mockShimsDir, "yarn.cmd");
      assert.ok(fs.existsSync(yarnShimPath), "yarn.cmd shim should exist");

      // Check content of npm.cmd shim
      const npmShimContent = fs.readFileSync(npmShimPath, "utf-8");
      assert.ok(npmShimContent.includes("aikido-npm"), "npm.cmd should contain aikido-npm");
      assert.ok(npmShimContent.includes("@echo off"), "npm.cmd should have Windows batch header");
      assert.ok(npmShimContent.includes("%*"), "npm.cmd should use Windows argument passing");

      // Verify Unix shims were NOT created
      const unixNpmShim = path.join(mockShimsDir, "npm");
      assert.ok(!fs.existsSync(unixNpmShim), "Unix npm shim should not exist on Windows");
    });
  });
});
