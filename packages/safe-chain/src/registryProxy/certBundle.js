import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// @ts-ignore - certifi has no type definitions
import certifi from "certifi";
import tls from "node:tls";
import { X509Certificate } from "node:crypto";
import { getCaCertPath } from "./certUtils.js";
import { ui } from "../environment/userInteraction.js";

/**
 * Check if a PEM string contains only parsable cert blocks.
 * @param {string} pem - PEM-encoded certificate string
 * @returns {boolean}
 */
function isParsable(pem) {
  if (!pem || typeof pem !== "string") return false;
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

/** @type {string | null} */
let cachedPath = null;

/**
 * Build a combined CA bundle for Python and Node HTTPS flows.
 * - Includes Safe Chain CA (for MITM of known registries)
 * - Includes Mozilla roots via npm `certifi` (public HTTPS)
 * - Includes Node's built-in root certificates as a portable fallback
 * @returns {string} Path to the combined CA bundle PEM file
 */
export function getCombinedCaBundlePath() {
  if (cachedPath && fs.existsSync(cachedPath)) return cachedPath;

  // Concatenate PEM files
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

  const combined = parts.filter(Boolean).join("\n");
  const target = path.join(os.tmpdir(), "safe-chain-ca-bundle.pem");
  fs.writeFileSync(target, combined, { encoding: "utf8" });
  cachedPath = target;
  return cachedPath;
}

/**
 * Read user certificate file.
 * @param {string} certPath - Path to certificate file
 * @returns {string | null} Certificate PEM content or null if invalid/unreadable
 */
function readUserCertificateFile(certPath) {
  try {
    // Validate path is a string and not attempting path traversal
    if (typeof certPath !== "string" || certPath.includes("..") || certPath.startsWith("/")) {
      return null;
    }

    if (!fs.existsSync(certPath)) {
      return null;
    }

    const certPathAbsolute = path.resolve(certPath);
    // Verify it's an absolute path (cross-platform)
    if (!path.isAbsolute(certPathAbsolute)) {
      return null;
    }

    const content = fs.readFileSync(certPathAbsolute, "utf8");
    return content && isParsable(content) ? content : null;
  } catch {
    return null;
  }
}

/**
 * Combine user's existing NODE_EXTRA_CA_CERTS with Safe Chain's CA certificate.
 * If user has NODE_EXTRA_CA_CERTS set, it's merged with Safe Chain CA.
 * 
 * @param {string | undefined} userCertPath - User's existing NODE_EXTRA_CA_CERTS path (if any)
 * @returns {string} Path to the final CA bundle
 */
export function getCombinedCaBundlePathWithUserCerts(userCertPath) {
  const parts = [];

  // 1) Add Safe Chain CA (for MITM'd registries)
  const safeChainPath = getCaCertPath();
  try {
    const safeChainPem = fs.readFileSync(safeChainPath, "utf8");
    if (isParsable(safeChainPem)) parts.push(safeChainPem.trim());
  } catch {
    // Ignore if Safe Chain CA is not available
  }

  // 2) Add user's certificates if provided
  if (userCertPath) {
    const userPem = readUserCertificateFile(userCertPath);
    if (userPem) {
      parts.push(userPem.trim());
      ui.writeWarning(`Safe-chain: Merging user's NODE_EXTRA_CA_CERTS from ${userCertPath}`);
    } else {
      ui.writeWarning(`Safe-chain: Could not read or parse user's NODE_EXTRA_CA_CERTS from ${userCertPath}`);
    }
  }

  const finalCombined = parts.filter(Boolean).join("\n");
  const target = path.join(os.tmpdir(), `safe-chain-ca-bundle-${Date.now()}.pem`);
  fs.writeFileSync(target, finalCombined, { encoding: "utf8" });
  return target;
}
