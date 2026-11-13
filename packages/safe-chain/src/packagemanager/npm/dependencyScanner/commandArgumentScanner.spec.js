import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";

// Mock dependencies before importing the module under test
let mockCustomRegistries = [];
let mockUiCalls = [];

mock.module("../../../config/settings.js", {
  namedExports: {
    getNpmCustomRegistries: () => mockCustomRegistries,
  },
});

mock.module("../../../environment/userInteraction.js", {
  namedExports: {
    ui: {
      writeError: (msg) => mockUiCalls.push({ type: "error", msg }),
      writeInformation: (msg) => mockUiCalls.push({ type: "info", msg }),
      writeVerbose: (msg) => mockUiCalls.push({ type: "verbose", msg }),
      writeWarning: (msg) => mockUiCalls.push({ type: "warning", msg }),
    },
  },
});

// Mock resolvePackageVersion to avoid actual network calls
mock.module("../../../api/npmApi.js", {
  namedExports: {
    resolvePackageVersion: async (name, version) => {
      // Return a mock version for testing
      return version === "latest" ? "1.0.0" : version;
    },
  },
});

const { checkChangesFromArgs } = await import("./commandArgumentScanner.js");

describe("npm commandArgumentScanner - alternate registry security", () => {
  beforeEach(() => {
    mockCustomRegistries = [];
    mockUiCalls = [];
  });

  afterEach(() => {
    mockCustomRegistries = [];
    mockUiCalls = [];
  });

  it("should allow installation from default npm registry", async () => {
    const args = ["install", "express@4.17.1"];

    const result = await checkChangesFromArgs(args);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].name, "express");
    assert.strictEqual(result[0].version, "4.17.1");
    assert.strictEqual(result[0].type, "add");
  });

  it("should block installation from unrecognized alternate registry", async () => {
    const args = [
      "install",
      "express@4.17.1",
      "--registry",
      "https://malicious.registry.com",
    ];

    await assert.rejects(
      async () => {
        await checkChangesFromArgs(args);
      },
      {
        message: /Alternate registry not in Safe Chain allow list/,
      }
    );

    // Verify error messages were written
    const errorCalls = mockUiCalls.filter((call) => call.type === "error");
    assert.strictEqual(errorCalls.length, 1);
    assert.match(
      errorCalls[0].msg,
      /Blocked installation from unrecognized registry/
    );
  });

  it("should allow installation from configured custom registry", async () => {
    mockCustomRegistries = ["custom.registry.com"];

    const args = [
      "install",
      "express@4.17.1",
      "--registry",
      "https://custom.registry.com",
    ];

    const result = await checkChangesFromArgs(args);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].name, "express");
  });

  it("should normalize registry URLs when checking allowlist", async () => {
    mockCustomRegistries = ["custom.registry.com"];

    // Test with trailing slash
    const args1 = [
      "install",
      "express",
      "--registry",
      "https://custom.registry.com/",
    ];
    const result1 = await checkChangesFromArgs(args1);
    assert.strictEqual(result1.length, 1);

    // Test without protocol
    mockUiCalls = [];
    const args2 = ["install", "express", "--registry", "custom.registry.com"];
    const result2 = await checkChangesFromArgs(args2);
    assert.strictEqual(result2.length, 1);
  });

  it("should allow known npm registries by default", async () => {
    const knownRegistries = [
      "https://registry.npmjs.org",
      "https://registry.yarnpkg.com",
      "https://registry.npmjs.com",
    ];

    for (const registry of knownRegistries) {
      mockUiCalls = [];
      const args = ["install", "express", "--registry", registry];
      const result = await checkChangesFromArgs(args);
      assert.strictEqual(result.length, 1, `Failed for registry: ${registry}`);
    }
  });
});

describe("npm commandArgumentScanner - remote source security", () => {
  beforeEach(() => {
    mockCustomRegistries = [];
    mockUiCalls = [];
  });

  afterEach(() => {
    mockCustomRegistries = [];
    mockUiCalls = [];
  });

  it("should block installation from HTTP URL", async () => {
    const args = ["install", "http://malicious.com/package.tgz"];

    await assert.rejects(
      async () => {
        await checkChangesFromArgs(args);
      },
      {
        message: /Remote package source not supported/,
      }
    );

    const errorCalls = mockUiCalls.filter((call) => call.type === "error");
    assert.strictEqual(errorCalls.length, 1);
    assert.match(errorCalls[0].msg, /Blocked installation from remote source/);
  });

  it("should block installation from HTTPS URL", async () => {
    const args = ["install", "https://malicious.com/package.tgz"];

    await assert.rejects(
      async () => {
        await checkChangesFromArgs(args);
      },
      {
        message: /Remote package source not supported/,
      }
    );
  });

  it("should block installation from git:// URL", async () => {
    const args = ["install", "git://github.com/malicious/package.git"];

    await assert.rejects(
      async () => {
        await checkChangesFromArgs(args);
      },
      {
        message: /Remote package source not supported/,
      }
    );
  });

  it("should block installation from git+ssh:// URL", async () => {
    const args = ["install", "git+ssh://git@github.com/malicious/package.git"];

    await assert.rejects(
      async () => {
        await checkChangesFromArgs(args);
      },
      {
        message: /Remote package source not supported/,
      }
    );
  });

  it("should block installation from git+https:// URL", async () => {
    const args = [
      "install",
      "git+https://github.com/malicious/package.git",
    ];

    await assert.rejects(
      async () => {
        await checkChangesFromArgs(args);
      },
      {
        message: /Remote package source not supported/,
      }
    );
  });

  it("should block installation from git+http:// URL", async () => {
    const args = ["install", "git+http://github.com/malicious/package.git"];

    await assert.rejects(
      async () => {
        await checkChangesFromArgs(args);
      },
      {
        message: /Remote package source not supported/,
      }
    );
  });

  it("should block installation from file: URL (local tarball)", async () => {
    const args = ["install", "file:./local-package.tgz"];

    await assert.rejects(
      async () => {
        await checkChangesFromArgs(args);
      },
      {
        message: /Remote package source not supported/,
      }
    );
  });

  it("should block installation from GitHub shorthand (user/repo)", async () => {
    const args = ["install", "malicious/package"];

    await assert.rejects(
      async () => {
        await checkChangesFromArgs(args);
      },
      {
        message: /Remote package source not supported/,
      }
    );
  });

  it("should allow scoped packages (not GitHub shorthand)", async () => {
    const args = ["install", "@scope/package@1.0.0"];

    const result = await checkChangesFromArgs(args);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].name, "@scope/package");
    assert.strictEqual(result[0].version, "1.0.0");
  });

  it("should block multiple packages when one is from remote source", async () => {
    const args = [
      "install",
      "express@4.17.1",
      "https://malicious.com/package.tgz",
    ];

    await assert.rejects(
      async () => {
        await checkChangesFromArgs(args);
      },
      {
        message: /Remote package source not supported/,
      }
    );
  });
});

describe("npm commandArgumentScanner - combined security scenarios", () => {
  beforeEach(() => {
    mockCustomRegistries = [];
    mockUiCalls = [];
  });

  afterEach(() => {
    mockCustomRegistries = [];
    mockUiCalls = [];
  });

  it("should block alternate registry even with valid package name", async () => {
    const args = [
      "install",
      "express@4.17.1",
      "--registry",
      "https://attacker-controlled.com",
    ];

    await assert.rejects(
      async () => {
        await checkChangesFromArgs(args);
      },
      {
        message: /Alternate registry not in Safe Chain allow list/,
      }
    );
  });

  it("should provide helpful error message for alternate registry", async () => {
    const args = [
      "install",
      "express",
      "--registry",
      "https://company.registry.com",
    ];

    await assert.rejects(async () => {
      await checkChangesFromArgs(args);
    });

    // Check that helpful information was provided
    const infoCalls = mockUiCalls.filter((call) => call.type === "info");
    assert.ok(infoCalls.length > 0);
    assert.ok(
      infoCalls.some((call) =>
        call.msg.includes("SAFE_CHAIN_NPM_CUSTOM_REGISTRIES")
      )
    );
    assert.ok(
      infoCalls.some((call) => call.msg.includes(".safe-chain.json"))
    );
  });

  it("should provide helpful error message for remote source", async () => {
    const args = ["install", "https://example.com/package.tgz"];

    await assert.rejects(async () => {
      await checkChangesFromArgs(args);
    });

    const infoCalls = mockUiCalls.filter((call) => call.type === "info");
    assert.ok(infoCalls.length > 0);
    assert.ok(
      infoCalls.some((call) => call.msg.includes("configured npm registry"))
    );
  });

  it("should process multiple valid packages successfully", async () => {
    const args = ["install", "express@4.17.1", "lodash@4.17.21"];

    const result = await checkChangesFromArgs(args);

    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].name, "express");
    assert.strictEqual(result[0].version, "4.17.1");
    assert.strictEqual(result[1].name, "lodash");
    assert.strictEqual(result[1].version, "4.17.21");
  });

  it("should handle packages without explicit version", async () => {
    const args = ["install", "express"];

    const result = await checkChangesFromArgs(args);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].name, "express");
    // Version should be resolved by mock to "1.0.0" for "latest"
    assert.strictEqual(result[0].version, "1.0.0");
  });
});

describe("npm commandArgumentScanner - pentest reproduction scenarios", () => {
  beforeEach(() => {
    mockCustomRegistries = [];
    mockUiCalls = [];
  });

  afterEach(() => {
    mockCustomRegistries = [];
    mockUiCalls = [];
  });

  it("should prevent bypass via command-line registry selection", async () => {
    // Pentest Step 5: Original args passed unchanged to npm with different registry
    const args = [
      "install",
      "malicious-package@1.0.0",
      "--registry",
      "https://attacker.registry.com",
    ];

    await assert.rejects(
      async () => {
        await checkChangesFromArgs(args);
      },
      {
        message: /Alternate registry not in Safe Chain allow list/,
      }
    );
  });

  it("should prevent bypass via remote package URL", async () => {
    // Pentest finding: Remote package URL bypasses registry auditing
    const args = ["install", "https://attacker.com/malicious-package.tgz"];

    await assert.rejects(
      async () => {
        await checkChangesFromArgs(args);
      },
      {
        message: /Remote package source not supported/,
      }
    );
  });

  it("should prevent bypass via git repository", async () => {
    // Pentest finding: Git repos bypass registry auditing
    const args = ["install", "git://attacker.com/malicious-package.git"];

    await assert.rejects(
      async () => {
        await checkChangesFromArgs(args);
      },
      {
        message: /Remote package source not supported/,
      }
    );
  });

  it("should ensure audit identity matches download source", async () => {
    // Pentest finding: Audit identity and downloaded artifact not bound to same source
    // This test ensures that when we allow a package, it's from a known/configured source
    mockCustomRegistries = ["trusted.registry.com"];

    const args = [
      "install",
      "package@1.0.0",
      "--registry",
      "https://trusted.registry.com",
    ];

    // Should succeed because registry is configured
    const result = await checkChangesFromArgs(args);
    assert.strictEqual(result.length, 1);

    // Now try with unconfigured registry - should fail
    // Reset mocks but keep the same custom registries
    mockUiCalls = [];
    const args2 = [
      "install",
      "package2@1.0.0",
      "--registry",
      "https://completely-different-untrusted.example.com",
    ];

    await assert.rejects(
      async () => {
        await checkChangesFromArgs(args2);
      },
      {
        message: /Alternate registry not in Safe Chain allow list/,
      }
    );
  });

  it("should fail-closed for unrecognized destinations", async () => {
    // Pentest Step 8: Unrecognized destinations were tunneled without interception
    // Now they should be blocked at the scanner level
    const unrecognizedSources = [
      "https://unknown-registry.example.com/package.tgz",
      "git://unknown-source.com/package.git",
      "file:./unknown-package.tgz",
    ];

    for (const source of unrecognizedSources) {
      mockUiCalls = [];
      const args = ["install", source];

      await assert.rejects(
        async () => {
          await checkChangesFromArgs(args);
        },
        {
          message: /Remote package source not supported/,
        },
        `Should block: ${source}`
      );
    }
  });
});
