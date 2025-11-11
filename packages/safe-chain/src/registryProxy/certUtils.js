import forge from "node-forge";
import path from "path";
import fs from "fs";
import os from "os";
import { safeSpawn } from "../utils/safeSpawn.js";
import { SAFE_CHAIN_CA_COMMON_NAME } from "../config/settings.js";
import { ui } from "../environment/userInteraction.js";

const certFolder = path.join(os.homedir(), ".safe-chain", "certs");
const ca = loadCa();

const certCache = new Map();

// Known return values for os.platform()
const OS_DARWIN = "darwin";
const OS_LINUX = "linux";
const OS_WINDOWS = "win32";

// OS trust store paths
const DARWIN_CA_PATH = "/Library/Keychains/System.keychain";
const LINUX_CA_PATH = "/usr/local/share/ca-certificates/safe-chain-ca.crt";

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

  const attrs = [{ name: "commonName", value: SAFE_CHAIN_CA_COMMON_NAME }];
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
    if (platform === OS_DARWIN) {
      // macOS: check System Keychain for cert
      const res = await safeSpawn("security", ["find-certificate", "-c", SAFE_CHAIN_CA_COMMON_NAME, DARWIN_CA_PATH], { stdio: "pipe" });
      return res.stdout.includes(SAFE_CHAIN_CA_COMMON_NAME);
    } else if (platform === OS_LINUX) {
      // Linux: check for CA file
      return fs.existsSync(LINUX_CA_PATH);
    } else if (platform === OS_WINDOWS) {
      // Windows: check Root store for cert
      return await safeSpawn("certutil", ["-store", "Root", SAFE_CHAIN_CA_COMMON_NAME], { stdio: "pipe" }).then(res => res.stdout.includes(SAFE_CHAIN_CA_COMMON_NAME));
    }
  } catch (/** @type any */ error) {
    ui.writeVerbose(`Safe-chain: CA check failed: ${error?.message || error}`);
    return false;
  }
  return false;
}

/**
 * Installs the Safe Chain CA certificate in the OS trust store.
 * @returns {Promise<void>}
 */
export async function installSafeChainCA() {
  const caPath = getCaCertPath();
  const platform = os.platform();
  try {
    const alreadyInstalled = await isSafeChainCAInstalled();
    if (alreadyInstalled) {
      ui.writeVerbose("Safe-chain: CA already installed in OS trust store.");
      return;
    }

    ui.writeInformation("Safe-chain: Installing CA certificate to trust store. This may require elevated permissions.");

    if (platform === OS_DARWIN) {
      // macOS: Install into user trust store
      const securityCmd = ["add-trusted-cert", "-r", "trustRoot", caPath];
      const result = await safeSpawn("security", securityCmd, { stdio: "inherit" });
      if (result.status !== 0) {
        throw new Error(`Failed to install CA certificate into user trust store (exit code ${result.status}).`);
      }
      ui.writeVerbose("Safe-chain: CA certificate installed in user trust settings (no admin prompt).");
    } else if (platform === OS_LINUX) {
      // Linux: use update-ca-certificates
      await safeSpawn("sudo", ["cp", caPath, LINUX_CA_PATH], { stdio: "inherit" });
      await safeSpawn("sudo", ["update-ca-certificates"], { stdio: "inherit" });
    } else if (platform === OS_WINDOWS) {
      // Windows: use certutil (with UAC elevation prompt)
      const psCommand = `Start-Process -FilePath certutil -ArgumentList '-addstore','-f','Root','${caPath}' -Verb RunAs -Wait`;
      await safeSpawn("powershell", ["-Command", psCommand], { stdio: "inherit" });
    } else {
      throw new Error("Unsupported OS for automatic CA installation. Please install manually.");
    }
    ui.writeVerbose("Safe-chain: CA certificate successfully installed in OS trust store.");
  } catch (/** @type any */ error) {
    ui.writeError("Failed to install Safe-chain CA certificate:", error.message);
    throw error;
  }
}
