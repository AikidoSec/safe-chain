/**
 * @typedef {Object} RequestInterceptorBuilder
 * @property {string} targetUrl
 * @property {(statusCode: number, message: string) => void} blockRequest
 * @property {(packageName: string | undefined, version: string | undefined, url: string) => void} blockMalware
 * @property {(modificationFunc: (headers: NodeJS.Dict<string | string[]>) => void) => void} modifyRequestHeaders
 * @property {(requestFunc: (responseInterceptorBuilder: import('./responseInterceptorBuilder.js').ResponseInterceptorBuilder) => void) => void} modifyResponse
 * @property {() => RequestInterceptor} build
 *
 * @typedef {Object} RequestInterceptor
 * @property {{statusCode: number, message: string} | undefined} blockResponse
 * @property {(headers: NodeJS.Dict<string | string[]> | undefined) => void} modifyRequestHeaders
 * @property {() => import("./responseInterceptorBuilder.js").ResponseInterceptor} handleResponse
 * @property {() => boolean} modifiesResponse
 */

import { createResponseInterceptorBuilder } from "./responseInterceptorBuilder.js";

/**
 * @param {string} targetUrl
 * @param {import('events').EventEmitter} eventEmitter
 * @returns {RequestInterceptorBuilder}
 */
export function createRequestInterceptorBuilder(targetUrl, eventEmitter) {
  /** @type {{statusCode: number, message: string} | undefined}  */
  let blockResponse = undefined;
  /** @type {Array<(headers: NodeJS.Dict<string | string[]>) => void>} */
  let requestHeaderFuncs = [];
  /** @type {Array<(requestFunc: import('./responseInterceptorBuilder.js').ResponseInterceptorBuilder) => void>} */
  let responseModifierFuncs = [];

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
      requestHeaderFuncs.push(modificationFunc);
    },
    modifyResponse(modificationFunc) {
      responseModifierFuncs.push(modificationFunc);
    },
    build() {
      return createRequestInterceptor(
        blockResponse,
        requestHeaderFuncs,
        responseModifierFuncs
      );
    },
  };
}

/**
 * @param {{statusCode: number, message: string} | undefined} blockResponse
 * @param {Array<(headers: NodeJS.Dict<string | string[]>) => void>} requestHeadersModficationFuncs
 * @param {Array<(requestFunc: import('./responseInterceptorBuilder.js').ResponseInterceptorBuilder) => void>} responseModifierFuncs
 * @returns {RequestInterceptor}
 */
function createRequestInterceptor(
  blockResponse,
  requestHeadersModficationFuncs,
  responseModifierFuncs
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
    return responseModifierFuncs.length > 0;
  }

  function handleResponse() {
    const responseInterceptorBuilder = createResponseInterceptorBuilder();

    for (const func of responseModifierFuncs) {
      func(responseInterceptorBuilder);
    }

    return responseInterceptorBuilder.build();
  }

  return {
    blockResponse,
    modifyRequestHeaders,
    modifiesResponse,
    handleResponse,
  };
}
