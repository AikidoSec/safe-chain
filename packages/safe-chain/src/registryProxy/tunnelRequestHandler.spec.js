import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import net from "node:net";

// Keep real TCP sockets, but retain the proxy's outgoing socket so errors can
// be injected deterministically without relying on an OS-dependent FIN race.
let serverSocket;
mock.module("net", {
  namedExports: {
    connect: (...args) => {
      serverSocket = net.connect(...args);
      return serverSocket;
    },
  },
});

const { tunnelRequest } = await import("./tunnelRequestHandler.js");
const { ui } = await import("../environment/userInteraction.js");

async function createTunnel(t, viaProxy, closeBeforeConnect = false) {
  const originalProxy = process.env.HTTPS_PROXY;
  const originalLowerProxy = process.env.https_proxy;
  delete process.env.HTTPS_PROXY;
  delete process.env.https_proxy;
  t.after(() => {
    if (originalProxy === undefined) delete process.env.HTTPS_PROXY;
    else process.env.HTTPS_PROXY = originalProxy;
    if (originalLowerProxy === undefined) delete process.env.https_proxy;
    else process.env.https_proxy = originalLowerProxy;
  });

  const errors = t.mock.method(ui, "writeError", () => {});
  const verbose = t.mock.method(ui, "writeVerbose", () => {});
  const sockets = new Set();
  const upstream = viaProxy
    ? http.createServer()
    : net.createServer({ allowHalfOpen: true });
  const proxy = http.createServer();
  for (const server of [upstream, proxy]) {
    server.on("connection", (socket) => {
      sockets.add(socket);
      socket.on("error", () => {});
    });
    t.after(async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
  }
  const upstreamConnection = once(upstream, viaProxy ? "connect" : "connection");
  if (viaProxy) {
    process.env.HTTPS_PROXY = `http://proxy-user:proxy-secret@127.0.0.1:${upstream.address().port}`;
    upstream.on("connect", (_req, socket) => {
      if (closeBeforeConnect) socket.end();
      else socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    });
  }
  proxy.on("connect", tunnelRequest);

  const client = net.connect({
    host: "127.0.0.1",
    port: proxy.address().port,
    allowHalfOpen: true,
  });
  sockets.add(client);
  // A reset is acceptable; these tests assert the bytes and socket lifecycle.
  client.on("error", () => {});
  await once(client, "connect");
  const response = once(client, "data");
  client.write(
    `CONNECT 127.0.0.1:${upstream.address().port} HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n`
  );
  const connection = await upstreamConnection;
  const remote = viaProxy ? connection[1] : connection[0];
  remote.on("end", () => remote.end());
  assert.equal(
    (await response)[0].toString(),
    closeBeforeConnect
      ? "HTTP/1.1 502 Bad Gateway\r\n\r\n"
      : "HTTP/1.1 200 Connection Established\r\n\r\n"
  );
  const chunks = [];
  client.on("data", (chunk) => chunks.push(chunk));
  // Track both ends before triggering errors (once() rejects on 'error').
  const clientClosed = new Promise((resolve) => client.once("close", resolve));
  const remoteClosed = new Promise((resolve) => remote.once("close", resolve));
  return {
    client,
    remote,
    outgoing: serverSocket,
    errors,
    verbose,
    chunks,
    clientClosed,
    remoteClosed,
  };
}

for (const viaProxy of [false, true]) {
  describe(`tunnelRequest ${viaProxy ? "via proxy" : "direct"}`, () => {
    if (viaProxy) {
      it("returns 502 when the proxy sends FIN before replying to CONNECT", { timeout: 3000 }, async (t) => {
        const { client, outgoing, errors, clientClosed, remoteClosed } =
          await createTunnel(t, true, true);
        client.on("end", () => client.end());
        await Promise.all([clientClosed, remoteClosed]);
        assert.equal(outgoing.destroyed, true);
        assert.equal(errors.mock.callCount(), 1);
        assert.match(
          errors.mock.calls[0].arguments[0],
          /proxy closed connection before completing CONNECT/
        );
      });
    }

    it("does not inject HTTP errors into an established tunnel", { timeout: 3000 }, async (t) => {
      const { client, outgoing, errors, verbose, chunks, clientClosed, remoteClosed } =
        await createTunnel(t, viaProxy);
      const clientEnded = once(client, "end");
      const error = new Error("This socket has been ended by the other party");
      error.code = "EPIPE";
      outgoing.destroy(error);
      await clientEnded;
      assert.equal(Buffer.concat(chunks).length, 0);
      assert.equal(errors.mock.callCount(), 0);
      client.destroy();
      await Promise.all([clientClosed, remoteClosed]);
      const messages = verbose.mock.calls.map((call) => call.arguments[0]);
      const opening = messages.find((message) => message.endsWith("opening"));
      const id = opening.match(/tunnel #\d+/)[0];
      assert.ok(messages.some((message) =>
        message.includes(`${id} `) && message.includes("established after")
      ));
      assert.ok(messages.every((message) =>
        !message.includes("proxy-user") && !message.includes("proxy-secret")
      ));
      const summary = messages.filter((message) =>
        message.includes(`${id} `) && message.includes("closed after")
      );
      assert.equal(summary.length, 1);
      assert.ok(summary[0].includes(id));
      assert.match(summary[0], /established=true/);
      assert.ok(messages.some((message) =>
        message.includes(`${id} `) && message.includes("EPIPE (This socket has been ended by the other party)")
      ));
      assert.ok(summary[0].includes(viaProxy ? "(proxy 127.0.0.1:" : "(direct)"));
    });

    it("forwards a clean upstream FIN without losing data or late client writes", { timeout: 3000 }, async (t) => {
      const { client, remote, outgoing, errors, verbose, chunks, clientClosed, remoteClosed } =
        await createTunnel(t, viaProxy);
      const clientEnded = once(client, "end");
      remote.end("upstream response");
      await clientEnded;
      assert.equal(Buffer.concat(chunks).toString(), "upstream response");
      const lateData = once(remote, "data");
      client.end("late client data");
      assert.equal((await lateData)[0].toString(), "late client data");
      await Promise.all([clientClosed, remoteClosed]);
      assert.equal(errors.mock.callCount(), 0);
      const summary = verbose.mock.calls
        .map((call) => call.arguments[0])
        .find((message) => message.includes("closed after"));
      const id = summary.match(/tunnel #\d+/)[0];
      assert.ok(verbose.mock.calls.some((call) =>
        call.arguments[0].includes(`${id} `) && call.arguments[0].endsWith("upstream FIN")
      ));
      assert.ok(summary.includes(`TCP bytes up=${outgoing.bytesWritten} down=${outgoing.bytesRead}`));
      assert.ok(outgoing.bytesWritten >= Buffer.byteLength("late client data"));
      assert.ok(outgoing.bytesRead >= Buffer.byteLength("upstream response"));
    });

    it("cleans up the upstream when the client disconnects", { timeout: 3000 }, async (t) => {
      const { client, clientClosed, remoteClosed } = await createTunnel(t, viaProxy);
      client.destroy();
      await Promise.all([clientClosed, remoteClosed]);
    });

    it("handles an upstream TCP reset without injecting HTTP bytes", { timeout: 3000 }, async (t) => {
      const { client, remote, outgoing, errors, chunks, clientClosed, remoteClosed } =
        await createTunnel(t, viaProxy);
      client.on("end", () => client.end());
      remote.resetAndDestroy();
      await Promise.all([clientClosed, remoteClosed]);
      assert.equal(Buffer.concat(chunks).length, 0);
      assert.equal(outgoing.destroyed, true);
      assert.equal(errors.mock.callCount(), 0);
    });
  });
}
