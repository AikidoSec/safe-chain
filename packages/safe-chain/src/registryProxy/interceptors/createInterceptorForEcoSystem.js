import {
  ECOSYSTEM_JS,
  ECOSYSTEM_PY,
  getEcoSystem,
} from "../../config/settings.js";
import { npmInterceptorForUrl } from "./npmInterceptor.js";
import { pipInterceptorForUrl } from "./pipInterceptor.js";

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

  // For agent mode or any other case, try both interceptors
  // The correct one will match based on the URL
  return npmInterceptorForUrl(url) || pipInterceptorForUrl(url);
}

