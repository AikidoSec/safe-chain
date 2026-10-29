import { brotliDecompress, gunzip, inflate } from "zlib";
import { promisify } from "util";

/** @type {Record<string, (buffer: Buffer) => Promise<Buffer>>} */
const decoders = {
  gzip: promisify(gunzip),
  "x-gzip": promisify(gunzip),
  br: promisify(brotliDecompress),
  deflate: promisify(inflate),
};

/**
 * Decodes a response body on the libuv thread pool instead of the event loop.
 *
 * Registries pick the encoding per response from what the client offers: the
 * npm registry serves abbreviated metadata as br to clients that accept it,
 * and full metadata as gzip. Every encoding a client can negotiate has to be
 * handled here, otherwise the body reaches the interceptors still encoded.
 *
 * @param {Buffer} body
 * @param {string | string[] | undefined} contentEncoding
 * @returns {Promise<Buffer>}
 */
export async function decodeBody(body, contentEncoding) {
  const encoding = String(contentEncoding ?? "identity").trim().toLowerCase();
  if (encoding === "identity" || encoding === "") {
    return body;
  }

  const decode = decoders[encoding];
  if (!decode) {
    throw new Error(`Unsupported content-encoding: ${encoding}`);
  }

  return decode(body);
}
