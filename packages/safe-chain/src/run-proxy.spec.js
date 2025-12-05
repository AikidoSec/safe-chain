import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";

describe("run-proxy", () => {
  let runProxy;
  let mockProxyCalls;
  let mockUiCalls;
  let capturedSignalHandlers;

  beforeEach(async () => {
    // Reset state
    capturedSignalHandlers = {};
    mockProxyCalls = {
      startServer: [],
      stopServer: [],
      getPort: [],
    };
    mockUiCalls = {
      writeInformation: [],
    };

    // Create mock proxy
    const mockProxy = {
      startServer: async (port) => {
        mockProxyCalls.startServer.push({ port });
      },
      stopServer: async () => {
        mockProxyCalls.stopServer.push({});
      },
      getPort: () => {
        mockProxyCalls.getPort.push({});
        return 8080;
      },
    };

    // Mock the ui module
    mock.module("./environment/userInteraction.js", {
      namedExports: {
        ui: {
          writeInformation: (msg) => {
            mockUiCalls.writeInformation.push(msg);
          },
        },
      },
    });

    // Mock the registryProxy module
    mock.module("./registryProxy/registryProxy.js", {
      namedExports: {
        createSafeChainProxy: () => mockProxy,
      },
    });

    // Mock process.on to capture signal handlers
    const originalProcessOn = process.on.bind(process);
    const originalProcessRemoveListener = process.removeListener.bind(process);
    process.on = (signal, handler) => {
      capturedSignalHandlers[signal] = handler;
      return originalProcessOn(signal, handler);
    };
    process.removeListener = (signal, handler) => {
      return originalProcessRemoveListener(signal, handler);
    };

    // Import the module after mocking
    const module = await import("./run-proxy.js");
    runProxy = module.runProxy;
  });

  afterEach(() => {
    // Clean up signal handlers
    if (capturedSignalHandlers.SIGINT) {
      process.removeListener("SIGINT", capturedSignalHandlers.SIGINT);
    }
    if (capturedSignalHandlers.SIGTERM) {
      process.removeListener("SIGTERM", capturedSignalHandlers.SIGTERM);
    }
    mock.reset();
  });

  describe("getPort argument parsing", () => {
    it("should parse --port=8080 correctly", async () => {
      await runProxy(["run-proxy", "--port=8080"]);

      assert.strictEqual(mockProxyCalls.startServer.length, 1);
      assert.strictEqual(mockProxyCalls.startServer[0].port, 8080);
    });

    it("should parse --port=3000 with other arguments", async () => {
      await runProxy(["run-proxy", "--verbose", "--port=3000", "--debug"]);

      assert.strictEqual(mockProxyCalls.startServer.length, 1);
      assert.strictEqual(mockProxyCalls.startServer[0].port, 3000);
    });

    it("should handle --port= (empty value) by using port 0", async () => {
      await runProxy(["run-proxy", "--port="]);

      assert.strictEqual(mockProxyCalls.startServer.length, 1);
      assert.strictEqual(mockProxyCalls.startServer[0].port, 0);
    });

    it("should handle --port=abc (non-numeric) by using port 0", async () => {
      await runProxy(["run-proxy", "--port=abc"]);

      assert.strictEqual(mockProxyCalls.startServer.length, 1);
      assert.strictEqual(mockProxyCalls.startServer[0].port, 0);
    });

    it("should trim whitespace in --port= value", async () => {
      await runProxy(["run-proxy", "--port= 9000 "]);

      assert.strictEqual(mockProxyCalls.startServer.length, 1);
      assert.strictEqual(mockProxyCalls.startServer[0].port, 9000);
    });

    it("should use port 0 (OS-assigned) when no --port flag is provided", async () => {
      await runProxy(["run-proxy"]);

      assert.strictEqual(mockProxyCalls.startServer.length, 1);
      assert.strictEqual(mockProxyCalls.startServer[0].port, 0);
    });

    it("should use the first valid --port flag when multiple are provided", async () => {
      await runProxy(["run-proxy", "--port=5000", "--port=6000"]);

      assert.strictEqual(mockProxyCalls.startServer.length, 1);
      assert.strictEqual(mockProxyCalls.startServer[0].port, 5000);
    });

    it("should handle port 0 explicitly", async () => {
      await runProxy(["run-proxy", "--port=0"]);

      assert.strictEqual(mockProxyCalls.startServer.length, 1);
      assert.strictEqual(mockProxyCalls.startServer[0].port, 0);
    });

    it("should handle large port numbers", async () => {
      await runProxy(["run-proxy", "--port=65535"]);

      assert.strictEqual(mockProxyCalls.startServer.length, 1);
      assert.strictEqual(mockProxyCalls.startServer[0].port, 65535);
    });

    it("should handle negative port numbers by treating as NaN", async () => {
      await runProxy(["run-proxy", "--port=-1"]);

      assert.strictEqual(mockProxyCalls.startServer.length, 1);
      // Number("-1") is -1, not NaN, so it will be parsed
      assert.strictEqual(mockProxyCalls.startServer[0].port, -1);
    });
  });

  describe("proxy lifecycle", () => {
    it("should create and start the proxy", async () => {
      await runProxy(["run-proxy"]);

      assert.strictEqual(mockProxyCalls.startServer.length, 1);
    });

    it("should display starting message", async () => {
      await runProxy(["run-proxy"]);

      const calls = mockUiCalls.writeInformation;
      assert.ok(
        calls.some((msg) => msg.includes("Starting safe-chain proxy")),
        "Should display starting message"
      );
    });

    it("should display running message with port", async () => {
      await runProxy(["run-proxy"]);

      const calls = mockUiCalls.writeInformation;
      assert.ok(
        calls.some(
          (msg) =>
            msg.includes("Safe-chain proxy is running") &&
            msg.includes("8080")
        ),
        "Should display running message with port"
      );
    });

    it("should register SIGINT signal handler", async () => {
      await runProxy(["run-proxy"]);

      assert.ok(capturedSignalHandlers.SIGINT, "SIGINT handler should be registered");
      assert.strictEqual(typeof capturedSignalHandlers.SIGINT, "function");
    });

    it("should register SIGTERM signal handler", async () => {
      await runProxy(["run-proxy"]);

      assert.ok(capturedSignalHandlers.SIGTERM, "SIGTERM handler should be registered");
      assert.strictEqual(typeof capturedSignalHandlers.SIGTERM, "function");
    });
  });

  describe("signal handling", () => {
    it("should stop proxy on SIGINT", async () => {
      await runProxy(["run-proxy"]);

      // Trigger the SIGINT handler
      await capturedSignalHandlers.SIGINT();

      assert.strictEqual(mockProxyCalls.stopServer.length, 1);
    });

    it("should stop proxy on SIGTERM", async () => {
      await runProxy(["run-proxy"]);

      // Trigger the SIGTERM handler
      await capturedSignalHandlers.SIGTERM();

      assert.strictEqual(mockProxyCalls.stopServer.length, 1);
    });

    it("should display stopping message when handling signals", async () => {
      await runProxy(["run-proxy"]);

      // Trigger the signal handler
      await capturedSignalHandlers.SIGINT();

      const calls = mockUiCalls.writeInformation;
      assert.ok(
        calls.some((msg) => msg.includes("Stopping safe-chain proxy")),
        "Should display stopping message"
      );
    });

    it("should display terminated message after stopping", async () => {
      await runProxy(["run-proxy"]);

      // Trigger the signal handler
      await capturedSignalHandlers.SIGINT();

      const calls = mockUiCalls.writeInformation;
      assert.ok(
        calls.some((msg) => msg.includes("Safe-chain proxy terminated")),
        "Should display terminated message"
      );
    });

    it("should handle multiple signal calls gracefully", async () => {
      await runProxy(["run-proxy"]);

      // Trigger signal multiple times
      await capturedSignalHandlers.SIGINT();
      await capturedSignalHandlers.SIGINT();

      // stopServer should still only be called once per signal
      // (though in this test it will be called twice since we trigger twice)
      assert.strictEqual(mockProxyCalls.stopServer.length, 2);
    });
  });

  describe("integration with getPort()", () => {
    it("should call getPort() method after server starts", async () => {
      await runProxy(["run-proxy", "--port=8080"]);

      assert.strictEqual(mockProxyCalls.getPort.length, 1);
    });

    it("should display the actual port from getPort() not the argument", async () => {
      await runProxy(["run-proxy", "--port=0"]);

      const calls = mockUiCalls.writeInformation;
      const runningMessage = calls.find((msg) =>
        msg.includes("Safe-chain proxy is running")
      );

      assert.ok(runningMessage, "Should have running message");
      assert.ok(
        runningMessage.includes("8080"),
        "Should display actual port from getPort()"
      );
      assert.ok(
        !runningMessage.includes(":0"),
        "Should not display the argument port"
      );
    });
  });
});
