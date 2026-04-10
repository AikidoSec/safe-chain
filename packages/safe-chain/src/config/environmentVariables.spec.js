import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";

const { getSafeChainDir } = await import("./environmentVariables.js");

describe("getSafeChainDir", () => {
  let original;

  beforeEach(() => {
    original = process.env.SAFE_CHAIN_DIR;
  });

  afterEach(() => {
    if (original !== undefined) {
      process.env.SAFE_CHAIN_DIR = original;
    } else {
      delete process.env.SAFE_CHAIN_DIR;
    }
  });

  it("returns undefined when SAFE_CHAIN_DIR is not set", () => {
    delete process.env.SAFE_CHAIN_DIR;
    assert.strictEqual(getSafeChainDir(), undefined);
  });

  it("returns the value of SAFE_CHAIN_DIR when set", () => {
    process.env.SAFE_CHAIN_DIR = "/usr/local/.safe-chain";
    assert.strictEqual(getSafeChainDir(), "/usr/local/.safe-chain");
  });
});
