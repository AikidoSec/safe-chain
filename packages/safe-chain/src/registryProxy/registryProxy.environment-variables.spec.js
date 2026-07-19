import { describe, it } from "node:test";
import assert from "node:assert";
import { mergeSafeChainProxyEnvironmentVariables } from "./registryProxy.js";

describe("registryProxy.environmentVariables", () => {
  it("should copy environment variables with empty string values", () => {
    const envVars = mergeSafeChainProxyEnvironmentVariables({
      EMPTY_VAR: "",
    });

    assert.strictEqual(envVars.EMPTY_VAR, "");
  });
});
