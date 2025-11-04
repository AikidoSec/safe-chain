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

    it("should create python and python3 shims from unix-python wrapper template", async () => {
      // Add unix-python wrapper template to mock templates
      const unixPythonTemplatePath = path.join(
        mockTemplateDir,
        "path-wrappers",
        "templates",
        "unix-python-wrapper.template.sh"
      );
      fs.writeFileSync(
        unixPythonTemplatePath,
        "#!/bin/bash\n# Python wrapper\nexec aikido-pip \"$@\"\n",
        "utf-8"
      );

      await setupCi();

      // Check if python shim was created
      const pythonShimPath = path.join(mockShimsDir, "python");
      assert.ok(fs.existsSync(pythonShimPath), "python shim should exist");
      // Check if python3 shim was created
      const python3ShimPath = path.join(mockShimsDir, "python3");
      assert.ok(fs.existsSync(python3ShimPath), "python3 shim should exist");
      // Check content of python shim
      const pythonShimContent = fs.readFileSync(pythonShimPath, "utf-8");
      assert.ok(pythonShimContent.includes("Python wrapper"), "python shim should use unix-python wrapper template");
      // Check content of python3 shim
      const python3ShimContent = fs.readFileSync(python3ShimPath, "utf-8");
      assert.ok(python3ShimContent.includes("Python wrapper"), "python3 shim should use unix-python wrapper template");
    });

    it("should create python.cmd and python3.cmd shims from windows-python wrapper template on win32 platform", async () => {
      mockPlatform = "win32";
      // Add windows-python wrapper template to mock templates
      const windowsPythonTemplatePath = path.join(
        mockTemplateDir,
        "path-wrappers",
        "templates",
        "windows-python-wrapper.template.cmd"
      );
      fs.writeFileSync(
        windowsPythonTemplatePath,
        "@echo off\nREM Python wrapper\n{{AIKIDO_COMMAND}} %*\n",
        "utf-8"
      );

      await setupCi();

      // Check if python.cmd shim was created
      const pythonCmdShimPath = path.join(mockShimsDir, "python.cmd");
      assert.ok(fs.existsSync(pythonCmdShimPath), "python.cmd shim should exist");
      // Check if python3.cmd shim was created
      const python3CmdShimPath = path.join(mockShimsDir, "python3.cmd");
      assert.ok(fs.existsSync(python3CmdShimPath), "python3.cmd shim should exist");
      // Check content of python.cmd shim
      const pythonCmdShimContent = fs.readFileSync(pythonCmdShimPath, "utf-8");
      assert.ok(pythonCmdShimContent.includes("Python wrapper"), "python.cmd should use windows-python wrapper template");
      // Check content of python3.cmd shim
      const python3CmdShimContent = fs.readFileSync(python3CmdShimPath, "utf-8");
      assert.ok(python3CmdShimContent.includes("Python wrapper"), "python3.cmd should use windows-python wrapper template");
    });
  });
});