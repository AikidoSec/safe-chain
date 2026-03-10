import { ui } from "../environment/userInteraction.js";
import { createRamaProxy, getRamaPath } from "./ramaProxy/createRamaProxy.js";
import { createBuiltInProxyServer } from "./builtInProxy/createBuiltInProxyServer.js";
import { getCombinedCaBundlePath } from "./certBundle.js";

/**
 * @typedef {Object} MalwareBlockedEvent
 * @prop {string} packageName
 * @prop {string} packageVersion
 *
 * @typedef {Object} MinPackageAgeSuppressionEvent
 * @prop {string} packageName
 * @prop {string[]} packageVersions
 *
 * @typedef {{ 
 *    malwareBlocked: [MalwareBlockedEvent], 
 *    minPackageAgeVersionsSuppressed: [MinPackageAgeSuppressionEvent]
 * }} ProxyServerEvents
 *
 * @import { EventEmitter } from "node:stream"
 * @typedef {EventEmitter<ProxyServerEvents> & {
 *   startServer: () => Promise<void>
 *   stopServer: () => Promise<void>
 *   getServerPort: () => Number | null
 *   getCaCert: () => string | null
 * }} SafeChainProxy
 *
 * @typedef {Object} ProxySettings
 * @prop {string | null} proxyUrl
 * @prop {string} caCertBundlePath
 */

/** @type {SafeChainProxy} */
let server;

export function createSafeChainProxy() {
  if (server) {
    return server;
  }

  let ramaPath = getRamaPath();
  if (ramaPath) {
    ui.writeVerbose("Starting safe-chain rama proxy");
    server = createRamaProxy(ramaPath);
  } else {
    ui.writeVerbose("Starting built-in proxy");
    server = createBuiltInProxyServer();
  }

  return server;
}

/**
 * @returns {ProxySettings}
 */
export function getProxySettings() {
  if (!server || !server.getServerPort()) {
    return {
      proxyUrl: null,
      caCertBundlePath: getCombinedCaBundlePath(null),
    };
  }

  const proxyUrl = `http://localhost:${server.getServerPort()}`;
  const caCert = server.getCaCert();
  const caCertBundlePath = getCombinedCaBundlePath(caCert);

  return {
    proxyUrl,
    caCertBundlePath,
  };
}

/**
 * @returns {Record<string, string>}
 */
function getSafeChainProxyEnvironmentVariables() {
  if (!server || !server.getServerPort()) {
    return {};
  }

  const proxySettings = getProxySettings();

  return {
    HTTPS_PROXY: proxySettings.proxyUrl ?? "",
    GLOBAL_AGENT_HTTP_PROXY: proxySettings.proxyUrl ?? "",
    NODE_EXTRA_CA_CERTS: proxySettings.caCertBundlePath,
  };
}

/**
 * @param {Record<string, string | undefined>} env
 *
 * @returns {Record<string, string>}
 */
export function mergeSafeChainProxyEnvironmentVariables(env) {
  const proxyEnv = getSafeChainProxyEnvironmentVariables();

  for (const key of Object.keys(env)) {
    // If we were to simply copy all env variables, we might overwrite
    // the proxy settings set by safe-chain when casing varies (e.g. http_proxy vs HTTP_PROXY)
    // So we only copy the variable if it's not already set in a different case
    const upperKey = key.toUpperCase();

    if (!proxyEnv[upperKey] && env[key]) {
      proxyEnv[key] = env[key];
    }
  }

  return proxyEnv;
}
