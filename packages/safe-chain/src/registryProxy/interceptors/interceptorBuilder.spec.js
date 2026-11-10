import { describe, it } from "node:test";
import assert from "node:assert";
import { interceptRequests } from "./interceptorBuilder.js";

describe("interceptorBuilder response headers", () => {
  it("returns undefined when no header check is registered", async () => {
    const interceptor = interceptRequests(async () => {});
    const handler = await interceptor.handleRequest("https://example.com/package.whl");

    assert.equal(handler.checkResponseHeaders(200, {}), undefined);
  });

  it("returns 403 and emits minimumAgeRequestBlocked when the check blocks", async () => {
    const targetUrl = "https://example.com/package.whl";
    const headers = { "last-modified": "Thu, 01 Jan 2026 00:00:00 GMT" };
    const interceptor = interceptRequests(async (context) => {
      context.blockOnResponseHeaders((statusCode, responseHeaders) => {
        assert.equal(statusCode, 200);
        assert.equal(responseHeaders, headers);
        return { packageName: "example", version: "1.0.0", message: "Forbidden" };
      });
    });
    const events = [];
    interceptor.on("minimumAgeRequestBlocked", (event) => events.push(event));
    const handler = await interceptor.handleRequest(targetUrl);
    const before = Date.now();

    assert.deepEqual(handler.checkResponseHeaders(200, headers), {
      statusCode: 403,
      message: "Forbidden",
    });
    assert.equal(events.length, 1);
    assert.deepEqual(events[0], {
      packageName: "example",
      version: "1.0.0",
      targetUrl,
      timestamp: events[0].timestamp,
    });
    assert.ok(events[0].timestamp >= before && events[0].timestamp <= Date.now());
    assert.equal(handler.blockResponse, undefined);
  });

  it("returns undefined and emits no event when the check allows the response", async () => {
    const interceptor = interceptRequests(async (context) => {
      context.blockOnResponseHeaders(() => undefined);
    });
    const events = [];
    interceptor.on("minimumAgeRequestBlocked", (event) => events.push(event));
    const handler = await interceptor.handleRequest("https://example.com/package.whl");

    assert.equal(handler.checkResponseHeaders(200, {}), undefined);
    assert.deepEqual(events, []);
  });
});
