import { describe, it } from "node:test";
import assert from "node:assert";
import { parsePackagesFromArguments } from "./parsePackagesFromArguments.js";

describe("standardYarnArgumentParser", () => {
  it("should return an empty array for no changes", () => {
    const args = ["add"];

    const result = parsePackagesFromArguments(args);

    assert.deepEqual(result, []);
  });

  it("should return an array of changes for one package", () => {
    const args = ["add", "axios@1.9.0"];

    const result = parsePackagesFromArguments(args);

    assert.deepEqual(result, [{ name: "axios", version: "1.9.0" }]);
  });

  it("should return the package with latest tag if absent", () => {
    const args = ["add", "axios"];

    const result = parsePackagesFromArguments(args);

    assert.deepEqual(result, [{ name: "axios", version: "latest" }]);
  });

  it("should only return all packages", () => {
    const args = ["add", "axios", "jest"];

    const result = parsePackagesFromArguments(args);

    assert.deepEqual(result, [
      { name: "axios", version: "latest" },
      { name: "jest", version: "latest" },
    ]);
  });

  it("should return the package in the format @vercel/otel", () => {
    const args = ["add", "@vercel/otel"];

    const result = parsePackagesFromArguments(args);

    assert.deepEqual(result, [{ name: "@vercel/otel", version: "latest" }]);
  });

  it("should ignore options with parameters and return an array of changes", () => {
    const args = ["add", "--proxy", "http://localhost", "axios@1.9.0"];

    const result = parsePackagesFromArguments(args);

    assert.deepEqual(result, [{ name: "axios", version: "1.9.0" }]);
  });

  it("should parse version even for aliased packages", () => {
    const args = ["add", "server@npm:axios@1.9.0"];

    const result = parsePackagesFromArguments(args);

    assert.deepEqual(result, [{ name: "axios", version: "1.9.0" }]);
  });

  it("should parse scoped packages", () => {
    const args = ["add", "@scope/package@1.0.0"];

    const result = parsePackagesFromArguments(args);

    assert.deepEqual(result, [{ name: "@scope/package", version: "1.0.0" }]);
  });

  it("should parse packages with version ranges", () => {
    const args = ["add", "axios@^1.9.0"];

    const result = parsePackagesFromArguments(args);

    assert.deepEqual(result, [{ name: "axios", version: "^1.9.0" }]);
  });

  it("should parse package folders", () => {
    const args = ["add", "./local-package"];

    const result = parsePackagesFromArguments(args);

    assert.deepEqual(result, [{ name: "./local-package", version: "latest" }]);
  });

  it("should parse tarballs", () => {
    const args = ["add", "file:./local-package.tgz"];

    const result = parsePackagesFromArguments(args);

    assert.deepEqual(result, [
      { name: "file:./local-package.tgz", version: "latest" },
    ]);
  });

  it("should parse tarball URLs", () => {
    const args = ["add", "https://example.com/local-package.tgz"];

    const result = parsePackagesFromArguments(args);

    assert.deepEqual(result, [
      { name: "https://example.com/local-package.tgz", version: "latest" },
    ]);
  });

  it("should parse git URLs", () => {
    const args = ["add", "git://github.com/http-party/http-server"];

    const result = parsePackagesFromArguments(args);

    assert.deepEqual(result, [
      { name: "git://github.com/http-party/http-server", version: "latest" },
    ]);
  });

  it("should parse packages with -p {packageName}", () => {
    const args = ["dlx", "-p", "axios@1.9.0"];

    const result = parsePackagesFromArguments(args);

    assert.deepEqual(result, [{ name: "axios", version: "1.9.0" }]);
  });

  it("should parse packages with --package {packageName}", () => {
    const args = ["dlx", "--package", "axios@1.9.0"];

    const result = parsePackagesFromArguments(args);

    assert.deepEqual(result, [{ name: "axios", version: "1.9.0" }]);
  });

  // Security tests for @npm: alias bypass vulnerability
  describe("security: @npm: alias validation", () => {
    it("should NOT strip @npm: from URL with @npm: in query parameter", () => {
      // This is the exploit scenario from the pentest
      const args = [
        "add",
        "https://attacker.example/payload.tgz?x=@npm:lodash",
      ];

      const result = parsePackagesFromArguments(args);

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
        "add",
        "https://attacker.example/@npm:lodash/payload.tgz",
      ];

      const result = parsePackagesFromArguments(args);

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
        "add",
        "http://malicious.com/package.tgz?alias=@npm:safe-package",
      ];

      const result = parsePackagesFromArguments(args);

      // The URL should remain unchanged, NOT be reduced to "safe-package"
      assert.deepEqual(result, [
        {
          name: "http://malicious.com/package.tgz?alias=@npm:safe-package",
          version: "latest",
        },
      ]);
    });

    it("should NOT strip @npm: from file path with @npm: marker", () => {
      const args = ["add", "./local/@npm:package"];

      const result = parsePackagesFromArguments(args);

      // File paths should not be treated as aliases
      assert.deepEqual(result, [
        { name: "./local/@npm:package", version: "latest" },
      ]);
    });

    it("should NOT strip @npm: from absolute file path with @npm: marker", () => {
      const args = ["add", "/tmp/@npm:package"];

      const result = parsePackagesFromArguments(args);

      // Absolute paths should not be treated as aliases
      assert.deepEqual(result, [{ name: "/tmp/@npm:package", version: "latest" }]);
    });

    it("should NOT strip @npm: from Windows path with @npm: marker", () => {
      const args = ["add", "C:\\packages\\@npm:lodash"];

      const result = parsePackagesFromArguments(args);

      // Windows paths should not be treated as aliases
      assert.deepEqual(result, [
        { name: "C:\\packages\\@npm:lodash", version: "latest" },
      ]);
    });

    it("should NOT strip @npm: from file: protocol URL with @npm: marker", () => {
      const args = ["add", "file:///tmp/@npm:package.tgz"];

      const result = parsePackagesFromArguments(args);

      // file: protocol should not be treated as an alias
      assert.deepEqual(result, [
        { name: "file:///tmp/@npm:package.tgz", version: "latest" },
      ]);
    });

    it("should strip @npm: from valid npm alias", () => {
      // This is a legitimate npm alias and should be processed
      const args = ["add", "server@npm:http-server@14.1.1"];

      const result = parsePackagesFromArguments(args);

      // Valid alias should be stripped
      assert.deepEqual(result, [{ name: "http-server", version: "14.1.1" }]);
    });

    it("should strip @npm: from valid scoped package alias", () => {
      const args = ["add", "my-alias@npm:@scope/package@1.0.0"];

      const result = parsePackagesFromArguments(args);

      // Valid alias with scoped package should be stripped
      assert.deepEqual(result, [
        { name: "@scope/package", version: "1.0.0" },
      ]);
    });

    it("should strip @npm: from valid alias without version", () => {
      const args = ["add", "server@npm:http-server"];

      const result = parsePackagesFromArguments(args);

      // Valid alias without version should be stripped
      assert.deepEqual(result, [{ name: "http-server", version: "latest" }]);
    });

    it("should NOT strip @npm: when alias name is empty", () => {
      const args = ["add", "@npm:lodash"];

      const result = parsePackagesFromArguments(args);

      // Empty alias name should not be treated as valid alias
      assert.deepEqual(result, [{ name: "@npm:lodash", version: "latest" }]);
    });

    it("should handle multiple packages with mixed valid and invalid @npm: markers", () => {
      const args = [
        "add",
        "https://attacker.example/payload.tgz?x=@npm:lodash",
        "server@npm:http-server",
      ];

      const result = parsePackagesFromArguments(args);

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
      const args = ["add", "git://github.com/user/@npm:repo"];

      const result = parsePackagesFromArguments(args);

      // Git URLs should not be treated as aliases
      assert.deepEqual(result, [
        { name: "git://github.com/user/@npm:repo", version: "latest" },
      ]);
    });

    it("should handle -p option with malicious URL containing @npm:", () => {
      const args = [
        "dlx",
        "-p",
        "https://attacker.example/payload.tgz?x=@npm:lodash",
      ];

      const result = parsePackagesFromArguments(args);

      // URL should remain unchanged even with -p option
      assert.deepEqual(result, [
        {
          name: "https://attacker.example/payload.tgz?x=@npm:lodash",
          version: "latest",
        },
      ]);
    });
  });
});
