import { describe, it } from "node:test";
import assert from "node:assert";
import zlib from "node:zlib";
import {
  decodeBody,
  supportedAcceptEncoding,
  MAX_DECODED_BODY_BYTES,
} from "./decodeBody.js";

describe("decodeBody", () => {
  const body = Buffer.from('{"name":"pkg"}');

  for (const [encoding, encode] of [
    ["gzip", zlib.gzipSync],
    ["x-gzip", zlib.gzipSync],
  ]) {
    it(`decodes ${encoding}`, async () => {
      const decoded = await decodeBody(encode(body), encoding);

      assert.strictEqual(decoded.toString(), body.toString());
    });
  }

  it("returns uncompressed bodies as the same buffer", async () => {
    assert.strictEqual(await decodeBody(body, undefined), body);
    assert.strictEqual(await decodeBody(body, "identity"), body);
  });

  it("rejects encodings it cannot decode, including inherited property names", async () => {
    await assert.rejects(decodeBody(body, "zstd"), /Unsupported/);
    await assert.rejects(decodeBody(body, "constructor"), /Unsupported/);
    await assert.rejects(decodeBody(body, "gzip, br"), /Unsupported/);
  });

  it("does not decode br or deflate", async () => {
    await assert.rejects(
      decodeBody(zlib.brotliCompressSync(body), "br"),
      /Unsupported/
    );
    await assert.rejects(
      decodeBody(zlib.deflateSync(body), "deflate"),
      /Unsupported/
    );
  });

  it("refuses to expand a body beyond the decoded size limit", async () => {
    // Concatenated gzip members: a tiny body that decodes past the limit.
    const oneMegabyte = 1024 * 1024;
    const member = zlib.gzipSync(Buffer.alloc(oneMegabyte));
    const bomb = Buffer.concat(
      Array(MAX_DECODED_BODY_BYTES / oneMegabyte + 1).fill(member)
    );

    await assert.rejects(decodeBody(bomb, "gzip"), {
      code: "ERR_BUFFER_TOO_LARGE",
    });
  });
});

describe("supportedAcceptEncoding", () => {
  it("keeps only offered encodings that can be decoded", () => {
    assert.strictEqual(
      supportedAcceptEncoding("gzip, deflate, br, zstd, x-gzip"),
      "gzip, x-gzip"
    );
  });

  it("keeps quality values on the encodings it keeps", () => {
    assert.strictEqual(
      supportedAcceptEncoding("zstd;q=1.0, br;q=0.9, gzip;q=0.5"),
      "gzip;q=0.5"
    );
  });

  it("falls back to identity when nothing offered can be decoded", () => {
    assert.strictEqual(supportedAcceptEncoding("zstd"), "identity");
    assert.strictEqual(supportedAcceptEncoding("br, deflate"), "identity");
    assert.strictEqual(supportedAcceptEncoding(undefined), "identity");
    assert.strictEqual(supportedAcceptEncoding("constructor"), "identity");
  });
});
