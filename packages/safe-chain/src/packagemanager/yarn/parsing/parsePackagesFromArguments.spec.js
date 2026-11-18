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

  it("should not strip @npm: from URLs with @npm: in query string", () => {
    const args = ["add", "https://evil.com/malware.tgz?foo=@npm:clean-package@1.0.0"];

    const result = parsePackagesFromArguments(args);

    assert.deepEqual(result, [
      {
        name: "https://evil.com/malware.tgz?foo=@npm:clean-package@1.0.0",
        version: "latest",
      },
    ]);
  });

  it("should not strip @npm: from URLs with @npm: in fragment", () => {
    const args = ["add", "https://evil.com/malware.tgz#@npm:clean-package@1.0.0"];

    const result = parsePackagesFromArguments(args);

    assert.deepEqual(result, [
      {
        name: "https://evil.com/malware.tgz#@npm:clean-package@1.0.0",
        version: "latest",
      },
    ]);
  });

  it("should not strip @npm: from http URLs", () => {
    const args = ["add", "http://evil.com/malware.tgz?x=@npm:clean@1.0.0"];

    const result = parsePackagesFromArguments(args);

    assert.deepEqual(result, [
      {
        name: "http://evil.com/malware.tgz?x=@npm:clean@1.0.0",
        version: "latest",
      },
    ]);
  });

  it("should not strip @npm: from file: URLs", () => {
    const args = ["add", "file:./package.tgz?x=@npm:clean@1.0.0"];

    const result = parsePackagesFromArguments(args);

    assert.deepEqual(result, [
      {
        name: "file:./package.tgz?x=@npm:clean@1.0.0",
        version: "latest",
      },
    ]);
  });

  it("should not strip @npm: from git URLs", () => {
    const args = ["add", "git://github.com/user/repo?x=@npm:clean@1.0.0"];

    const result = parsePackagesFromArguments(args);

    assert.deepEqual(result, [
      {
        name: "git://github.com/user/repo?x=@npm:clean@1.0.0",
        version: "latest",
      },
    ]);
  });

  it("should not strip @npm: from git+ URLs", () => {
    const args = ["add", "git+https://github.com/user/repo?x=@npm:clean@1.0.0"];

    const result = parsePackagesFromArguments(args);

    assert.deepEqual(result, [
      {
        name: "git+https://github.com/user/repo?x=@npm:clean@1.0.0",
        version: "latest",
      },
    ]);
  });

  it("should not strip @npm: from github: URLs", () => {
    const args = ["add", "github:user/repo?x=@npm:clean@1.0.0"];

    const result = parsePackagesFromArguments(args);

    assert.deepEqual(result, [
      {
        name: "github:user/repo?x=@npm:clean@1.0.0",
        version: "latest",
      },
    ]);
  });

  it("should not process @npm: at the start as an alias", () => {
    const args = ["add", "@npm:axios@1.9.0"];

    const result = parsePackagesFromArguments(args);

    // @npm: at the start is not valid alias syntax, so it should be treated as-is
    assert.deepEqual(result, [{ name: "@npm:axios", version: "1.9.0" }]);
  });

  it("should still strip valid aliases with @npm:", () => {
    const args = ["add", "myalias@npm:axios@1.9.0"];

    const result = parsePackagesFromArguments(args);

    assert.deepEqual(result, [{ name: "axios", version: "1.9.0" }]);
  });
});
