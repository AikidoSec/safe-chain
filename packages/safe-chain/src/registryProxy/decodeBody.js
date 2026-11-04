import { gunzip } from "zlib";
import { promisify } from "util";

// Guards against decompression bombs; the largest npm packuments are ~32MB.
export const MAX_DECODED_BODY_BYTES = 256 * 1024 * 1024;

const gunzipAsync = promisify(gunzip);

/**
 * @param {Buffer} buffer
 * @returns {Promise<Buffer>}
 */
function decodeGzip(buffer) {
  return gunzipAsync(buffer, { maxOutputLength: MAX_DECODED_BODY_BYTES });
}

/**
 * Only gzip: npm's br responses are no smaller, and each decoder is attack surface.
 * @type {Record<string, (buffer: Buffer) => Promise<Buffer>>}
 */
const decoders = {
  gzip: decodeGzip,
  "x-gzip": decodeGzip,
};

/**
 * Decodes a response body off the event loop.
 * @param {Buffer} body
 * @param {string | string[] | undefined} contentEncoding
 * @returns {Promise<Buffer>}
 */
export async function decodeBody(body, contentEncoding) {
  const encoding = String(contentEncoding ?? "identity").trim().toLowerCase();
  if (encoding === "identity" || encoding === "") {
    return body;
  }

  if (!Object.hasOwn(decoders, encoding)) {
    throw new Error(`Unsupported content-encoding: ${encoding}`);
  }

  return decoders[encoding](body);
}

/**
 * Narrows a client's Accept-Encoding to the offered encodings decodeBody supports.
 * @param {string | string[] | undefined} acceptEncoding
 * @returns {string}
 */
export function supportedAcceptEncoding(acceptEncoding) {
  const offered = String(acceptEncoding ?? "")
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
  const supported = offered.filter((token) =>
    Object.hasOwn(decoders, token.split(";")[0].trim().toLowerCase())
  );
  return supported.length > 0 ? supported.join(", ") : "identity";
}
