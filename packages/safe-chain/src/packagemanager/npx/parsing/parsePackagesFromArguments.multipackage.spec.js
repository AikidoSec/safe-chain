import { describe, it } from "node:test";
import assert from "node:assert";
import { parsePackagesFromArguments } from "./parsePackagesFromArguments.js";

describe("parsePackagesFromArguments multiple --package flags", () => {
  it("scans every --package= flag, not just the first", () => {
    const args = ["--package=safe", "--package=evil", "cmd"];

    const result = parsePackagesFromArguments(args);

    assert.deepEqual(result, [
      { name: "safe", version: "latest" },
      { name: "evil", version: "latest" },
    ]);
  });

  it("scans three --package= flags", () => {
    const args = ["--package=a", "--package=b", "--package=c", "run"];

    const result = parsePackagesFromArguments(args);

    assert.deepEqual(result, [
      { name: "a", version: "latest" },
      { name: "b", version: "latest" },
      { name: "c", version: "latest" },
    ]);
  });

  it("scans multiple '--package x' (space) flags", () => {
    const args = ["--package", "a", "--package", "b", "-c", "cmd"];

    const result = parsePackagesFromArguments(args);

    assert.deepEqual(result, [
      { name: "a", version: "latest" },
      { name: "b", version: "latest" },
    ]);
  });

  it("scans multiple '-p x' (short) flags", () => {
    const args = ["-p", "a", "-p", "b", "-c", "cmd"];

    const result = parsePackagesFromArguments(args);

    assert.deepEqual(result, [
      { name: "a", version: "latest" },
      { name: "b", version: "latest" },
    ]);
  });

  it("preserves versions across multiple --package flags", () => {
    const args = ["--package=a@1.0.0", "--package=b@2.0.0", "cmd"];

    const result = parsePackagesFromArguments(args);

    assert.deepEqual(result, [
      { name: "a", version: "1.0.0" },
      { name: "b", version: "2.0.0" },
    ]);
  });

  it("still returns only the first positional package (npx pkg command)", () => {
    const args = ["http-server", "jest"];

    const result = parsePackagesFromArguments(args);

    assert.deepEqual(result, [{ name: "http-server", version: "latest" }]);
  });
});
