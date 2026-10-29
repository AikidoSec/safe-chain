import { describe, it } from "node:test";
import assert from "node:assert";
import zlib from "node:zlib";
import { decodeBody, supportedAcceptEncoding } from "./decodeBody.js";

describe("decodeBody", () => {
  const body = Buffer.from('{"name":"pkg"}');

  for (const [encoding, encode] of [
    ["gzip", zlib.gzipSync],
    ["x-gzip", zlib.gzipSync],
    ["br", zlib.brotliCompressSync],
    ["deflate", zlib.deflateSync],
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
});

describe("supportedAcceptEncoding", () => {
  it("keeps only offered encodings that can be decoded", () => {
    assert.strictEqual(
      supportedAcceptEncoding("gzip, deflate, br, zstd"),
      "gzip, deflate, br"
    );
  });

  it("keeps quality values on the encodings it keeps", () => {
    assert.strictEqual(
      supportedAcceptEncoding("zstd;q=1.0, br;q=0.9, gzip;q=0.5"),
      "br;q=0.9, gzip;q=0.5"
    );
  });

  it("falls back to identity when nothing offered can be decoded", () => {
    assert.strictEqual(supportedAcceptEncoding("zstd"), "identity");
    assert.strictEqual(supportedAcceptEncoding(undefined), "identity");
    assert.strictEqual(supportedAcceptEncoding("constructor"), "identity");
  });
});
