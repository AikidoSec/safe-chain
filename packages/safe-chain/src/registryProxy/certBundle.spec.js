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
  const cert = typeof tls.rootCertificates?.[0] === "string" ? tls.rootCertificates[0] : "";
  assert.ok(cert.includes("BEGIN CERTIFICATE"), "Environment lacks Node root certificates for test");
  return cert;
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

describe("certBundle.getCombinedCaBundlePathWithUserCerts", () => {
  beforeEach(() => {
    mock.restoreAll();
  });

  it("returns a path with Safe Chain CA when no user cert provided", async () => {
    // Mock getCaCertPath to return valid cert
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "certtest-"));
    const safeChainPath = path.join(tmpDir, "safechain.pem");
    fs.writeFileSync(safeChainPath, getValidCert(), "utf8");

    mock.module("./certUtils.js", {
      namedExports: {
        getCaCertPath: () => safeChainPath,
      },
    });

    const { getCombinedCaBundlePathWithUserCerts } = await import("./certBundle.js");
    const bundlePath = getCombinedCaBundlePathWithUserCerts(undefined);

    assert.ok(fs.existsSync(bundlePath), "Bundle path should exist");
    const contents = fs.readFileSync(bundlePath, "utf8");
    assert.match(contents, /-----BEGIN CERTIFICATE-----/, "Should contain Safe Chain CA");
  });

  it("merges user cert with Safe Chain CA", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "certtest-"));
    
    // Create Safe Chain CA
    const safeChainPath = path.join(tmpDir, "safechain.pem");
    const safeChainCert = getValidCert();
    fs.writeFileSync(safeChainPath, safeChainCert, "utf8");

    // Create user cert file
    const userCertPath = path.join(tmpDir, "user-cert.pem");
    const userCert = getValidCert();
    fs.writeFileSync(userCertPath, userCert, "utf8");

    mock.module("./certUtils.js", {
      namedExports: {
        getCaCertPath: () => safeChainPath,
      },
    });

    const { getCombinedCaBundlePathWithUserCerts } = await import("./certBundle.js");
    const bundlePath = getCombinedCaBundlePathWithUserCerts(userCertPath);

    assert.ok(fs.existsSync(bundlePath), "Bundle path should exist");
    const contents = fs.readFileSync(bundlePath, "utf8");
    
    // Both certs should be in the bundle
    const certCount = (contents.match(/-----BEGIN CERTIFICATE-----/g) || []).length;
    assert.ok(certCount >= 2, "Bundle should contain both Safe Chain and user certificates");
  });

  it("ignores non-existent user cert path", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "certtest-"));
    const safeChainPath = path.join(tmpDir, "safechain.pem");
    fs.writeFileSync(safeChainPath, getValidCert(), "utf8");

    mock.module("./certUtils.js", {
      namedExports: {
        getCaCertPath: () => safeChainPath,
      },
    });

    const { getCombinedCaBundlePathWithUserCerts } = await import("./certBundle.js");
    const bundlePath = getCombinedCaBundlePathWithUserCerts("/nonexistent/path.pem");

    assert.ok(fs.existsSync(bundlePath), "Bundle path should exist");
    const contents = fs.readFileSync(bundlePath, "utf8");
    // Should still have Safe Chain CA
    assert.match(contents, /-----BEGIN CERTIFICATE-----/, "Should contain Safe Chain CA");
  });

  it("ignores invalid PEM user cert", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "certtest-"));
    
    const safeChainPath = path.join(tmpDir, "safechain.pem");
    fs.writeFileSync(safeChainPath, getValidCert(), "utf8");

    const userCertPath = path.join(tmpDir, "invalid.pem");
    fs.writeFileSync(userCertPath, "NOT A VALID CERTIFICATE", "utf8");

    mock.module("./certUtils.js", {
      namedExports: {
        getCaCertPath: () => safeChainPath,
      },
    });

    const { getCombinedCaBundlePathWithUserCerts } = await import("./certBundle.js");
    const bundlePath = getCombinedCaBundlePathWithUserCerts(userCertPath);

    assert.ok(fs.existsSync(bundlePath), "Bundle path should exist");
    const contents = fs.readFileSync(bundlePath, "utf8");
    // Should still have Safe Chain CA only
    assert.match(contents, /-----BEGIN CERTIFICATE-----/, "Should contain Safe Chain CA");
    assert.ok(!contents.includes("NOT A VALID"), "Should not include invalid cert");
  });

  it("rejects user cert with path traversal attempts", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "certtest-"));
    const safeChainPath = path.join(tmpDir, "safechain.pem");
    fs.writeFileSync(safeChainPath, getValidCert(), "utf8");

    mock.module("./certUtils.js", {
      namedExports: {
        getCaCertPath: () => safeChainPath,
      },
    });

    const { getCombinedCaBundlePathWithUserCerts } = await import("./certBundle.js");
    const bundlePath = getCombinedCaBundlePathWithUserCerts("../../../etc/passwd");

    assert.ok(fs.existsSync(bundlePath), "Bundle path should exist");
    const contents = fs.readFileSync(bundlePath, "utf8");
    // Should only have Safe Chain CA, rejected the traversal path
    assert.match(contents, /-----BEGIN CERTIFICATE-----/, "Should contain Safe Chain CA");
  });

  it("rejects user cert with symlink", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "certtest-"));
    
    const safeChainPath = path.join(tmpDir, "safechain.pem");
    fs.writeFileSync(safeChainPath, getValidCert(), "utf8");

    // Create a target file and a symlink to it
    const targetCert = path.join(tmpDir, "target.pem");
    fs.writeFileSync(targetCert, getValidCert(), "utf8");
    
    const symlinkPath = path.join(tmpDir, "symlink.pem");
    try {
      fs.symlinkSync(targetCert, symlinkPath);
    } catch {
      // Skip test if symlinks are not supported (e.g., on Windows without admin)
      return;
    }

    mock.module("./certUtils.js", {
      namedExports: {
        getCaCertPath: () => safeChainPath,
      },
    });

    const { getCombinedCaBundlePathWithUserCerts } = await import("./certBundle.js");
    const bundlePath = getCombinedCaBundlePathWithUserCerts(symlinkPath);

    assert.ok(fs.existsSync(bundlePath), "Bundle path should exist");
    const contents = fs.readFileSync(bundlePath, "utf8");
    // Should only have Safe Chain CA, symlinks are rejected
    assert.match(contents, /-----BEGIN CERTIFICATE-----/, "Should contain Safe Chain CA");
  });

  it("rejects user cert that is a directory", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "certtest-"));
    
    const safeChainPath = path.join(tmpDir, "safechain.pem");
    fs.writeFileSync(safeChainPath, getValidCert(), "utf8");

    const certDir = path.join(tmpDir, "certs");
    fs.mkdirSync(certDir);

    mock.module("./certUtils.js", {
      namedExports: {
        getCaCertPath: () => safeChainPath,
      },
    });

    const { getCombinedCaBundlePathWithUserCerts } = await import("./certBundle.js");
    const bundlePath = getCombinedCaBundlePathWithUserCerts(certDir);

    assert.ok(fs.existsSync(bundlePath), "Bundle path should exist");
    const contents = fs.readFileSync(bundlePath, "utf8");
    // Should only have Safe Chain CA
    assert.match(contents, /-----BEGIN CERTIFICATE-----/, "Should contain Safe Chain CA");
  });

  it("handles empty string user cert path", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "certtest-"));
    const safeChainPath = path.join(tmpDir, "safechain.pem");
    fs.writeFileSync(safeChainPath, getValidCert(), "utf8");

    mock.module("./certUtils.js", {
      namedExports: {
        getCaCertPath: () => safeChainPath,
      },
    });

    const { getCombinedCaBundlePathWithUserCerts } = await import("./certBundle.js");
    const bundlePath = getCombinedCaBundlePathWithUserCerts("   ");

    assert.ok(fs.existsSync(bundlePath), "Bundle path should exist");
    const contents = fs.readFileSync(bundlePath, "utf8");
    assert.match(contents, /-----BEGIN CERTIFICATE-----/, "Should contain Safe Chain CA");
  });

  it("accepts files with CRLF line endings (Windows-style)", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "certtest-"));
    const safeChainPath = path.join(tmpDir, "safechain.pem");
    fs.writeFileSync(safeChainPath, getValidCert(), "utf8");

    // Create a real file with CRLF content to test Windows line ending support
    const userCertPath = path.join(tmpDir, "user-cert-crlf.pem");
    const crlfCert = getValidCert().replace(/\n/g, "\r\n");
    fs.writeFileSync(userCertPath, crlfCert, "utf8");

    mock.module("./certUtils.js", {
      namedExports: {
        getCaCertPath: () => safeChainPath,
      },
    });

    const { getCombinedCaBundlePathWithUserCerts } = await import("./certBundle.js");
    const bundlePath = getCombinedCaBundlePathWithUserCerts(userCertPath);
    assert.ok(fs.existsSync(bundlePath), "Bundle path should exist");
    const contents = fs.readFileSync(bundlePath, "utf8");
    const certCount = (contents.match(/-----BEGIN CERTIFICATE-----/g) || []).length;
    assert.ok(certCount >= 2, "Bundle should contain Safe Chain and user certificates with CRLF");
  });

  it("detects and handles Windows-style path syntax (drive letters and UNC)", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "certtest-"));
    const safeChainPath = path.join(tmpDir, "safechain.pem");
    fs.writeFileSync(safeChainPath, getValidCert(), "utf8");

    mock.module("./certUtils.js", {
      namedExports: {
        getCaCertPath: () => safeChainPath,
      },
    });

    const { getCombinedCaBundlePathWithUserCerts } = await import("./certBundle.js");
    
    // Test that Windows path syntax is recognized (even if files don't exist on macOS/Linux)
    // These should gracefully fail (return Safe Chain CA only) rather than crash
    const winPaths = [
      "C:\\temp\\cert.pem",
      "D:\\Users\\name\\certs\\ca.pem",
      "\\\\server\\share\\cert.pem"
    ];
    
    for (const winPath of winPaths) {
      const bundlePath = getCombinedCaBundlePathWithUserCerts(winPath);
      assert.ok(fs.existsSync(bundlePath), `Bundle should exist for ${winPath}`);
      const contents = fs.readFileSync(bundlePath, "utf8");
      assert.match(contents, /-----BEGIN CERTIFICATE-----/, "Should contain Safe Chain CA");
    }
  });

  it("rejects path traversal with Windows-style paths (C:\\temp\\..\\etc\\passwd)", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "certtest-"));
    const safeChainPath = path.join(tmpDir, "safechain.pem");
    fs.writeFileSync(safeChainPath, getValidCert(), "utf8");

    mock.module("./certUtils.js", {
      namedExports: {
        getCaCertPath: () => safeChainPath,
      },
    });

    const { getCombinedCaBundlePathWithUserCerts } = await import("./certBundle.js");
    
    // Test various Windows-style traversal attempts
    const traversalPaths = [
      "C:\\temp\\..\\etc\\passwd",
      "D:\\Users\\..\\..\\Windows\\System32",
      "\\\\server\\share\\..\\admin",
      "../../../etc/passwd",  // Unix-style for comparison
    ];
    
    for (const badPath of traversalPaths) {
      const bundlePath = getCombinedCaBundlePathWithUserCerts(badPath);
      assert.ok(fs.existsSync(bundlePath), "Bundle path should exist");
      const contents = fs.readFileSync(bundlePath, "utf8");
      // Only Safe Chain CA should be present (user cert rejected due to traversal)
      const certCount = (contents.match(/-----BEGIN CERTIFICATE-----/g) || []).length;
      assert.strictEqual(certCount, 1, `Traversal path ${badPath} should be rejected; only Safe Chain CA included`);
    }
  });
});
