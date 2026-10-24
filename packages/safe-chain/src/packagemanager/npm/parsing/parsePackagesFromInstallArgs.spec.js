import { describe, it } from "node:test";
import assert from "node:assert";
import { parsePackagesFromInstallArgs } from "./parsePackagesFromInstallArgs.js";

describe("parsePackagesFromInstallArgs", () => {
  it("should return an empty array for no changes", () => {
    const args = ["install"];

    const result = parsePackagesFromInstallArgs(args);

    assert.deepEqual(result, { packages: [], registry: null });
  });

  it("should return an array of changes for one package", () => {
    const args = ["install", "@jest/transform@29.7.0"];

    const result = parsePackagesFromInstallArgs(args);

    assert.deepEqual(result, { 
      packages: [{ name: "@jest/transform", version: "29.7.0" }],
      registry: null
    });
  });

  it("should return the package in the format @vercel/otel", () => {
    const args = ["install", "@vercel/otel"];

    const result = parsePackagesFromInstallArgs(args);

    assert.deepEqual(result, { 
      packages: [{ name: "@vercel/otel", version: "latest" }],
      registry: null
    });
  });

  it("should return an array of changes for multiple packages", () => {
    const args = ["install", "express@4.17.1", "lodash@4.17.21"];

    const result = parsePackagesFromInstallArgs(args);

    assert.deepEqual(result, {
      packages: [
        { name: "express", version: "4.17.1" },
        { name: "lodash", version: "4.17.21" },
      ],
      registry: null
    });
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

    assert.deepEqual(result, {
      packages: [
        { name: "express", version: "4.17.1" },
        { name: "lodash", version: "4.17.21" },
      ],
      registry: null
    });
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

    assert.deepEqual(result, {
      packages: [
        { name: "express", version: "4.17.1" },
        { name: "lodash", version: "4.17.21" },
      ],
      registry: null
    });
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

    assert.deepEqual(result, {
      packages: [
        { name: "express", version: "4.17.1" },
        { name: "lodash", version: "4.17.21" },
      ],
      registry: null
    });
  });

  it("should set the default tag for packages", () => {
    const args = ["install", "express", "lodash@4.17.21"];

    const result = parsePackagesFromInstallArgs(args);

    assert.deepEqual(result, {
      packages: [
        { name: "express", version: "latest" },
        { name: "lodash", version: "4.17.21" },
      ],
      registry: null
    });
  });

  it("should set the default tag for packages with a specific tag", () => {
    const args = ["install", "express", "lodash@4.17.21", "--tag", "beta"];

    const result = parsePackagesFromInstallArgs(args);

    assert.deepEqual(result, {
      packages: [
        { name: "express", version: "beta" },
        { name: "lodash", version: "4.17.21" },
      ],
      registry: null
    });
  });

  it("should ignore alias", () => {
    const args = ["install", "express@npm:express@4.17.1"];

    const result = parsePackagesFromInstallArgs(args);

    assert.deepEqual(result, { 
      packages: [{ name: "express", version: "4.17.1" }],
      registry: null
    });
  });

  it("should parse version even for aliased packages", () => {
    const args = ["install", "express@npm:express@4.17.1"];

    const result = parsePackagesFromInstallArgs(args);

    assert.deepEqual(result, { 
      packages: [{ name: "express", version: "4.17.1" }],
      registry: null
    });
  });

  it("should parse scoped packages", () => {
    const args = ["install", "@scope/package@1.0.0"];

    const result = parsePackagesFromInstallArgs(args);

    assert.deepEqual(result, { 
      packages: [{ name: "@scope/package", version: "1.0.0" }],
      registry: null
    });
  });

  it("should parse packages with version ranges", () => {
    const args = ["install", "express@^4.17.1"];

    const result = parsePackagesFromInstallArgs(args);

    assert.deepEqual(result, { 
      packages: [{ name: "express", version: "^4.17.1" }],
      registry: null
    });
  });

  it("should parse package folders", () => {
    const args = ["install", "./local-package"];

    const result = parsePackagesFromInstallArgs(args);

    assert.deepEqual(result, { 
      packages: [{ name: "./local-package", version: "latest" }],
      registry: null
    });
  });

  it("should parse tarballs", () => {
    const args = ["install", "file:./local-package.tgz"];

    const result = parsePackagesFromInstallArgs(args);

    assert.deepEqual(result, {
      packages: [
        { name: "file:./local-package.tgz", version: "latest" },
      ],
      registry: null
    });
  });

  it("should parse tarball URLs", () => {
    const args = ["install", "https://example.com/local-package.tgz"];

    const result = parsePackagesFromInstallArgs(args);

    assert.deepEqual(result, {
      packages: [
        { name: "https://example.com/local-package.tgz", version: "latest" },
      ],
      registry: null
    });
  });

  it("should parse git URLs", () => {
    const args = ["install", "git://github.com/npm/cli.git"];

    const result = parsePackagesFromInstallArgs(args);

    assert.deepEqual(result, {
      packages: [
        { name: "git://github.com/npm/cli.git", version: "latest" },
      ],
      registry: null
    });
  });

  it("should capture registry option", () => {
    const args = ["install", "express@4.17.1", "--registry", "https://custom.registry.com"];

    const result = parsePackagesFromInstallArgs(args);

    assert.deepEqual(result, {
      packages: [
        { name: "express", version: "4.17.1" },
      ],
      registry: "https://custom.registry.com"
    });
  });

  it("should capture registry option with multiple packages", () => {
    const args = ["install", "express", "lodash", "--registry", "https://custom.registry.com"];

    const result = parsePackagesFromInstallArgs(args);

    assert.deepEqual(result, {
      packages: [
        { name: "express", version: "latest" },
        { name: "lodash", version: "latest" },
      ],
      registry: "https://custom.registry.com"
    });
  });
});
