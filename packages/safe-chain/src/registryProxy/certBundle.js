import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// @ts-ignore - certifi has no type definitions
import certifi from "certifi";
import tls from "node:tls";
import { X509Certificate } from "node:crypto";
import { getCaCertPath } from "./certUtils.js";
import { ui } from "../environment/userInteraction.js";

/** @type {string | null} */
let bundlePath = null;

/** @type {string[] | null} */
let combinedCerts = null;

/**
 * Read the OS system trust store when the runtime supports it.
 *
 * `tls.getCACertificates("system")` was added in Node 22.15 / 23.5, so on older
 * runtimes the function is absent and this is a silent no-op. Some platforms can
 * also throw while enumerating the store, so any failure yields an empty array.
 *
 * @returns {string[]} PEM-encoded system CA certificates (empty if unavailable)
 */
function getSystemCaCertificates() {
  try {
    // Cast: tls.getCACertificates was added in Node 22.15 / 23.5 and may be
    // missing from the installed @types/node, so reach it dynamically.
    const getCACertificates = /** @type {any} */ (tls).getCACertificates;
    if (typeof getCACertificates !== "function") return [];
    const certs = getCACertificates("system");
    return Array.isArray(certs) ? certs : [];
  } catch {
    return [];
  }
}

/**
 * Check if a PEM string contains only parsable cert blocks.
 * @param {string} pem - PEM-encoded certificate string
 * @returns {boolean}
 */
function isParsable(pem) {
  if (!pem || typeof pem !== "string") return false;
  pem = normalizeLineEndings(pem);
  const begin = "-----BEGIN CERTIFICATE-----";
  const end = "-----END CERTIFICATE-----";
  const blocks = [];

  let idx = 0;
  while (idx < pem.length) {
    const start = pem.indexOf(begin, idx);
    if (start === -1) break;
    const stop = pem.indexOf(end, start + begin.length);
    if (stop === -1) break;
    const blockEnd = stop + end.length;
    blocks.push(pem.slice(start, blockEnd));
    idx = blockEnd;
  }

  if (blocks.length === 0) return false;
  try {
    for (const b of blocks) {
      // throw if invalid
      new X509Certificate(b);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Build a combined CA bundle.
 * Automatically includes:
 * - Safe Chain CA (for MITM of known registries)
 * - Mozilla roots via certifi (for public HTTPS)
 * - Node's built-in root certificates (fallback)
 * - The OS system trust store (self-signed / internal-CA certs the user installed)
 * - User's custom certificates (if NODE_EXTRA_CA_CERTS environment variable is set)
 *
 * @returns {string} Path to the combined CA bundle PEM file
 */
export function getCombinedCaBundlePath() {
  if (bundlePath)
  {
    return bundlePath;
  }

  const parts = [];

  // 1) Safe Chain CA (for MITM'd registries)
  const safeChainPath = getCaCertPath();
  try {
    const safeChainPem = fs.readFileSync(safeChainPath, "utf8");
    if (isParsable(safeChainPem)) parts.push(safeChainPem.trim());
  } catch {
    // Ignore if Safe Chain CA is not available
  }

  // 2) certifi (Mozilla CA bundle for all public HTTPS)
  try {
    const certifiPem = fs.readFileSync(certifi, "utf8");
    if (isParsable(certifiPem)) parts.push(certifiPem.trim());
  } catch {
    // Ignore if certifi bundle is not available
  }

  // 3) Node's built-in root certificates
  try {
    const nodeRoots = tls.rootCertificates;
    if (Array.isArray(nodeRoots) && nodeRoots.length) {
      for (const rootPem of nodeRoots) {
        if (typeof rootPem !== "string") continue;
        if (isParsable(rootPem)) parts.push(rootPem.trim());
      }
    }
  } catch {
    // Ignore if unavailable
  }

  // 4) OS system trust store (self-signed / internal-CA certs installed by the
  //    user in the OS: ca-certificates.crt, macOS keychain, Windows cert store).
  //    No-op on Node < 22.15 where tls.getCACertificates is absent.
  for (const systemPem of getSystemCaCertificates()) {
    if (typeof systemPem !== "string") continue;
    if (isParsable(systemPem)) parts.push(systemPem.trim());
  }

  // 5) User's NODE_EXTRA_CA_CERTS (if set)
  const userCertPath = process.env.NODE_EXTRA_CA_CERTS;
  if (userCertPath) {
    const userPem = readUserCertificateFile(userCertPath);
    if (userPem) {
      parts.push(userPem.trim());
      ui.writeVerbose(`Safe-chain: Merging user's NODE_EXTRA_CA_CERTS from ${userCertPath}`);
    } else {
      ui.writeWarning(`Safe-chain: Could not read or parse user's NODE_EXTRA_CA_CERTS from ${userCertPath}`);
    }
  }

  combinedCerts = parts.filter(Boolean);
  const combined = combinedCerts.join("\n");
  bundlePath = path.join(os.tmpdir(), `safe-chain-ca-bundle-${Date.now()}.pem`);
  fs.writeFileSync(bundlePath, combined, { encoding: "utf8" });
  return bundlePath;
}

/**
 * Return the same combined trust as {@link getCombinedCaBundlePath}, but as an
 * array of PEM strings suitable for the `ca` option of an https request. Passing
 * this to `https.request` lets the proxy's own upstream TLS trust the OS store
 * (plus certifi + Node roots + NODE_EXTRA_CA_CERTS) without weakening validation.
 *
 * @returns {string[]} PEM-encoded certificates
 */
export function getCombinedCaCertificates() {
  if (!combinedCerts) {
    getCombinedCaBundlePath();
  }
  return combinedCerts || [];
}

/**
 * Remove the generated CA bundle file from disk.
 */
export function cleanupCertBundle() {
  if (bundlePath) {
    try {
      fs.unlinkSync(bundlePath);
    } catch (err) {
      ui.writeVerbose(`Failed to cleanup the create bundle at ${bundlePath}`, err)
    }
    bundlePath = null;
  }
  combinedCerts = null;
}

/**
 * Normalize path
 * @param {string} p - Path to normalize
 * @returns {string}
 */
function normalizePathF(p) {
  return p.replace(/\\/g, "/");
}

/**
 * Normalize line endings to LF
 * @param {string} text - Text with mixed line endings
 * @returns {string}
 */
function normalizeLineEndings(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * Read and validate user certificate file
 * @param {string} certPath - Path to certificate file
 * @returns {string | null} Certificate PEM content or null if invalid/unreadable
 */
function readUserCertificateFile(certPath) {
  try {
    // 1) Basic validation
    if (typeof certPath !== "string" || certPath.trim().length === 0) {
      return null;
    }

    // 2) Reject path traversal attempts (normalize backslashes first for Windows paths)
    const normalizedPath = normalizePathF(certPath);
    if (normalizedPath.includes("..")) {
      return null;
    }

    // 3) Check if file exists and is not a directory or symlink
    let stats;
    try {
      stats = fs.lstatSync(certPath);
    } catch {
      // File doesn't exist or can't be accessed
      return null;
    }

    if (!stats.isFile()) {
      // Reject directories and symlinks
      return null;
    }

    // 4) Read file content
    let content;
    try {
      content = fs.readFileSync(certPath, "utf8");
    } catch {
      return null;
    }

    if (!content || typeof content !== "string") {
      return null;
    }

    // 5) Validate PEM format
    if (!isParsable(content)) {
      return null;
    }

    return content;
  } catch {
    // Silently fail on any errors
    return null;
  }
}


