/**
 * @typedef {Object} RequestInterceptorBuilder
 * @property {string} targetUrl
 * @property {(statusCode: number, message: string) => void} blockRequest
 * @property {(packageName: string | undefined, version: string | undefined, url: string) => void} blockMalware
 * @property {(modificationFunc: (headers: NodeJS.Dict<string | string[]>) => void) => void} modifyRequestHeaders
 * @property {() => RequestInterceptor} build
 *
 * @typedef {Object} RequestInterceptor
 * @property {{statusCode: number, message: string} | undefined} blockResponse
 * @property {(headers: NodeJS.Dict<string | string[]> | undefined) => void} modifyRequestHeaders
 * @property {() => boolean} modifiesResponse
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
   * @type {{
   *   requestHeaders: Array<(headers: NodeJS.Dict<string | string[]>) => void>
   * }}
   */
  let modificationFuncs = {
    requestHeaders: [],
  };

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
    modifyRequestHeaders(modificationFunc) {
      modificationFuncs.requestHeaders.push(modificationFunc);
    },
    build() {
      return createRequestInterceptor(
        blockResponse,
        modificationFuncs.requestHeaders
      );
    },
  };
}

/**
 * @param {{statusCode: number, message: string} | undefined} blockResponse
 * @param {Array<(headers: NodeJS.Dict<string | string[]>) => void>} requestHeadersModficationFuncs
 * @returns {RequestInterceptor}
 */
function createRequestInterceptor(
  blockResponse,
  requestHeadersModficationFuncs
) {
  /**
   * @param {NodeJS.Dict<string | string[]> | undefined} headers
   */
  function modifyRequestHeaders(headers) {
    if (!headers) {
      return;
    }

    for (const modificationFunc of requestHeadersModficationFuncs) {
      modificationFunc(headers);
    }
  }

  function modifiesResponse() {
    return false;
  }

  return { blockResponse, modifyRequestHeaders, modifiesResponse };
}
