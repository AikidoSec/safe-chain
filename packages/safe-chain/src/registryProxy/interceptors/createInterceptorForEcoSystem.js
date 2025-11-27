import {
  ECOSYSTEM_JS,
  ECOSYSTEM_PY,
  ECOSYSTEM_ALL,
  getEcoSystem,
} from "../../config/settings.js";
import { npmInterceptorForUrl } from "./npm/npmInterceptor.js";
import { pipInterceptorForUrl } from "./pipInterceptor.js";

/**
 * @param {string} url
 * @returns {import("./interceptorBuilder.js").Interceptor | undefined}
 */
export function createInterceptorForUrl(url) {
  const ecosystem = getEcoSystem();

  if (ecosystem === ECOSYSTEM_ALL) {
    // Try both ecosystems (npm registries first, then PyPI)
    const jsInterceptor = npmInterceptorForUrl(url);
    if (jsInterceptor) {
      return jsInterceptor;
    }
    
    const pyInterceptor = pipInterceptorForUrl(url);
    if (pyInterceptor) {
      return pyInterceptor;
    }
    
    return undefined;
  }

  if (ecosystem === ECOSYSTEM_JS) {
    return npmInterceptorForUrl(url);
  }

  if (ecosystem === ECOSYSTEM_PY) {
    return pipInterceptorForUrl(url);
  }

  return undefined;
}
