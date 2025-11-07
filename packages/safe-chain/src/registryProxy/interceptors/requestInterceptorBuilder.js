/**
 * @typedef {Object} RequestInterceptorBuilder
 * @property {string} targetUrl
 * @property {(statusCode: number, message: string) => void} blockRequest
 * @property {(packageName: string | undefined, version: string | undefined, url: string) => void} blockMalware
 * @property {() => RequestInterceptor} build
 *
 * @typedef {Object} RequestInterceptor
 * @property {{statusCode: number, message: string} | undefined} blockResponse
 */

/**
 * @param {string} targetUrl
 * @param {import('events').EventEmitter} eventEmitter
 * @returns {RequestInterceptorBuilder}
 */
export function createRequestInterceptorBuilder(targetUrl, eventEmitter) {
  /** @type {{statusCode: number, message: string} | undefined}  */
  let blockResponse = undefined;

  /**
   * @param {number} statusCode
   * @param {string} message
   */
  function blockRequest(statusCode, message) {
    blockResponse = { statusCode, message };
  }

  /**
   * @param {string | undefined} packageName
   * @param {string | undefined} version
   * @param {string} url
   */
  function blockMalware(packageName, version, url) {
    blockRequest(403, "Forbidden - blocked by safe-chain");

    // Emit the malwareBlocked event
    eventEmitter.emit("malwareBlocked", {
      packageName,
      version,
      url,
      timestamp: Date.now(),
    });
  }

  return {
    targetUrl,
    blockRequest,
    blockMalware,
    build() {
      return {
        blockResponse,
      };
    },
  };
}
