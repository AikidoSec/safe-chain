import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import tls from "node:tls";

// Utility to remove the generated bundle so the module rebuilds it on demand
function removeBundleIfExists() {
  const target = path.join(os.tmpdir(), "safe-chain-ca-bundle.pem");
  try {
    if (fs.existsSync(target)) fs.unlinkSync(target);
  } catch {
    // ignore
  }
}

describe("certBundle.getCombinedCaBundlePath", () => {
  beforeEach(() => {
    mock.restoreAll();
    removeBundleIfExists();
  });

  it("includes Safe Chain CA when parsable and produces a PEM bundle", async () => {
    // Prepare a temporary Safe Chain CA file with a recognizable marker and a valid cert block
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pipcabundle-"));
    const safeChainPath = path.join(tmpDir, "safechain-ca.pem");
    const marker = "# SAFE_CHAIN_TEST_MARKER";
    const rootPem = typeof tls.rootCertificates?.[0] === "string" ? tls.rootCertificates[0] : "";
    assert.ok(rootPem.includes("BEGIN CERTIFICATE"), "Environment lacks Node root certificates for test");
    fs.writeFileSync(safeChainPath, `${marker}\n${rootPem}`, "utf8");

    // Mock the certUtils.getCaCertPath to return our temp file
    mock.module("./certUtils.js", {
      namedExports: {
        getCaCertPath: () => safeChainPath,
      },
    });

    const { getCombinedCaBundlePath } = await import("./certBundle.js");
    const bundlePath = getCombinedCaBundlePath();
    assert.ok(fs.existsSync(bundlePath), "Bundle path should exist");
    const contents = fs.readFileSync(bundlePath, "utf8");
    assert.match(contents, /-----BEGIN CERTIFICATE-----/);
    assert.ok(contents.includes(marker), "Bundle should include Safe Chain CA content when parsable");
  });

  it("ignores invalid Safe Chain CA but still builds from other sources", async () => {
    // Write an invalid file (no cert blocks)
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pipcabundle-"));
    const safeChainPath = path.join(tmpDir, "safechain-invalid.pem");
    const invalidMarker = "INVALID_SAFE_CHAIN_CONTENT";
    fs.writeFileSync(safeChainPath, invalidMarker, "utf8");

    // Mock the certUtils.getCaCertPath to return our invalid file
    mock.module("./certUtils.js", {
      namedExports: {
        getCaCertPath: () => safeChainPath,
      },
    });

    // Ensure fresh build
    removeBundleIfExists();
    const { getCombinedCaBundlePath } = await import("./certBundle.js");
    const bundlePath = getCombinedCaBundlePath();
    assert.ok(fs.existsSync(bundlePath), "Bundle path should exist");
    const contents = fs.readFileSync(bundlePath, "utf8");
    assert.match(contents, /-----BEGIN CERTIFICATE-----/, "Bundle should contain certificate blocks from certifi/Node roots");
    assert.ok(!contents.includes(invalidMarker), "Bundle should not include invalid Safe Chain content");
  });
});
