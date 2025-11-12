/**
 * @typedef {Object} ResponseInterceptorBuilder
 * @property {() => ResponseInterceptor} build
 * @property {(modificationFunc: (body: Buffer) => Buffer) => void} modifyBody
 *
 * @typedef {Object} ResponseInterceptor
 * @property {(buffer: Buffer) => Buffer} modifyBody
 */

/**
 * @returns {ResponseInterceptorBuilder}
 */
export function createResponseInterceptorBuilder() {
  /** @type {Array<(body: Buffer) => Buffer>} */
  let modifyBodyFuncs = [];

  return {
    modifyBody: (func) => modifyBodyFuncs.push(func),
    build: () => createResponseInterceptor(modifyBodyFuncs),
  };
}

/**
 * @returns {ResponseInterceptor}
 * @param {Array<(body: Buffer) => Buffer>} modifyBodyFuncs
 */
function createResponseInterceptor(modifyBodyFuncs) {
  /**
   * @param {Buffer} body
   * @returns {Buffer}
   */
  function modifyBody(body) {
    let modifiedBody = body;

    for (var func of modifyBodyFuncs) {
      modifiedBody = func(body);
    }

    return modifiedBody;
  }

  return { modifyBody };
}
