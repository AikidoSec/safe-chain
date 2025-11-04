import { describe, it } from "node:test";
import assert from "node:assert";
import { parsePackagesFromInstallArgs } from "./parsePackagesFromInstallArgs.js";

describe("parsePackagesFromInstallArgs", () => {
  it("should parse simple package name", () => {
    const result = parsePackagesFromInstallArgs(["install", "requests"]);
    assert.deepEqual(result, [
      { name: "requests", version: "latest", type: "add" },
    ]);
  });

  it("should parse package with version specifier", () => {
    const result = parsePackagesFromInstallArgs(["install", "requests==2.28.0"]);
    assert.deepEqual(result, [
      { name: "requests", version: "2.28.0", type: "add" },
    ]);
  });

  it("should skip flags", () => {
    const result = parsePackagesFromInstallArgs(["install", "--upgrade", "requests"]);
    assert.deepEqual(result, [
      { name: "requests", version: "latest", type: "add" },
    ]);
  });

  it("should parse multiple packages", () => {
    const result = parsePackagesFromInstallArgs(["install", "requests", "flask", "django==4.0"]);
    assert.deepEqual(result, [
      { name: "requests", version: "latest", type: "add" },
      { name: "flask", version: "latest", type: "add" },
      { name: "django", version: "4.0", type: "add" },
    ]);
  });

  it("should parse extras and strip them from name", () => {
    const result = parsePackagesFromInstallArgs(["install", "django[postgres]==4.2.1"]);
    assert.deepEqual(result, [
      { name: "django", version: "4.2.1", type: "add" },
    ]);
  });

  it("should skip ranges", () => {
    const result = parsePackagesFromInstallArgs(["install", "requests>=2,<3"]);
    assert.deepEqual(result, []);
  });

  it("should skip packages with range specifiers", () => {
    const result = parsePackagesFromInstallArgs([
      "install",
      "requests>=2.0.0",
      "flask>1.0",
      "django<=4.0",
      "numpy~=1.20",
      "scipy!=1.5.0",
      "pandas==1.3.0",
    ]);
    // Only pandas with exact version (==) should be returned
    assert.deepEqual(result, [
      { name: "pandas", version: "1.3.0", type: "add" },
    ]);
  });

  it("should support === exact version specifier", () => {
    const result = parsePackagesFromInstallArgs(["install", "requests===2.28.0"]);
    assert.deepEqual(result, [
      { name: "requests", version: "2.28.0", type: "add" },
    ]);
  });

  it("should skip VCS/URL/path)", () => {
    const result = parsePackagesFromInstallArgs([
      "install",
      "git+https://github.com/pallets/flask.git",
      "https://files.pythonhosted.org/packages/foo/bar.whl",
      "file:/tmp/pkg.whl",
      "./localpkg",
    ]);
    assert.deepEqual(result, []);
  });

  it("should return empty array for no packages", () => {
    const result = parsePackagesFromInstallArgs(["install", "--help"]);
    assert.deepEqual(result, []);
  });

  it("should skip all flags with parameters", () => {
    const result = parsePackagesFromInstallArgs([
      "install",
      "--target",
      "/tmp/target",
      "--platform",
      "linux",
      "--python-version",
      "3.9",
      "--index-url",
      "https://pypi.org/simple",
      "--trusted-host",
      "pypi.org",
      "requests==2.28.0",
      "--cache-dir",
      "/tmp/cache",
      "flask",
    ]);
    assert.deepEqual(result, [
      { name: "requests", version: "2.28.0", type: "add" },
      { name: "flask", version: "latest", type: "add" },
    ]);
  });
});
