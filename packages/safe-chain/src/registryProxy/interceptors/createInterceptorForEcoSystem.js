import {
  ECOSYSTEM_JS,
  ECOSYSTEM_PY,
  getEcoSystem,
  getNpmCustomRegistries,
  getPipCustomRegistries,
} from "../../config/settings.js";
import { npmInterceptorForUrl } from "./npm/npmInterceptor.js";
import { pipInterceptorForUrl } from "./pip/pipInterceptor.js";
import { isImdsEndpoint } from "../isImdsEndpoint.js";

const knownJsRegistries = [
  "registry.npmjs.org",
  "registry.yarnpkg.com",
  "registry.npmjs.com",
];

const knownPipRegistries = [
  "files.pythonhosted.org",
  "pypi.org",
  "pypi.python.org",
  "pythonhosted.org",
];

/**
 * @param {string} url
 * @returns {import("./interceptorBuilder.js").Interceptor | undefined}
 */
export function createInterceptorForUrl(url) {
  const ecosystem = getEcoSystem();

  if (ecosystem === ECOSYSTEM_JS) {
    return npmInterceptorForUrl(url);
  }

  if (ecosystem === ECOSYSTEM_PY) {
    return pipInterceptorForUrl(url);
  }

  return undefined;
}

/**
 * Checks if a URL matches a known or configured registry for the current ecosystem.
 * This is used to enforce that proxy-only integrations only allow requests to
 * recognized package registries, preventing bypass via alternate sources.
 *
 * @param {string} url - The URL to check
 * @returns {boolean} - True if the URL matches a known/configured registry
 */
export function isRecognizedRegistryUrl(url) {
  // Extract hostname from URL (handle both full URLs and host:port format from CONNECT)
  let hostname;
  try {
    // Try parsing as full URL first
    const parsedUrl = new URL(url);
    hostname = parsedUrl.hostname;
  } catch {
    // If that fails, it might be in host:port format (from CONNECT method)
    // Extract just the hostname part
    const hostPort = url.split(":")[0];
    hostname = hostPort;
  }

  // Allow IMDS endpoints (cloud metadata services)
  if (isImdsEndpoint(hostname)) {
    return true;
  }

  // Allow localhost and loopback addresses (for local development/testing)
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.startsWith("127.") ||
    hostname.startsWith("0.0.0.0")
  ) {
    return true;
  }

  const ecosystem = getEcoSystem();

  if (ecosystem === ECOSYSTEM_JS) {
    const registries = [...knownJsRegistries, ...getNpmCustomRegistries()];
    return registries.some((reg) => url.includes(reg));
  }

  if (ecosystem === ECOSYSTEM_PY) {
    const registries = [...knownPipRegistries, ...getPipCustomRegistries()];
    return registries.some((reg) => url.includes(reg));
  }

  // For unknown ecosystems, allow all traffic (fail open for compatibility)
  return true;
}
