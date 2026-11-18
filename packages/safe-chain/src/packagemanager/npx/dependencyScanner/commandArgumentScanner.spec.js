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

describe("npx commandArgumentScanner - alternate registry security", () => {
  beforeEach(() => {
    mockCustomRegistries = [];
    mockUiCalls = [];
  });

  afterEach(() => {
    mockCustomRegistries = [];
    mockUiCalls = [];
  });

  it("should allow execution from default npm registry", async () => {
    const args = ["http-server@14.1.1"];

    const result = await checkChangesFromArgs(args);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].name, "http-server");
    assert.strictEqual(result[0].version, "14.1.1");
    assert.strictEqual(result[0].type, "add");
  });

  it("should block execution from unrecognized alternate registry", async () => {
    const args = ["http-server", "--registry", "https://malicious.registry.com"];

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
      /Blocked npx execution from unrecognized registry/
    );
  });

  it("should allow execution from configured custom registry", async () => {
    mockCustomRegistries = ["custom.registry.com"];

    const args = ["http-server", "--registry", "https://custom.registry.com"];

    const result = await checkChangesFromArgs(args);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].name, "http-server");
  });

  it("should normalize registry URLs when checking allowlist", async () => {
    mockCustomRegistries = ["custom.registry.com"];

    // Test with trailing slash
    const args1 = [
      "http-server",
      "--registry",
      "https://custom.registry.com/",
    ];
    const result1 = await checkChangesFromArgs(args1);
    assert.strictEqual(result1.length, 1);

    // Test without protocol
    mockUiCalls = [];
    const args2 = ["http-server", "--registry", "custom.registry.com"];
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
      const args = ["http-server", "--registry", registry];
      const result = await checkChangesFromArgs(args);
      assert.strictEqual(result.length, 1, `Failed for registry: ${registry}`);
    }
  });
});

describe("npx commandArgumentScanner - remote source security", () => {
  beforeEach(() => {
    mockCustomRegistries = [];
    mockUiCalls = [];
  });

  afterEach(() => {
    mockCustomRegistries = [];
    mockUiCalls = [];
  });

  it("should block execution from HTTP URL", async () => {
    const args = ["http://malicious.com/package.tgz"];

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
    assert.match(errorCalls[0].msg, /Blocked npx execution from remote source/);
  });

  it("should block execution from HTTPS URL", async () => {
    const args = ["https://malicious.com/package.tgz"];

    await assert.rejects(
      async () => {
        await checkChangesFromArgs(args);
      },
      {
        message: /Remote package source not supported/,
      }
    );
  });

  it("should block execution from git:// URL", async () => {
    const args = ["git://github.com/malicious/package.git"];

    await assert.rejects(
      async () => {
        await checkChangesFromArgs(args);
      },
      {
        message: /Remote package source not supported/,
      }
    );
  });

  it("should block execution from git+ssh:// URL", async () => {
    const args = ["git+ssh://git@github.com/malicious/package.git"];

    await assert.rejects(
      async () => {
        await checkChangesFromArgs(args);
      },
      {
        message: /Remote package source not supported/,
      }
    );
  });

  it("should block execution from git+https:// URL", async () => {
    const args = ["git+https://github.com/malicious/package.git"];

    await assert.rejects(
      async () => {
        await checkChangesFromArgs(args);
      },
      {
        message: /Remote package source not supported/,
      }
    );
  });

  it("should block execution from git+http:// URL", async () => {
    const args = ["git+http://github.com/malicious/package.git"];

    await assert.rejects(
      async () => {
        await checkChangesFromArgs(args);
      },
      {
        message: /Remote package source not supported/,
      }
    );
  });

  it("should block execution from file: URL (local tarball)", async () => {
    const args = ["file:./local-package.tgz"];

    await assert.rejects(
      async () => {
        await checkChangesFromArgs(args);
      },
      {
        message: /Remote package source not supported/,
      }
    );
  });

  it("should block execution from GitHub shorthand (user/repo)", async () => {
    const args = ["malicious/package"];

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
    const args = ["@scope/package@1.0.0"];

    const result = await checkChangesFromArgs(args);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].name, "@scope/package");
    assert.strictEqual(result[0].version, "1.0.0");
  });
});

describe("npx commandArgumentScanner - combined security scenarios", () => {
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
      "http-server@14.1.1",
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
    const args = ["http-server", "--registry", "https://company.registry.com"];

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
    const args = ["https://example.com/package.tgz"];

    await assert.rejects(async () => {
      await checkChangesFromArgs(args);
    });

    const infoCalls = mockUiCalls.filter((call) => call.type === "info");
    assert.ok(infoCalls.length > 0);
    assert.ok(
      infoCalls.some((call) => call.msg.includes("configured npm registry"))
    );
  });

  it("should handle packages without explicit version", async () => {
    const args = ["http-server"];

    const result = await checkChangesFromArgs(args);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].name, "http-server");
    // Version should be resolved by mock to "1.0.0" for "latest"
    assert.strictEqual(result[0].version, "1.0.0");
  });

  it("should handle -p/--package option", async () => {
    const args = ["-p", "http-server@14.1.1"];

    const result = await checkChangesFromArgs(args);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].name, "http-server");
    assert.strictEqual(result[0].version, "14.1.1");
  });

  it("should block remote source with -p option", async () => {
    const args = ["-p", "https://malicious.com/package.tgz"];

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

describe("npx commandArgumentScanner - pentest reproduction scenarios", () => {
  beforeEach(() => {
    mockCustomRegistries = [];
    mockUiCalls = [];
  });

  afterEach(() => {
    mockCustomRegistries = [];
    mockUiCalls = [];
  });

  it("should prevent bypass via command-line registry selection", async () => {
    // Pentest Step 6: npx scanner resolves only name/version, omits source
    const args = [
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
    const args = ["https://attacker.com/malicious-package.tgz"];

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
    const args = ["git://attacker.com/malicious-package.git"];

    await assert.rejects(
      async () => {
        await checkChangesFromArgs(args);
      },
      {
        message: /Remote package source not supported/,
      }
    );
  });

  it("should prevent direct execution of malicious code via npx", async () => {
    // Pentest finding: npx can directly execute packages, making this especially dangerous
    const maliciousSources = [
      "https://attacker.com/malware.tgz",
      "git+https://attacker.com/malware.git",
      "file:./malware.tgz",
      "attacker/malware", // GitHub shorthand
    ];

    for (const source of maliciousSources) {
      mockUiCalls = [];
      const args = [source];

      await assert.rejects(
        async () => {
          await checkChangesFromArgs(args);
        },
        {
          message: /Remote package source not supported/,
        },
        `Should block npx execution: ${source}`
      );
    }
  });

  it("should ensure audit identity matches execution source", async () => {
    // Pentest finding: Audit identity and executed artifact not bound to same source
    mockCustomRegistries = ["trusted.registry.com"];

    const args = ["package@1.0.0", "--registry", "https://trusted.registry.com"];

    // Should succeed because registry is configured
    const result = await checkChangesFromArgs(args);
    assert.strictEqual(result.length, 1);

    // Now try with unconfigured registry - should fail
    // Reset mocks but keep the same custom registries
    mockUiCalls = [];
    const args2 = [
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
    // Pentest Step 7-8: Unrecognized destinations were tunneled without interception
    // Now they should be blocked at the scanner level before execution
    const unrecognizedSources = [
      "https://unknown-registry.example.com/package.tgz",
      "git://unknown-source.com/package.git",
      "file:./unknown-package.tgz",
      "unknown-user/unknown-package",
    ];

    for (const source of unrecognizedSources) {
      mockUiCalls = [];
      const args = [source];

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

  it("should prevent lifecycle code execution from unaudited sources", async () => {
    // Pentest finding: Malicious package can run npm lifecycle code during installation
    // This is especially critical for npx which executes immediately
    const args = ["https://attacker.com/package-with-malicious-postinstall.tgz"];

    await assert.rejects(
      async () => {
        await checkChangesFromArgs(args);
      },
      {
        message: /Remote package source not supported/,
      }
    );

    // Verify the error message mentions security scanning
    const errorCalls = mockUiCalls.filter((call) => call.type === "error");
    assert.ok(errorCalls.length > 0);
  });
});
