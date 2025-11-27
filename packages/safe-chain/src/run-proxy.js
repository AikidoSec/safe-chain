import { ui } from "./environment/userInteraction.js";
import { createSafeChainProxy } from "./registryProxy/registryProxy.js";

/** @type {import("./registryProxy/registryProxy.js").safeChainProxy} */
let proxy;

/**
 * @param {string[]} args
 */
export async function runProxy(args) {
  ui.writeInformation("Starting safe-chain proxy...");
  proxy = createSafeChainProxy();
  const port = getPort(args);
  await proxy.startServer(port);

  process.on("SIGINT", stopProxy);
  process.on("SIGTERM", stopProxy);

  ui.writeInformation(
    `Safe-chain proxy is running: http://127.0.0.1:${proxy.getPort()}`
  );
}

async function stopProxy() {
  if (proxy) {
    ui.writeInformation("Stopping safe-chain proxy...");
    await proxy.stopServer();
    ui.writeInformation("Safe-chain proxy terminated");
  }
}

/**
 * @param {string[]} args
 * @returns {number}
 */
function getPort(args) {
  for (const arg of args) {
    if (!arg.startsWith("--port=")) {
      continue;
    }

    const argValue = arg.substring(7).trim();
    if (!argValue) {
      continue;
    }

    const port = Number(argValue);
    if (Number.isNaN(port)) {
      continue;
    }

    return port;
  }

  return 0;
}
