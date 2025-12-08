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

/** @type {string | null} */
let cachedPath = null;

/**
 * Build a combined CA bundle.
 * Automatically includes:
 * - Safe Chain CA (for MITM of known registries)
 * - Mozilla roots via certifi (for public HTTPS)
 * - Node's built-in root certificates (fallback)
 * - User's custom certificates (if NODE_EXTRA_CA_CERTS environment variable is set)
 * 
 * @returns {string} Path to the combined CA bundle PEM file
 */
export function getCombinedCaBundlePath() {
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

  // 4) User's NODE_EXTRA_CA_CERTS (if set)
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

  const combined = parts.filter(Boolean).join("\n");
  const target = path.join(os.tmpdir(), `safe-chain-ca-bundle-${Date.now()}.pem`);
  fs.writeFileSync(target, combined, { encoding: "utf8" });
  cachedPath = target;
  return target;
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


