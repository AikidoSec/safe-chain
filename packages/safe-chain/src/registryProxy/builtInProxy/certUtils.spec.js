import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";

describe("certUtils", () => {
  let installedSafeChainDir;

  beforeEach(() => {
    installedSafeChainDir = undefined;
    mock.module("../../config/safeChainDir.js", {
      namedExports: {
        getSafeChainBaseDir: () => installedSafeChainDir ?? "/home/test/.safe-chain",
        getCertsDir: () => `${installedSafeChainDir ?? "/home/test/.safe-chain"}/certs`,
      },
    });
  });

  afterEach(() => {
    mock.reset();
  });

  it("stores CA certificates in the packaged install dir when available", async () => {
    installedSafeChainDir = "/custom/safe-chain";

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
