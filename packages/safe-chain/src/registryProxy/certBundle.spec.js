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

// Utility to get a valid PEM certificate for testing
function getValidCert() {
  const cert =
    typeof tls.rootCertificates?.[0] === "string"
      ? tls.rootCertificates[0]
      : "";
  assert.ok(
    cert.includes("BEGIN CERTIFICATE"),
    "Environment lacks Node root certificates for test",
  );
  return cert;
}

describe("certBundle.getCombinedCaBundlePath", () => {
  beforeEach(() => {
    mock.restoreAll();
    removeBundleIfExists();
  });

  it("includes Safe Chain CA when parsable and produces a PEM bundle", async () => {
    // Prepare a temporary Safe Chain CA file with a recognizable marker and a valid cert block
    const marker = "# SAFE_CHAIN_TEST_MARKER";
    const rootPem =
      typeof tls.rootCertificates?.[0] === "string"
        ? tls.rootCertificates[0]
        : "";
    assert.ok(
      rootPem.includes("BEGIN CERTIFICATE"),
      "Environment lacks Node root certificates for test",
    );

    const { getCombinedCaBundlePath } = await import("./certBundle.js");
    const bundlePath = getCombinedCaBundlePath(`${marker}\n${rootPem}`);
    assert.ok(fs.existsSync(bundlePath), "Bundle path should exist");
    const contents = fs.readFileSync(bundlePath, "utf8");
    assert.match(contents, /-----BEGIN CERTIFICATE-----/);
    assert.ok(
      contents.includes(marker),
      "Bundle should include Safe Chain CA content when parsable",
    );
  });

  it("ignores invalid Safe Chain CA but still builds from other sources", async () => {
    // Write an invalid file (no cert blocks)
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pipcabundle-"));
    const safeChainPath = path.join(tmpDir, "safechain-invalid.pem");
    const invalidMarker = "INVALID_SAFE_CHAIN_CONTENT";
    fs.writeFileSync(safeChainPath, invalidMarker, "utf8");

    // Ensure fresh build
    removeBundleIfExists();
    const { getCombinedCaBundlePath } = await import("./certBundle.js");
    const bundlePath = getCombinedCaBundlePath(invalidMarker);
    assert.ok(fs.existsSync(bundlePath), "Bundle path should exist");
    const contents = fs.readFileSync(bundlePath, "utf8");
    assert.match(
      contents,
      /-----BEGIN CERTIFICATE-----/,
      "Bundle should contain certificate blocks from certifi/Node roots",
    );
    assert.ok(
      !contents.includes(invalidMarker),
      "Bundle should not include invalid Safe Chain content",
    );
  });
});

describe("certBundle.getCombinedCaBundlePath with user certs", () => {
  beforeEach(() => {
    mock.restoreAll();
    delete process.env.NODE_EXTRA_CA_CERTS;
  });

  it("returns a path with full CA bundle (Safe Chain + Mozilla + Node roots) when no user cert in env", async () => {
    const { getCombinedCaBundlePath } = await import("./certBundle.js");
    const bundlePath = getCombinedCaBundlePath(getValidCert());

    assert.ok(fs.existsSync(bundlePath), "Bundle path should exist");
    const contents = fs.readFileSync(bundlePath, "utf8");
    assert.match(
      contents,
      /-----BEGIN CERTIFICATE-----/,
      "Should contain certificate blocks",
    );
    // Should include base bundle (Safe Chain + Mozilla/Node roots)
    assert.ok(
      contents.length > 1000,
      "Bundle should be substantial with Mozilla/Node roots included",
    );
  });

  it("merges user cert with full base bundle (Safe Chain CA + Mozilla + Node roots)", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "certtest-"));

    // Create Safe Chain CA
    const safeChainCert = getValidCert();

    // Create user cert file
    const userCertPath = path.join(tmpDir, "user-cert.pem");
    const userCert = getValidCert();
    fs.writeFileSync(userCertPath, userCert, "utf8");
    process.env.NODE_EXTRA_CA_CERTS = userCertPath;

    const { getCombinedCaBundlePath } = await import("./certBundle.js");
    const bundlePath = getCombinedCaBundlePath(safeChainCert);

    assert.ok(fs.existsSync(bundlePath), "Bundle path should exist");
    const contents = fs.readFileSync(bundlePath, "utf8");

    // Both certs should be in the bundle
    const certCount = (contents.match(/-----BEGIN CERTIFICATE-----/g) || [])
      .length;
    assert.ok(
      certCount >= 2,
      "Bundle should contain both Safe Chain and user certificates",
    );
  });

  it("ignores invalid PEM user cert", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "certtest-"));

    const userCertPath = path.join(tmpDir, "invalid.pem");
    fs.writeFileSync(userCertPath, "NOT A VALID PEM", "utf8");
    process.env.NODE_EXTRA_CA_CERTS = userCertPath;

    const { getCombinedCaBundlePath } = await import("./certBundle.js");
    const bundlePath = getCombinedCaBundlePath(getValidCert());

    assert.ok(fs.existsSync(bundlePath), "Bundle path should exist");
    const contents = fs.readFileSync(bundlePath, "utf8");
    // Should still have Safe Chain CA only
    assert.match(
      contents,
      /-----BEGIN CERTIFICATE-----/,
      "Should contain Safe Chain CA",
    );
    assert.ok(
      !contents.includes("NOT A VALID"),
      "Should not include invalid cert",
    );
  });

  it("accepts files with CRLF line endings (Windows-style)", async () => {
    // Create a real file with CRLF content to test Windows line ending support
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "certtest-"));
    const userCertPath = path.join(tmpDir, "user-cert-crlf.pem");
    const userCert = getValidCert();
    const certWithCRLF = userCert.replace(/\n/g, "\r\n");
    fs.writeFileSync(userCertPath, certWithCRLF, "utf8");
    process.env.NODE_EXTRA_CA_CERTS = userCertPath;

    const { getCombinedCaBundlePath } = await import("./certBundle.js");
    const bundlePath = getCombinedCaBundlePath(getValidCert());
    assert.ok(fs.existsSync(bundlePath), "Bundle path should exist");
    const contents = fs.readFileSync(bundlePath, "utf8");
    const certCount = (contents.match(/-----BEGIN CERTIFICATE-----/g) || [])
      .length;
    assert.ok(
      certCount >= 2,
      "Bundle should contain Safe Chain and user certificates with CRLF",
    );
  });
});
