import { EventEmitter } from "events";

/**
 * @typedef {Object} Interceptor
 * @property {(targetUrl: string) => Promise<RequestInterceptionHandler>} handleRequest
 * @property {(event: string, listener: (...args: any[]) => void) => Interceptor} on
 * @property {(event: string, ...args: any[]) => boolean} emit
 *
 *
 * @typedef {Object} RequestInterceptionContext
 * @property {string} targetUrl
 * @property {(packageName: string | undefined, version: string | undefined) => void} blockMalware
 * @property {() => RequestInterceptionHandler} build
 *
 *
 * @typedef {Object} RequestInterceptionHandler
 * @property {{statusCode: number, message: string} | undefined} blockResponse
 */

/**
 * @param {(requestHandlerBuilder: RequestInterceptionContext) => Promise<void>} requestInterceptionFunc
 * @returns {Interceptor}
 */
export function interceptRequests(requestInterceptionFunc) {
  return buildInterceptor([requestInterceptionFunc]);
}

/**
 * @param {Array<(requestHandlerBuilder: RequestInterceptionContext) => Promise<void>>} requestHandlers
 * @returns {Interceptor}
 */
function buildInterceptor(requestHandlers) {
  const eventEmitter = new EventEmitter();

  return {
    async handleRequest(targetUrl) {
      const requestContext = createRequestContext(targetUrl, eventEmitter);

      for (const handler of requestHandlers) {
        await handler(requestContext);
      }

      return requestContext.build();
    },
    on(event, listener) {
      eventEmitter.on(event, listener);
      return this;
    },
    emit(event, ...args) {
      return eventEmitter.emit(event, ...args);
    },
  };
}

/**
 * @param {string} targetUrl
 * @param {import('events').EventEmitter} eventEmitter
 * @returns {RequestInterceptionContext}
 */
function createRequestContext(targetUrl, eventEmitter) {
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
   */
  function blockMalware(packageName, version) {
    blockRequest(403, "Forbidden - blocked by safe-chain");

    // Emit the malwareBlocked event
    eventEmitter.emit("malwareBlocked", {
      packageName,
      version,
      targetUrl,
      timestamp: Date.now(),
    });
  }

  return {
    targetUrl,
    blockMalware,
    build() {
      return {
        blockResponse,
      };
    },
  };
}
