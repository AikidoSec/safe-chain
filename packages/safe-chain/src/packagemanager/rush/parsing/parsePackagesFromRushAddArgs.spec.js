import { describe, it } from "node:test";
import assert from "node:assert";
import { parsePackagesFromRushAddArgs } from "./parsePackagesFromRushAddArgs.js";

describe("parsePackagesFromRushAddArgs", () => {
  it("returns an empty array when no packages are provided", () => {
    const result = parsePackagesFromRushAddArgs([]);

    assert.deepEqual(result, []);
  });

  it("parses packages from --package arguments", () => {
    const result = parsePackagesFromRushAddArgs([
      "--package",
      "axios@1.9.0",
      "--package",
      "@scope/tool@2.0.0",
    ]);

    assert.deepEqual(result, [
      { name: "axios", version: "1.9.0" },
      { name: "@scope/tool", version: "2.0.0" },
    ]);
  });

  it("parses packages from -p arguments", () => {
    const result = parsePackagesFromRushAddArgs(["-p", "axios"]);

    assert.deepEqual(result, [{ name: "axios", version: null }]);
  });

  it("parses packages from --package=value arguments", () => {
    const result = parsePackagesFromRushAddArgs(["--package=axios@^1.9.0"]);

    assert.deepEqual(result, [{ name: "axios", version: "^1.9.0" }]);
  });

  it("ignores positional packages because rush add requires --package", () => {
    const result = parsePackagesFromRushAddArgs(["axios", "--dev"]);

    assert.deepEqual(result, []);
  });

  it("parses aliases", () => {
    const result = parsePackagesFromRushAddArgs(["--package", "server@npm:axios@1.9.0"]);

    assert.deepEqual(result, [{ name: "axios", version: "1.9.0" }]);
  });

  // Security tests for @npm: alias bypass vulnerability
  describe("security: @npm: alias validation", () => {
    it("should NOT strip @npm: from URL with @npm: in query parameter", () => {
      // This is the exploit scenario from the pentest
      const result = parsePackagesFromRushAddArgs([
        "--package",
        "https://attacker.example/payload.tgz?x=@npm:lodash",
      ]);

      // The URL should remain unchanged, NOT be reduced to "lodash"
      assert.deepEqual(result, [
        {
          name: "https://attacker.example/payload.tgz?x=@npm:lodash",
          version: null,
        },
      ]);
    });

    it("should NOT strip @npm: from URL with @npm: in path", () => {
      const result = parsePackagesFromRushAddArgs([
        "--package",
        "https://attacker.example/@npm:lodash/payload.tgz",
      ]);

      // The URL should remain unchanged
      assert.deepEqual(result, [
        {
          name: "https://attacker.example/@npm:lodash/payload.tgz",
          version: null,
        },
      ]);
    });

    it("should NOT strip @npm: from http URL with @npm: marker", () => {
      const result = parsePackagesFromRushAddArgs([
        "--package",
        "http://malicious.com/package.tgz?alias=@npm:safe-package",
      ]);

      // The URL should remain unchanged, NOT be reduced to "safe-package"
      assert.deepEqual(result, [
        {
          name: "http://malicious.com/package.tgz?alias=@npm:safe-package",
          version: null,
        },
      ]);
    });

    it("should NOT strip @npm: from file path with @npm: marker", () => {
      const result = parsePackagesFromRushAddArgs([
        "--package",
        "./local/@npm:package",
      ]);

      // File paths should not be treated as aliases
      assert.deepEqual(result, [
        { name: "./local/@npm:package", version: null },
      ]);
    });

    it("should NOT strip @npm: from absolute file path with @npm: marker", () => {
      const result = parsePackagesFromRushAddArgs([
        "--package",
        "/tmp/@npm:package",
      ]);

      // Absolute paths should not be treated as aliases
      assert.deepEqual(result, [{ name: "/tmp/@npm:package", version: null }]);
    });

    it("should NOT strip @npm: from Windows path with @npm: marker", () => {
      const result = parsePackagesFromRushAddArgs([
        "--package",
        "C:\\packages\\@npm:lodash",
      ]);

      // Windows paths should not be treated as aliases
      assert.deepEqual(result, [
        { name: "C:\\packages\\@npm:lodash", version: null },
      ]);
    });

    it("should NOT strip @npm: from file: protocol URL with @npm: marker", () => {
      const result = parsePackagesFromRushAddArgs([
        "--package",
        "file:///tmp/@npm:package.tgz",
      ]);

      // file: protocol should not be treated as an alias
      assert.deepEqual(result, [
        { name: "file:///tmp/@npm:package.tgz", version: null },
      ]);
    });

    it("should strip @npm: from valid npm alias", () => {
      // This is a legitimate npm alias and should be processed
      const result = parsePackagesFromRushAddArgs([
        "--package",
        "server@npm:http-server@14.1.1",
      ]);

      // Valid alias should be stripped
      assert.deepEqual(result, [{ name: "http-server", version: "14.1.1" }]);
    });

    it("should strip @npm: from valid scoped package alias", () => {
      const result = parsePackagesFromRushAddArgs([
        "--package",
        "my-alias@npm:@scope/package@1.0.0",
      ]);

      // Valid alias with scoped package should be stripped
      assert.deepEqual(result, [
        { name: "@scope/package", version: "1.0.0" },
      ]);
    });

    it("should strip @npm: from valid alias without version", () => {
      const result = parsePackagesFromRushAddArgs([
        "--package",
        "server@npm:http-server",
      ]);

      // Valid alias without version should be stripped
      assert.deepEqual(result, [{ name: "http-server", version: null }]);
    });

    it("should NOT strip @npm: when alias name is empty", () => {
      const result = parsePackagesFromRushAddArgs(["--package", "@npm:lodash"]);

      // Empty alias name should not be treated as valid alias
      assert.deepEqual(result, [{ name: "@npm:lodash", version: null }]);
    });

    it("should handle multiple packages with mixed valid and invalid @npm: markers", () => {
      const result = parsePackagesFromRushAddArgs([
        "--package",
        "https://attacker.example/payload.tgz?x=@npm:lodash",
        "--package",
        "server@npm:http-server",
      ]);

      // First package should remain unchanged, second should be stripped
      assert.deepEqual(result, [
        {
          name: "https://attacker.example/payload.tgz?x=@npm:lodash",
          version: null,
        },
        { name: "http-server", version: null },
      ]);
    });

    it("should NOT strip @npm: from git URL with @npm: marker", () => {
      const result = parsePackagesFromRushAddArgs([
        "--package",
        "git://github.com/user/@npm:repo",
      ]);

      // Git URLs should not be treated as aliases
      assert.deepEqual(result, [
        { name: "git://github.com/user/@npm:repo", version: null },
      ]);
    });

    it("should handle -p option with malicious URL containing @npm:", () => {
      const result = parsePackagesFromRushAddArgs([
        "-p",
        "https://attacker.example/payload.tgz?x=@npm:lodash",
      ]);

      // URL should remain unchanged even with -p option
      assert.deepEqual(result, [
        {
          name: "https://attacker.example/payload.tgz?x=@npm:lodash",
          version: null,
        },
      ]);
    });

    it("should handle --package=value with malicious URL containing @npm:", () => {
      const result = parsePackagesFromRushAddArgs([
        "--package=https://attacker.example/payload.tgz?x=@npm:lodash",
      ]);

      // URL should remain unchanged even with --package=value option
      assert.deepEqual(result, [
        {
          name: "https://attacker.example/payload.tgz?x=@npm:lodash",
          version: null,
        },
      ]);
    });
  });
});
