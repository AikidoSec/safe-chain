import { ui } from "../environment/userInteraction.js";
import { createRamaProxy, getRamaPath } from "./ramaProxy/createRamaProxy.js";
import { createBuiltInProxyServer } from "./builtInProxy/createBuiltInProxyServer.js";

/**
 * @typedef {Object} SafeChainProxy
 * @prop {() => Promise<void>} startServer
 * @prop {() => Promise<void>} stopServer
 * @prop {() => boolean} verifyNoMaliciousPackages
 * @prop {() => boolean} hasSuppressedVersions
 * @prop {() => Number | null} getServerPort
 * @prop {() => string} getCombinedCaBundlePath
 */

/** @type {SafeChainProxy} */
let server;

export function createSafeChainProxy() {
  if (server) {
    return server;
  }

  let ramaPath = getRamaPath();
  if (ramaPath) {
    ui.writeInformation("Starting safe-chain rama proxy");
    server = createRamaProxy(ramaPath);
  } else {
    server = createBuiltInProxyServer();
  }

  return server;
}

/**
 * @returns {Record<string, string>}
 */
function getSafeChainProxyEnvironmentVariables() {
  if (!server || !server.getServerPort()) {
    return {};
  }

  const proxyUrl = `http://localhost:${server.getServerPort()}`;
  const caCertPath = server.getCombinedCaBundlePath();

  return {
    HTTPS_PROXY: proxyUrl,
    GLOBAL_AGENT_HTTP_PROXY: proxyUrl,
    NODE_EXTRA_CA_CERTS: caCertPath,
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
