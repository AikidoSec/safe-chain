import { before, after, describe, it } from "node:test";
import assert from "node:assert";
import net from "node:net";
import os from "node:os";
import {
  createSafeChainProxy,
  mergeSafeChainProxyEnvironmentVariables,
} from "./registryProxy.js";

describe("registryProxy loopback binding", () => {
  let proxy, proxyPort;

  before(async () => {
    proxy = createSafeChainProxy();
    await proxy.startServer();
    const envVars = mergeSafeChainProxyEnvironmentVariables([]);
    proxyPort = parseInt(new URL(envVars.HTTPS_PROXY).port, 10);
  });

  after(async () => {
    await proxy.stopServer();
  });

  it("advertises a loopback HTTPS_PROXY URL", () => {
    const envVars = mergeSafeChainProxyEnvironmentVariables([]);
    const hostname = new URL(envVars.HTTPS_PROXY).hostname;
    assert.ok(
      hostname === "127.0.0.1" || hostname === "::1" || hostname === "localhost",
      `expected loopback hostname, got ${hostname}`
    );
  });

  it("refuses connections on non-loopback interfaces", async () => {
    const externalAddrs = Object.values(os.networkInterfaces())
      .flat()
      .filter((iface) => iface && iface.family === "IPv4" && !iface.internal)
      .map((iface) => iface.address);

    if (externalAddrs.length === 0) {
      // No non-loopback interface available (e.g. locked-down CI) - skip.
      return;
    }

    for (const addr of externalAddrs) {
      await new Promise((resolve, reject) => {
        const sock = net.createConnection({ host: addr, port: proxyPort });
        const timer = setTimeout(() => {
          sock.destroy();
          resolve(); // Filtered / dropped is also fine - we just don't want success.
        }, 500);
        sock.once("connect", () => {
          clearTimeout(timer);
          sock.destroy();
          reject(
            new Error(
              `proxy accepted a connection on non-loopback ${addr}:${proxyPort}`
            )
          );
        });
        sock.once("error", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  });
});
