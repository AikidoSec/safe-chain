import {
  ECOSYSTEM_JS,
  ECOSYSTEM_PY,
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

  if (ecosystem === ECOSYSTEM_JS) {
    return npmInterceptorForUrl(url);
  }

  if (ecosystem === ECOSYSTEM_PY) {
    return pipInterceptorForUrl(url);
  }

  return undefined;
}
