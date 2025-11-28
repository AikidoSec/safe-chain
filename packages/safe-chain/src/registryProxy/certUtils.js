import forge from "node-forge";
import path from "path";
import fs from "fs";
import os from "os";

const certFolder = path.join(os.homedir(), ".safe-chain", "certs");
const ca = loadCa();

const certCache = new Map();

export function getCaCertPath() {
  return path.join(certFolder, "ca-cert.pem");
}

/**
 * @param {string} hostname
 * @returns {{privateKey: string, certificate: string}}
 */
export function generateCertForHost(hostname) {
  let existingCert = certCache.get(hostname);
  if (existingCert) {
    return existingCert;
  }

  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setHours(cert.validity.notBefore.getHours() + 1);

  const attrs = [{ name: "commonName", value: hostname }];
  cert.setSubject(attrs);
  cert.setIssuer(ca.certificate.subject.attributes);
  cert.setExtensions([
    {
      name: "subjectAltName",
      altNames: [
        {
          type: 2, // DNS
          value: hostname,
        },
      ],
    },
    {
      name: "keyUsage",
      digitalSignature: true,
      keyEncipherment: true,
    },
    {
      /*
        extKeyUsage serverAuth is required for TLS server authentication.
        This is especially important for Python venv environments, which use their own
        certificate validation logic and will reject certificates lacking the serverAuth EKU.
        Adding serverAuth does not impact other usages
      */
      name: "extKeyUsage",
      serverAuth: true,
    },
  ]);
  cert.sign(ca.privateKey, forge.md.sha256.create());

  const result = {
    privateKey: forge.pki.privateKeyToPem(keys.privateKey),
    certificate: forge.pki.certificateToPem(cert),
  };

  certCache.set(hostname, result);

  return result;
}

function loadCa() {
  const keyPath = path.join(certFolder, "ca-key.pem");
  const certPath = path.join(certFolder, "ca-cert.pem");

  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    const privateKeyPem = fs.readFileSync(keyPath, "utf8");
    const certPem = fs.readFileSync(certPath, "utf8");
    const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
    const certificate = forge.pki.certificateFromPem(certPem);

    // Don't return a cert that is valid for less than 1 hour
    const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
    if (certificate.validity.notAfter > oneHourFromNow) {
      return { privateKey, certificate };
    }
  }

  const { privateKey, certificate } = generateCa();
  fs.mkdirSync(certFolder, { recursive: true });
  fs.writeFileSync(keyPath, forge.pki.privateKeyToPem(privateKey));
  fs.writeFileSync(certPath, forge.pki.certificateToPem(certificate));
  return { privateKey, certificate };
}

function generateCa() {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setDate(cert.validity.notBefore.getDate() + 1);

  const attrs = [{ name: "commonName", value: "safe-chain proxy" }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    {
      name: "basicConstraints",
      cA: true,
    },
    {
      name: "keyUsage",
      keyCertSign: true,
      digitalSignature: true,
      keyEncipherment: true,
    },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  return {
    privateKey: keys.privateKey,
    certificate: cert,
  };
}
