import { describe, it, after, before } from "node:test";
import assert from "node:assert";
import { getReportingServer } from "./reportingServer.js";

/**
 * Helper: POST JSON to a URL and return the response status code.
 * @param {string} url
 * @param {string} body
 * @returns {Promise<number>} HTTP status code
 */
async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  return res.status;
}

describe("reportingServer", () => {
  /** @type {ReturnType<typeof getReportingServer>} */
  let server;

  before(async () => {
    server = getReportingServer();
    await server.start();
  });

  after(async () => {
    await server.stop();
  });

  describe("start / getAddress", () => {
    it("returns a valid http://127.0.0.1:<port> address after starting", () => {
      const address = server.getAddress();
      assert.match(
        address,
        /^http:\/\/127\.0\.0\.1:\d+$/,
        "Address should be http://127.0.0.1:<port>",
      );
    });
  });

  describe("POST /events/block", () => {
    it("emits a blockReceived event with the parsed JSON body", async () => {
      const blockEvent = {
        ts_ms: Date.now(),
        artifact: {
          product: "npm",
          identifier: "malicious-pkg",
          version: "1.0.0",
        },
      };

      const eventPromise = new Promise((resolve) => {
        server.once("blockReceived", resolve);
      });

      const status = await postJson(
        `${server.getAddress()}/events/block`,
        JSON.stringify(blockEvent),
      );

      assert.strictEqual(status, 200);

      const received = await eventPromise;
      assert.deepStrictEqual(received, blockEvent);
    });
  });

  describe("non-matching routes", () => {
    it("returns 200 for GET requests but does not emit blockReceived", async () => {
      let emitted = false;
      const listener = () => {
        emitted = true;
      };
      server.on("blockReceived", listener);

      const res = await fetch(`${server.getAddress()}/other-route`);
      assert.strictEqual(res.status, 200);

      // Give a tick for any event to fire
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.strictEqual(emitted, false, "Should not emit blockReceived for non-matching routes");

      server.off("blockReceived", listener);
    });

    it("returns 200 for POST to a different path but does not emit blockReceived", async () => {
      let emitted = false;
      const listener = () => {
        emitted = true;
      };
      server.on("blockReceived", listener);

      const status = await postJson(
        `${server.getAddress()}/other-path`,
        JSON.stringify({ foo: "bar" }),
      );
      assert.strictEqual(status, 200);

      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.strictEqual(emitted, false, "Should not emit blockReceived for non-block paths");

      server.off("blockReceived", listener);
    });
  });
});

describe("reportingServer stop", () => {
  it("stops cleanly and frees the port", async () => {
    const server = getReportingServer();
    await server.start();
    const address = server.getAddress();
    assert.ok(address, "Server should have an address");

    await server.stop();

    // After stopping, the server should no longer accept connections
    try {
      await fetch(`${address}/events/block`);
      assert.fail("Should not be able to connect to stopped server");
    } catch (err) {
      // Expected: connection refused or similar
      assert.ok(err, "Fetch should throw after server stops");
    }
  });

  it("stop is safe to call when server was never started", async () => {
    const server = getReportingServer();
    // Should not throw
    await server.stop();
  });
});
