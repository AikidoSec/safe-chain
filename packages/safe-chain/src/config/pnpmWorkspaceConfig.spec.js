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

const {
  parsePnpmWorkspaceYaml,
  getPnpmWorkspaceSettings,
  getMinimumReleaseAgeHours,
  getMinimumReleaseAgeExclusions,
  resetPnpmWorkspaceConfigCache,
} = await import("./pnpmWorkspaceConfig.js");

describe("parsePnpmWorkspaceYaml", () => {
  it("returns empty settings for empty content", () => {
    const result = parsePnpmWorkspaceYaml("");
    assert.strictEqual(result.minimumReleaseAgeMinutes, undefined);
    assert.deepStrictEqual(result.minimumReleaseAgeExclude, []);
  });

  it("parses numeric minimumReleaseAge", () => {
    const result = parsePnpmWorkspaceYaml("minimumReleaseAge: 1440\n");
    assert.strictEqual(result.minimumReleaseAgeMinutes, 1440);
  });

  it("parses minimumReleaseAge with inline comment", () => {
    const result = parsePnpmWorkspaceYaml(
      "minimumReleaseAge: 1440 # 24 hours\n"
    );
    assert.strictEqual(result.minimumReleaseAgeMinutes, 1440);
  });

  it("ignores negative minimumReleaseAge", () => {
    const result = parsePnpmWorkspaceYaml("minimumReleaseAge: -5\n");
    assert.strictEqual(result.minimumReleaseAgeMinutes, undefined);
  });

  it("ignores non-numeric minimumReleaseAge", () => {
    const result = parsePnpmWorkspaceYaml("minimumReleaseAge: hello\n");
    assert.strictEqual(result.minimumReleaseAgeMinutes, undefined);
  });

  it("parses block-style minimumReleaseAgeExclude", () => {
    const yaml = [
      "minimumReleaseAgeExclude:",
      "  - react",
      "  - '@babel/*'",
      "  - \"lodash\"",
    ].join("\n");
    const result = parsePnpmWorkspaceYaml(yaml);
    assert.deepStrictEqual(result.minimumReleaseAgeExclude, [
      "react",
      "@babel/*",
      "lodash",
    ]);
  });

  it("parses flow-style minimumReleaseAgeExclude", () => {
    const result = parsePnpmWorkspaceYaml(
      "minimumReleaseAgeExclude: ['react', \"@babel/*\", lodash]\n"
    );
    assert.deepStrictEqual(result.minimumReleaseAgeExclude, [
      "react",
      "@babel/*",
      "lodash",
    ]);
  });

  it("stops the block list at the next top-level key", () => {
    const yaml = [
      "minimumReleaseAgeExclude:",
      "  - react",
      "  - lodash",
      "minimumReleaseAge: 720",
      "packages:",
      "  - 'apps/*'",
    ].join("\n");
    const result = parsePnpmWorkspaceYaml(yaml);
    assert.deepStrictEqual(result.minimumReleaseAgeExclude, ["react", "lodash"]);
    assert.strictEqual(result.minimumReleaseAgeMinutes, 720);
  });

  it("ignores unrelated top-level keys", () => {
    const yaml = [
      "packages:",
      "  - 'apps/*'",
      "  - 'libs/*'",
      "minimumReleaseAge: 60",
    ].join("\n");
    const result = parsePnpmWorkspaceYaml(yaml);
    assert.strictEqual(result.minimumReleaseAgeMinutes, 60);
    assert.deepStrictEqual(result.minimumReleaseAgeExclude, []);
  });

  it("skips comment-only and blank lines", () => {
    const yaml = [
      "# top comment",
      "",
      "minimumReleaseAge: 30 # inline",
      "",
      "# another comment",
      "minimumReleaseAgeExclude:",
      "  # list comment",
      "  - react",
    ].join("\n");
    const result = parsePnpmWorkspaceYaml(yaml);
    assert.strictEqual(result.minimumReleaseAgeMinutes, 30);
    assert.deepStrictEqual(result.minimumReleaseAgeExclude, ["react"]);
  });

  it("preserves '#' inside quoted strings", () => {
    const result = parsePnpmWorkspaceYaml(
      "minimumReleaseAgeExclude: ['pkg#1', \"pkg#2\"]\n"
    );
    assert.deepStrictEqual(result.minimumReleaseAgeExclude, ["pkg#1", "pkg#2"]);
  });
});

describe("getPnpmWorkspaceSettings (directory walk)", () => {
  const startDir = "/tmp/some-project/packages/inner";

  /** @type {(() => string) | undefined} */
  let originalCwd;
  function overrideCwd(dir) {
    if (!originalCwd) originalCwd = process.cwd;
    process.cwd = () => dir;
  }
  function restoreCwd() {
    if (originalCwd) {
      process.cwd = originalCwd;
      originalCwd = undefined;
    }
  }

  beforeEach(() => {
    resetPnpmWorkspaceConfigCache();
    mockFiles.clear();
  });

  afterEach(() => {
    mockFiles.clear();
    resetPnpmWorkspaceConfigCache();
    restoreCwd();
  });

  it("finds pnpm-workspace.yaml in the same directory", () => {
    overrideCwd(startDir);
    mockFiles.set(
      path.join(startDir, "pnpm-workspace.yaml"),
      "minimumReleaseAge: 60\n"
    );

    const settings = getPnpmWorkspaceSettings();
    assert.strictEqual(settings.minimumReleaseAgeMinutes, 60);
  });

  it("walks up to find pnpm-workspace.yaml at the project root", () => {
    overrideCwd(startDir);
    mockFiles.set(
      "/tmp/some-project/pnpm-workspace.yaml",
      [
        "minimumReleaseAge: 1440",
        "minimumReleaseAgeExclude:",
        "  - react",
      ].join("\n")
    );

    const settings = getPnpmWorkspaceSettings();
    assert.strictEqual(settings.minimumReleaseAgeMinutes, 1440);
    assert.deepStrictEqual(settings.minimumReleaseAgeExclude, ["react"]);
  });

  it("falls back to package.json#pnpm when no pnpm-workspace.yaml is present", () => {
    overrideCwd(startDir);
    mockFiles.set(
      "/tmp/some-project/package.json",
      JSON.stringify({
        name: "root",
        pnpm: {
          minimumReleaseAge: 720,
          minimumReleaseAgeExclude: ["express", "@types/*"],
        },
      })
    );

    const settings = getPnpmWorkspaceSettings();
    assert.strictEqual(settings.minimumReleaseAgeMinutes, 720);
    assert.deepStrictEqual(settings.minimumReleaseAgeExclude, [
      "express",
      "@types/*",
    ]);
  });

  it("continues walking up past a package.json that has no pnpm field", () => {
    overrideCwd(startDir);
    // Inner package.json with no pnpm field — should not terminate the walk
    mockFiles.set(
      "/tmp/some-project/packages/inner/package.json",
      JSON.stringify({ name: "inner" })
    );
    // Workspace config at the monorepo root — this is what should win
    mockFiles.set(
      "/tmp/some-project/pnpm-workspace.yaml",
      "minimumReleaseAge: 999\n"
    );

    const settings = getPnpmWorkspaceSettings();
    assert.strictEqual(settings.minimumReleaseAgeMinutes, 999);
  });

  it("returns the nearest package.json#pnpm when no pnpm-workspace.yaml exists", () => {
    overrideCwd(startDir);
    mockFiles.set(
      "/tmp/some-project/packages/inner/package.json",
      JSON.stringify({ name: "inner" })
    );
    mockFiles.set(
      "/tmp/some-project/package.json",
      JSON.stringify({
        name: "root",
        pnpm: { minimumReleaseAge: 60 },
      })
    );

    const settings = getPnpmWorkspaceSettings();
    assert.strictEqual(settings.minimumReleaseAgeMinutes, 60);
  });

  it("returns empty settings when no config files found", () => {
    overrideCwd(startDir);

    const settings = getPnpmWorkspaceSettings();
    assert.strictEqual(settings.minimumReleaseAgeMinutes, undefined);
    assert.deepStrictEqual(settings.minimumReleaseAgeExclude, []);
  });

  it("converts minimumReleaseAge minutes to hours via getMinimumReleaseAgeHours", () => {
    overrideCwd(startDir);
    mockFiles.set(
      path.join(startDir, "pnpm-workspace.yaml"),
      "minimumReleaseAge: 1440\n"
    );

    assert.strictEqual(getMinimumReleaseAgeHours(), 24);
  });

  it("returns exclusions via getMinimumReleaseAgeExclusions", () => {
    overrideCwd(startDir);
    mockFiles.set(
      path.join(startDir, "pnpm-workspace.yaml"),
      [
        "minimumReleaseAgeExclude:",
        "  - react",
        "  - lodash",
      ].join("\n")
    );

    assert.deepStrictEqual(getMinimumReleaseAgeExclusions(), ["react", "lodash"]);
  });

  it("caches results across calls", () => {
    overrideCwd(startDir);
    mockFiles.set(
      path.join(startDir, "pnpm-workspace.yaml"),
      "minimumReleaseAge: 60\n"
    );

    const first = getPnpmWorkspaceSettings();
    // Mutate the underlying mock — cached result should not change.
    mockFiles.set(
      path.join(startDir, "pnpm-workspace.yaml"),
      "minimumReleaseAge: 999\n"
    );
    const second = getPnpmWorkspaceSettings();
    assert.strictEqual(first.minimumReleaseAgeMinutes, 60);
    assert.strictEqual(second.minimumReleaseAgeMinutes, 60);
  });

  it("handles malformed JSON in package.json gracefully", () => {
    overrideCwd(startDir);
    mockFiles.set(
      "/tmp/some-project/packages/inner/package.json",
      "{ not valid json"
    );

    const settings = getPnpmWorkspaceSettings();
    assert.strictEqual(settings.minimumReleaseAgeMinutes, undefined);
    assert.deepStrictEqual(settings.minimumReleaseAgeExclude, []);
  });

  it("treats null minimumReleaseAge in package.json#pnpm as undefined", () => {
    overrideCwd(startDir);
    mockFiles.set(
      "/tmp/some-project/packages/inner/package.json",
      JSON.stringify({
        name: "inner",
        pnpm: { minimumReleaseAge: null },
      })
    );

    const settings = getPnpmWorkspaceSettings();
    assert.strictEqual(settings.minimumReleaseAgeMinutes, undefined);
  });

  it("ignores non-array minimumReleaseAgeExclude in package.json#pnpm", () => {
    overrideCwd(startDir);
    mockFiles.set(
      "/tmp/some-project/packages/inner/package.json",
      JSON.stringify({
        name: "inner",
        pnpm: {
          minimumReleaseAge: 30,
          minimumReleaseAgeExclude: "not-an-array",
        },
      })
    );

    const settings = getPnpmWorkspaceSettings();
    assert.strictEqual(settings.minimumReleaseAgeMinutes, 30);
    assert.deepStrictEqual(settings.minimumReleaseAgeExclude, []);
  });
});
