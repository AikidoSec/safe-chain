import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";
import path from "path";

/** @type {Map<string, string>} */
let mockFiles = new Map();
mock.module("fs", {
  namedExports: {
    existsSync: (filePath) => mockFiles.has(filePath),
    readFileSync: (filePath) => {
      if (!mockFiles.has(filePath)) {
        throw new Error(`ENOENT: no such file: ${filePath}`);
      }
      return mockFiles.get(filePath);
    },
    writeFileSync: (filePath, content) => mockFiles.set(filePath, content),
    mkdirSync: () => {},
  },
});

let currentPackageManagerName = null;
mock.module("./packageManagerName.js", {
  namedExports: {
    getPackageManagerName: () => currentPackageManagerName,
    setPackageManagerName: (name) => {
      currentPackageManagerName = name;
    },
  },
});

const {
  getMinimumPackageAgeHours,
  getMinimumPackageAgeExclusions,
} = await import("./settings.js");
const { initializeCliArguments } = await import("./cliArguments.js");
const { resetPnpmWorkspaceConfigCache } = await import(
  "./pnpmWorkspaceConfig.js"
);

const PNPM_WORKSPACE_ENV = [
  "SAFE_CHAIN_MINIMUM_PACKAGE_AGE_HOURS",
  "SAFE_CHAIN_MINIMUM_PACKAGE_AGE_EXCLUSIONS",
  "SAFE_CHAIN_NPM_MINIMUM_PACKAGE_AGE_EXCLUSIONS",
];

describe("pnpm workspace config integration", () => {
  /** @type {Record<string, string | undefined>} */
  let savedEnv;
  /** @type {(() => string) | undefined} */
  let originalCwd;
  const cwd = "/tmp/project";

  function overrideCwd(dir) {
    if (!originalCwd) originalCwd = process.cwd;
    process.cwd = () => dir;
  }

  beforeEach(() => {
    savedEnv = {};
    for (const name of PNPM_WORKSPACE_ENV) {
      savedEnv[name] = process.env[name];
      delete process.env[name];
    }
    mockFiles.clear();
    resetPnpmWorkspaceConfigCache();
    initializeCliArguments([]);
    currentPackageManagerName = null;
    overrideCwd(cwd);
  });

  afterEach(() => {
    for (const name of PNPM_WORKSPACE_ENV) {
      if (savedEnv[name] !== undefined) {
        process.env[name] = savedEnv[name];
      } else {
        delete process.env[name];
      }
    }
    mockFiles.clear();
    resetPnpmWorkspaceConfigCache();
    currentPackageManagerName = null;
    if (originalCwd) {
      process.cwd = originalCwd;
      originalCwd = undefined;
    }
  });

  describe("getMinimumPackageAgeHours", () => {
    it("uses pnpm-workspace.yaml when running as pnpm shim and no higher source is set", () => {
      currentPackageManagerName = "pnpm";
      mockFiles.set(
        path.join(cwd, "pnpm-workspace.yaml"),
        "minimumReleaseAge: 1440\n"
      );

      assert.strictEqual(getMinimumPackageAgeHours(), 24);
    });

    it("uses pnpm-workspace.yaml when running as pnpx shim", () => {
      currentPackageManagerName = "pnpx";
      mockFiles.set(
        path.join(cwd, "pnpm-workspace.yaml"),
        "minimumReleaseAge: 720\n"
      );

      assert.strictEqual(getMinimumPackageAgeHours(), 12);
    });

    it("falls back to default when not running as pnpm shim, even if pnpm-workspace.yaml exists", () => {
      currentPackageManagerName = "npm";
      mockFiles.set(
        path.join(cwd, "pnpm-workspace.yaml"),
        "minimumReleaseAge: 1440\n"
      );

      assert.strictEqual(getMinimumPackageAgeHours(), 48);
    });

    it("env var overrides pnpm-workspace.yaml", () => {
      currentPackageManagerName = "pnpm";
      process.env.SAFE_CHAIN_MINIMUM_PACKAGE_AGE_HOURS = "6";
      mockFiles.set(
        path.join(cwd, "pnpm-workspace.yaml"),
        "minimumReleaseAge: 1440\n"
      );

      assert.strictEqual(getMinimumPackageAgeHours(), 6);
    });

    it("falls back to package.json#pnpm when no pnpm-workspace.yaml is present", () => {
      currentPackageManagerName = "pnpm";
      mockFiles.set(
        path.join(cwd, "package.json"),
        JSON.stringify({
          name: "x",
          pnpm: { minimumReleaseAge: 60 },
        })
      );

      assert.strictEqual(getMinimumPackageAgeHours(), 1);
    });
  });

  describe("getMinimumPackageAgeExclusions", () => {
    it("merges pnpm-workspace.yaml exclusions when running as pnpm shim", () => {
      currentPackageManagerName = "pnpm";
      process.env.SAFE_CHAIN_MINIMUM_PACKAGE_AGE_EXCLUSIONS = "from-env";
      mockFiles.set(
        path.join(cwd, "pnpm-workspace.yaml"),
        [
          "minimumReleaseAgeExclude:",
          "  - from-pnpm",
          "  - '@scope/*'",
        ].join("\n")
      );

      const exclusions = getMinimumPackageAgeExclusions();
      assert.deepStrictEqual(exclusions, ["from-env", "from-pnpm", "@scope/*"]);
    });

    it("does not include pnpm-workspace.yaml exclusions when running as npm shim", () => {
      currentPackageManagerName = "npm";
      process.env.SAFE_CHAIN_MINIMUM_PACKAGE_AGE_EXCLUSIONS = "from-env";
      mockFiles.set(
        path.join(cwd, "pnpm-workspace.yaml"),
        [
          "minimumReleaseAgeExclude:",
          "  - from-pnpm",
        ].join("\n")
      );

      const exclusions = getMinimumPackageAgeExclusions();
      assert.deepStrictEqual(exclusions, ["from-env"]);
    });

    it("deduplicates exclusions across all sources", () => {
      currentPackageManagerName = "pnpm";
      process.env.SAFE_CHAIN_MINIMUM_PACKAGE_AGE_EXCLUSIONS = "react,lodash";
      mockFiles.set(
        path.join(cwd, "pnpm-workspace.yaml"),
        [
          "minimumReleaseAgeExclude:",
          "  - react",
          "  - express",
        ].join("\n")
      );

      const exclusions = getMinimumPackageAgeExclusions();
      assert.deepStrictEqual(exclusions, ["react", "lodash", "express"]);
    });
  });
});
