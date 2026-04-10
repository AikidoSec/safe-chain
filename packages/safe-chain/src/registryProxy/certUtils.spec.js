import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";

describe("certUtils", () => {
  let originalSafeChainDir;

  beforeEach(() => {
    originalSafeChainDir = process.env.SAFE_CHAIN_DIR;
  });

  afterEach(() => {
    if (originalSafeChainDir === undefined) {
      delete process.env.SAFE_CHAIN_DIR;
    } else {
      process.env.SAFE_CHAIN_DIR = originalSafeChainDir;
    }

    mock.reset();
  });

  it("stores CA certificates in SAFE_CHAIN_DIR when configured", async () => {
    process.env.SAFE_CHAIN_DIR = "/custom/safe-chain";

    mock.module("fs", {
      defaultExport: {
        existsSync: () => false,
        mkdirSync: () => {},
        writeFileSync: () => {},
      },
    });

    mock.module("node-forge", {
      defaultExport: {
        pki: {
          getPublicKeyFingerprint: () => "fingerprint",
          rsa: {
            generateKeyPair: () => ({
              publicKey: "public-key",
              privateKey: "private-key",
            }),
          },
          createCertificate: () => ({
            publicKey: null,
            serialNumber: "",
            validity: {
              notBefore: new Date(),
              notAfter: new Date(),
            },
            setSubject: () => {},
            setIssuer: () => {},
            setExtensions: () => {},
            sign: () => {},
          }),
          privateKeyToPem: () => "private-key-pem",
          certificateToPem: () => "certificate-pem",
        },
        md: {
          sha1: { create: () => "sha1" },
          sha256: { create: () => "sha256" },
        },
      },
    });

    const { getCaCertPath } = await import("./certUtils.js");

    assert.strictEqual(
      getCaCertPath(),
      "/custom/safe-chain/certs/ca-cert.pem",
    );
  });
});
