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
 * @property {(modificationFunc: (headers: NodeJS.Dict<string | string[]>) => NodeJS.Dict<string | string[]>) => void} modifyRequestHeaders
 * @property {(modificationFunc: (body: Buffer, headers: NodeJS.Dict<string | string[]> | undefined) => Buffer) => void} modifyBody
 * @property {() => RequestInterceptionHandler} build
 *
 *
 * @typedef {Object} RequestInterceptionHandler
 * @property {{statusCode: number, message: string} | undefined} blockResponse
 * @property {(headers: NodeJS.Dict<string | string[]> | undefined) => NodeJS.Dict<string | string[]> | undefined} modifyRequestHeaders
 * @property {() => boolean} modifiesResponse
 * @property {(body: Buffer, headers: NodeJS.Dict<string | string[]> | undefined) => Buffer} modifyBody
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
  /** @type {Array<(headers: NodeJS.Dict<string | string[]>) => NodeJS.Dict<string | string[]>>} */
  let reqheaderModificationFuncs = [];
  /** @type {Array<(body: Buffer, headers: NodeJS.Dict<string | string[]> | undefined) => Buffer>} */
  let modifyBodyFuncs = [];

  /**
   * @param {string | undefined} packageName
   * @param {string | undefined} version
   */
  function blockMalwareSetup(packageName, version) {
    blockResponse = {
      statusCode: 403,
      message: "Forbidden - blocked by safe-chain",
    };

    // Emit the malwareBlocked event
    eventEmitter.emit("malwareBlocked", {
      packageName,
      version,
      targetUrl,
      timestamp: Date.now(),
    });
  }

  /** @returns {RequestInterceptionHandler} */
  function build() {
    /**
     * @param {NodeJS.Dict<string | string[]> | undefined} headers
     * @returns {NodeJS.Dict<string | string[]> | undefined}
     */
    function modifyRequestHeaders(headers) {
      if (headers) {
        for (const func of reqheaderModificationFuncs) {
          func(headers);
        }
      }

      return headers;
    }

    /**
     * @param {Buffer} body
     * @param {NodeJS.Dict<string | string[]> | undefined} headers
     * @returns {Buffer}
     */
    function modifyBody(body, headers) {
      let modifiedBody = body;

      for (var func of modifyBodyFuncs) {
        modifiedBody = func(body, headers);
      }

      return modifiedBody;
    }

    // These functions are invoked in the proxy, allowing to apply the configured modifications
    return {
      blockResponse,
      modifyRequestHeaders: modifyRequestHeaders,
      modifiesResponse: () => modifyBodyFuncs.length > 0,
      modifyBody,
    };
  }

  // These functions are used to setup the modifications
  return {
    targetUrl,
    blockMalware: blockMalwareSetup,
    modifyRequestHeaders: (func) => reqheaderModificationFuncs.push(func),
    modifyBody: (func) => modifyBodyFuncs.push(func),
    build,
  };
}
