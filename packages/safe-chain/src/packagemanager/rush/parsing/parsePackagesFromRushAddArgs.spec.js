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

  it("should not strip @npm: from URLs with @npm: in query string", () => {
    const result = parsePackagesFromRushAddArgs([
      "--package",
      "https://evil.com/malware.tgz?foo=@npm:clean-package@1.0.0",
    ]);

    assert.deepEqual(result, [
      {
        name: "https://evil.com/malware.tgz?foo=@npm:clean-package@1.0.0",
        version: null,
      },
    ]);
  });

  it("should not strip @npm: from URLs with @npm: in fragment", () => {
    const result = parsePackagesFromRushAddArgs([
      "--package",
      "https://evil.com/malware.tgz#@npm:clean-package@1.0.0",
    ]);

    assert.deepEqual(result, [
      {
        name: "https://evil.com/malware.tgz#@npm:clean-package@1.0.0",
        version: null,
      },
    ]);
  });

  it("should not strip @npm: from http URLs", () => {
    const result = parsePackagesFromRushAddArgs([
      "--package",
      "http://evil.com/malware.tgz?x=@npm:clean@1.0.0",
    ]);

    assert.deepEqual(result, [
      {
        name: "http://evil.com/malware.tgz?x=@npm:clean@1.0.0",
        version: null,
      },
    ]);
  });

  it("should not strip @npm: from file: URLs", () => {
    const result = parsePackagesFromRushAddArgs([
      "--package",
      "file:./package.tgz?x=@npm:clean@1.0.0",
    ]);

    assert.deepEqual(result, [
      {
        name: "file:./package.tgz?x=@npm:clean@1.0.0",
        version: null,
      },
    ]);
  });

  it("should not strip @npm: from git URLs", () => {
    const result = parsePackagesFromRushAddArgs([
      "--package",
      "git://github.com/user/repo?x=@npm:clean@1.0.0",
    ]);

    assert.deepEqual(result, [
      {
        name: "git://github.com/user/repo?x=@npm:clean@1.0.0",
        version: null,
      },
    ]);
  });

  it("should not strip @npm: from git+ URLs", () => {
    const result = parsePackagesFromRushAddArgs([
      "--package",
      "git+https://github.com/user/repo?x=@npm:clean@1.0.0",
    ]);

    assert.deepEqual(result, [
      {
        name: "git+https://github.com/user/repo?x=@npm:clean@1.0.0",
        version: null,
      },
    ]);
  });

  it("should not strip @npm: from github: URLs", () => {
    const result = parsePackagesFromRushAddArgs([
      "--package",
      "github:user/repo?x=@npm:clean@1.0.0",
    ]);

    assert.deepEqual(result, [
      {
        name: "github:user/repo?x=@npm:clean@1.0.0",
        version: null,
      },
    ]);
  });

  it("should not process @npm: at the start as an alias", () => {
    const result = parsePackagesFromRushAddArgs(["--package", "@npm:axios@1.9.0"]);

    // @npm: at the start is not valid alias syntax, so it should be treated as-is
    assert.deepEqual(result, [{ name: "@npm:axios", version: "1.9.0" }]);
  });

  it("should still strip valid aliases with @npm:", () => {
    const result = parsePackagesFromRushAddArgs(["--package", "myalias@npm:axios@1.9.0"]);

    assert.deepEqual(result, [{ name: "axios", version: "1.9.0" }]);
  });
});
