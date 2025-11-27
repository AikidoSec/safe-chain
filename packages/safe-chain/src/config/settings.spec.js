import { describe, it } from "node:test";
import * as assert from "node:assert";
import { setEcoSystem, getEcoSystem, ECOSYSTEM_JS, ECOSYSTEM_PY, ECOSYSTEM_ALL } from "./settings.js";

describe("Ecosystem Settings", () => {
  it("should default to ECOSYSTEM_JS", () => {
    // Reset to default
    setEcoSystem(ECOSYSTEM_JS);
    assert.strictEqual(getEcoSystem(), ECOSYSTEM_JS);
  });

  it("should allow setting ECOSYSTEM_PY", () => {
    setEcoSystem(ECOSYSTEM_PY);
    assert.strictEqual(getEcoSystem(), ECOSYSTEM_PY);
    // Reset to default
    setEcoSystem(ECOSYSTEM_JS);
  });

  it("should allow setting ECOSYSTEM_ALL", () => {
    setEcoSystem(ECOSYSTEM_ALL);
    assert.strictEqual(getEcoSystem(), ECOSYSTEM_ALL);
    // Reset to default
    setEcoSystem(ECOSYSTEM_JS);
  });

  it("should throw error for invalid ecosystem", () => {
    assert.throws(
      () => setEcoSystem("invalid"),
      {
        name: "Error",
        message: /Invalid ecosystem: invalid/
      }
    );
  });

  it("should validate all valid ecosystem constants", () => {
    assert.doesNotThrow(() => setEcoSystem(ECOSYSTEM_JS));
    assert.doesNotThrow(() => setEcoSystem(ECOSYSTEM_PY));
    assert.doesNotThrow(() => setEcoSystem(ECOSYSTEM_ALL));
    // Reset to default
    setEcoSystem(ECOSYSTEM_JS);
  });
});
