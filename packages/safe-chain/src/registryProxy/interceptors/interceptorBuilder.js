/**
 * @typedef {import('./requestInterceptorBuilder.js').RequestInterceptorBuilder} RequestInterceptorBuilder
 * @typedef {import('./requestInterceptorBuilder.js').RequestInterceptor} RequestInterceptor
 *
 * @typedef {Object} InterceptorBuilder
 * @property {(requestFunc: (requestHandlerBuilder: RequestInterceptorBuilder) => Promise<void>) => void} onRequest
 * @property {() => Interceptor} build
 *
 * @typedef {Object} Interceptor
 * @property {(targetUrl: string) => Promise<RequestInterceptor>} handleRequest
 */

import { createRequestInterceptorBuilder } from "./requestInterceptorBuilder.js";

/**
 * @returns {InterceptorBuilder}
 */
export function createInterceptorBuilder() {
  /**
   * @type {Array<(requestHandlerBuilder: RequestInterceptorBuilder) => Promise<void>>}
   */
  const requestHandlers = [];

  return {
    onRequest(requestFunc) {
      requestHandlers.push(requestFunc);
    },
    build() {
      return buildInterceptor(requestHandlers);
    },
  };
}

/**
 * @param {Array<(requestHandlerBuilder: RequestInterceptorBuilder) => Promise<void>>} requestHandlers
 * @returns {Interceptor}
 */
function buildInterceptor(requestHandlers) {
  return {
    async handleRequest(targetUrl) {
      const reqInterceptorBuilder = createRequestInterceptorBuilder(targetUrl);

      for (const handler of requestHandlers) {
        await handler(reqInterceptorBuilder);
      }

      return reqInterceptorBuilder.build();
    },
  };
}
