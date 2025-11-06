/**
 * @typedef {Object} RequestInterceptorBuilder
 * @property {string} targetUrl
 * @property {(statusCode: number, message: string) => void} blockRequest
 * @property {() => RequestInterceptor} build
 *
 * @typedef {Object} RequestInterceptor
 * @property {{statusCode: number, message: string} | undefined} blockResponse
 */

/**
 * @param {string} targetUrl
 * @returns {RequestInterceptorBuilder}
 */
export function createRequestInterceptorBuilder(targetUrl) {
  /** @type {{statusCode: number, message: string} | undefined}  */
  let blockResponse = undefined;

  return {
    targetUrl,
    blockRequest(statusCode, message) {
      blockResponse = { statusCode, message };
    },
    build() {
      return {
        blockResponse,
      };
    },
  };
}
