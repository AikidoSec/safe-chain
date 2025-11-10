import forge from "node-forge";
import path from "path";
import fs from "fs";
import os from "os";
import { safeSpawn } from "../utils/safeSpawn.js";
import { DARWIN_CA_PATH, LINUX_CA_PATH } from "../config/settings.js";

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

/**
 * Checks if the Safe Chain CA certificate is already installed in the OS trust store.
 * @returns {Promise<boolean>}
 */
export async function isSafeChainCAInstalled() {
  const platform = os.platform();
  try {
    if (platform === "darwin") {
      // macOS: check System Keychain for cert
      const res = await safeSpawn("security", ["find-certificate", "-c", "safe-chain proxy", DARWIN_CA_PATH], { stdio: "pipe" });
      return res.stdout.includes("safe-chain proxy");
    } else if (platform === "linux") {
      // Linux: check for CA file
      return fs.existsSync(LINUX_CA_PATH);
    } else if (platform === "win32") {
      // Windows: check Root store for cert
      return await safeSpawn("certutil", ["-store", "Root", "safe-chain proxy"], { stdio: "pipe" }).then(res => res.stdout.includes("safe-chain proxy"));
    }
  } catch (err) {
    // If check fails, assume not installed
    return false;
  }
  return false;
}

/**
 * Installs the Safe Chain CA certificate in the OS trust store.
 * Uses platform-specific commands. Optionally uses npm packages if available.
 * @returns {Promise<void>}
 */
export async function installSafeChainCA() {
  const caPath = getCaCertPath();
  const platform = os.platform();
  try {
    const alreadyInstalled = await isSafeChainCAInstalled();
    if (alreadyInstalled) {
      console.log("Safe Chain CA already installed in OS trust store.");
      return;
    }
    if (platform === "darwin") {
      // macOS: use security CLI
      await safeSpawn("sudo", [
        "security",
        "add-trusted-cert",
        "-d",
        "-r", "trustRoot",
        "-k", DARWIN_CA_PATH,
        caPath
      ], { stdio: "inherit" });
    } else if (platform === "linux") {
      // Linux: use update-ca-certificates
      await safeSpawn("sudo", ["cp", caPath, LINUX_CA_PATH], { stdio: "inherit" });
      await safeSpawn("sudo", ["update-ca-certificates"], { stdio: "inherit" });
    } else if (platform === "win32") {
      // Windows: use certutil
      await safeSpawn("certutil", ["-addstore", "-f", "Root", caPath], { stdio: "inherit" });
    } else {
      throw new Error("Unsupported OS for automatic CA installation. Please install manually.");
    }
    console.log("Safe Chain CA installed in OS trust store.");
  } catch (/** @type any */ error) {
    console.error("Failed to install Safe Chain CA:", error.message);
    throw error;
  }
}
