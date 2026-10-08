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

  it("should not strip @npm: from URLs with @npm: in query string", () => {
    const args = ["install", "https://evil.com/malware.tgz?foo=@npm:clean-package@1.0.0"];

    const result = parsePackagesFromInstallArgs(args);

    assert.deepEqual(result, [
      {
        name: "https://evil.com/malware.tgz?foo=@npm:clean-package@1.0.0",
        version: "latest",
      },
    ]);
  });

  it("should not strip @npm: from URLs with @npm: in fragment", () => {
    const args = ["install", "https://evil.com/malware.tgz#@npm:clean-package@1.0.0"];

    const result = parsePackagesFromInstallArgs(args);

    assert.deepEqual(result, [
      {
        name: "https://evil.com/malware.tgz#@npm:clean-package@1.0.0",
        version: "latest",
      },
    ]);
  });

  it("should not strip @npm: from http URLs", () => {
    const args = ["install", "http://evil.com/malware.tgz?x=@npm:clean@1.0.0"];

    const result = parsePackagesFromInstallArgs(args);

    assert.deepEqual(result, [
      {
        name: "http://evil.com/malware.tgz?x=@npm:clean@1.0.0",
        version: "latest",
      },
    ]);
  });

  it("should not strip @npm: from file: URLs", () => {
    const args = ["install", "file:./package.tgz?x=@npm:clean@1.0.0"];

    const result = parsePackagesFromInstallArgs(args);

    assert.deepEqual(result, [
      {
        name: "file:./package.tgz?x=@npm:clean@1.0.0",
        version: "latest",
      },
    ]);
  });

  it("should not strip @npm: from git URLs", () => {
    const args = ["install", "git://github.com/user/repo?x=@npm:clean@1.0.0"];

    const result = parsePackagesFromInstallArgs(args);

    assert.deepEqual(result, [
      {
        name: "git://github.com/user/repo?x=@npm:clean@1.0.0",
        version: "latest",
      },
    ]);
  });

  it("should not strip @npm: from git+ URLs", () => {
    const args = ["install", "git+https://github.com/user/repo?x=@npm:clean@1.0.0"];

    const result = parsePackagesFromInstallArgs(args);

    assert.deepEqual(result, [
      {
        name: "git+https://github.com/user/repo?x=@npm:clean@1.0.0",
        version: "latest",
      },
    ]);
  });

  it("should not strip @npm: from github: URLs", () => {
    const args = ["install", "github:user/repo?x=@npm:clean@1.0.0"];

    const result = parsePackagesFromInstallArgs(args);

    assert.deepEqual(result, [
      {
        name: "github:user/repo?x=@npm:clean@1.0.0",
        version: "latest",
      },
    ]);
  });

  it("should not process @npm: at the start as an alias", () => {
    const args = ["install", "@npm:express@4.17.1"];

    const result = parsePackagesFromInstallArgs(args);

    // @npm: at the start is not valid alias syntax, so it should be treated as-is
    assert.deepEqual(result, [{ name: "@npm:express", version: "4.17.1" }]);
  });

  it("should still strip valid aliases with @npm:", () => {
    const args = ["install", "myalias@npm:express@4.17.1"];

    const result = parsePackagesFromInstallArgs(args);

    assert.deepEqual(result, [{ name: "express", version: "4.17.1" }]);
  });
});
