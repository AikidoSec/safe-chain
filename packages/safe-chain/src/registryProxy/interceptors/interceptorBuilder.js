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
 * @property {(event: string, listener: (...args: any[]) => void) => Interceptor} on
 * @property {(event: string, ...args: any[]) => boolean} emit
 */

import { EventEmitter } from "events";
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
  const eventEmitter = new EventEmitter();

  return {
    async handleRequest(targetUrl) {
      const reqInterceptorBuilder = createRequestInterceptorBuilder(
        targetUrl,
        eventEmitter
      );

      for (const handler of requestHandlers) {
        await handler(reqInterceptorBuilder);
      }

      return reqInterceptorBuilder.build();
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
