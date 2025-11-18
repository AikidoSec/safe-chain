import { after, describe, it } from "node:test";
import assert from "node:assert";
import { StandaloneProxyService } from "./standaloneProxy.js";

describe("StandaloneProxyService", () => {
  describe("constructor", () => {
    it("should create service with default options", () => {
      const service = new StandaloneProxyService();

      assert.strictEqual(service.isProxyRunning(), false);
      assert.strictEqual(service.options.autoVerify, false);
      assert.strictEqual(service.options.keepAlive, true);

      // Note: No cleanup needed - service not started
    });

    it("should create service with custom options", () => {
      const onMalwareDetected = () => {};
      const service = new StandaloneProxyService({
        onMalwareDetected,
        autoVerify: true,
        keepAlive: false,
      });

      assert.strictEqual(service.options.onMalwareDetected, onMalwareDetected);
      assert.strictEqual(service.options.autoVerify, true);
      assert.strictEqual(service.options.keepAlive, false);
    });
  });

  describe("start", () => {
    let service;

    after(async () => {
      try {
        if (service && service.isProxyRunning()) {
          await service.stop();
        }
      } catch {
        // Ignore cleanup errors
      }
    });

    it("should start the proxy server and return info", async () => {
      service = new StandaloneProxyService({ keepAlive: false });

      const info = await service.start();

      assert.ok(info.port, "Should have a port");
      assert.strictEqual(typeof info.port, "number");
      assert.ok(info.port > 0, "Port should be positive");

      assert.ok(info.url, "Should have a URL");
      assert.strictEqual(info.url, `http://localhost:${info.port}`);

      assert.ok(info.environmentVariables, "Should have environment variables");
      assert.ok(
        info.environmentVariables.HTTPS_PROXY,
        "Should have HTTPS_PROXY"
      );
      assert.ok(
        info.environmentVariables.NODE_EXTRA_CA_CERTS,
        "Should have NODE_EXTRA_CA_CERTS"
      );

      assert.strictEqual(service.isProxyRunning(), true);
    });

    it("should throw error if already running", async () => {
      service = new StandaloneProxyService({ keepAlive: false });
      await service.start();

      await assert.rejects(
        async () => {
          await service.start();
        },
        {
          message: "Proxy is already running",
        }
      );
    });

    it("should emit started event", async () => {
      service = new StandaloneProxyService({ keepAlive: false });

      let startedEvent = null;
      service.on("started", (event) => {
        startedEvent = event;
      });

      const info = await service.start();

      assert.ok(startedEvent, "Should emit started event");
      assert.strictEqual(startedEvent.port, info.port);
      assert.strictEqual(startedEvent.url, info.url);
      assert.deepStrictEqual(
        startedEvent.environmentVariables,
        info.environmentVariables
      );
    });
  });

  describe("stop", () => {
    let service;

    after(async () => {
      try {
        if (service && service.isProxyRunning()) {
          await service.stop();
        }
      } catch {
        // Ignore cleanup errors
      }
    });

    it("should stop the proxy server", async () => {
      service = new StandaloneProxyService({ keepAlive: false });
      await service.start();

      const result = await service.stop();

      assert.ok(result, "Should return result");
      assert.ok(Array.isArray(result.blockedPackages));
      assert.strictEqual(service.isProxyRunning(), false);
    });

    it("should throw error if not running", async () => {
      service = new StandaloneProxyService({ keepAlive: false });

      await assert.rejects(
        async () => {
          await service.stop();
        },
        {
          message: "Proxy is not running",
        }
      );
    });

    it("should emit stopped event", async () => {
      service = new StandaloneProxyService({ keepAlive: false });
      await service.start();

      let stoppedEvent = null;
      service.on("stopped", (event) => {
        stoppedEvent = event;
      });

      const result = await service.stop();

      assert.ok(stoppedEvent, "Should emit stopped event");
      assert.deepStrictEqual(
        stoppedEvent.blockedPackages,
        result.blockedPackages
      );
    });

    it("should return blocked packages", async () => {
      service = new StandaloneProxyService({ keepAlive: false });
      await service.start();

      const result = await service.stop();

      assert.ok(Array.isArray(result.blockedPackages));
      // Initially should be empty as no packages were blocked
      assert.strictEqual(result.blockedPackages.length, 0);
    });
  });

  describe("getInfo", () => {
    let service;

    after(async () => {
      try {
        if (service && service.isProxyRunning()) {
          await service.stop();
        }
      } catch {
        // Ignore cleanup errors
      }
    });

    it("should return null when not running", () => {
      service = new StandaloneProxyService({ keepAlive: false });

      const info = service.getInfo();

      assert.strictEqual(info, null);
    });

    it("should return proxy info when running", async () => {
      service = new StandaloneProxyService({ keepAlive: false });
      const startInfo = await service.start();

      const info = service.getInfo();

      assert.ok(info, "Should return info");
      assert.strictEqual(info.port, startInfo.port);
      assert.strictEqual(info.url, startInfo.url);
      assert.deepStrictEqual(
        info.environmentVariables,
        startInfo.environmentVariables
      );
    });
  });

  describe("getBlockedRequests", () => {
    let service;

    after(async () => {
      try {
        if (service && service.isProxyRunning()) {
          await service.stop();
        }
      } catch {
        // Ignore cleanup errors
      }
    });

    it("should return empty array when proxy not created", () => {
      service = new StandaloneProxyService({ keepAlive: false });

      const blocked = service.getBlockedRequests();

      assert.ok(Array.isArray(blocked));
      assert.strictEqual(blocked.length, 0);
    });

    it("should return blocked requests when proxy is running", async () => {
      service = new StandaloneProxyService({ keepAlive: false });
      await service.start();

      const blocked = service.getBlockedRequests();

      assert.ok(Array.isArray(blocked));
      // Should be empty initially
      assert.strictEqual(blocked.length, 0);
    });
  });

  describe("isProxyRunning", () => {
    let service;

    after(async () => {
      try {
        if (service && service.isProxyRunning()) {
          await service.stop();
        }
      } catch {
        // Ignore cleanup errors
      }
    });

    it("should return false when not started", () => {
      service = new StandaloneProxyService({ keepAlive: false });

      assert.strictEqual(service.isProxyRunning(), false);
    });

    it("should return true when running", async () => {
      service = new StandaloneProxyService({ keepAlive: false });
      await service.start();

      assert.strictEqual(service.isProxyRunning(), true);
    });

    it("should return false after stopped", async () => {
      service = new StandaloneProxyService({ keepAlive: false });
      await service.start();
      await service.stop();

      assert.strictEqual(service.isProxyRunning(), false);
    });
  });

  describe("restart", () => {
    let service;

    after(async () => {
      try {
        if (service && service.isProxyRunning()) {
          await service.stop();
        }
      } catch {
        // Ignore cleanup errors
      }
    });

    it("should start proxy if not running", async () => {
      service = new StandaloneProxyService({ keepAlive: false });

      const info = await service.restart();

      assert.ok(info, "Should return info");
      assert.ok(info.port, "Should have a port");
      assert.strictEqual(service.isProxyRunning(), true);
    });

    it("should restart proxy if already running", async () => {
      service = new StandaloneProxyService({ keepAlive: false });
      await service.start();

      const newInfo = await service.restart();

      assert.ok(newInfo, "Should return new info");
      assert.ok(newInfo.port, "Should have a port");
      assert.strictEqual(service.isProxyRunning(), true);

      // Port might be different after restart
      assert.strictEqual(typeof newInfo.port, "number");
    });

    it("should emit stopped and started events on restart", async () => {
      service = new StandaloneProxyService({ keepAlive: false });
      await service.start();

      let stoppedEmitted = false;
      let startedEmitted = false;

      service.on("stopped", () => {
        stoppedEmitted = true;
      });

      service.on("started", () => {
        startedEmitted = true;
      });

      await service.restart();

      assert.strictEqual(stoppedEmitted, true, "Should emit stopped event");
      assert.strictEqual(startedEmitted, true, "Should emit started event");
    });
  });

  describe("lifecycle events", () => {
    let service;

    after(async () => {
      try {
        if (service && service.isProxyRunning()) {
          await service.stop();
        }
      } catch {
        // Ignore cleanup errors
      }
    });

    it("should support event emitter pattern", async () => {
      service = new StandaloneProxyService({ keepAlive: false });

      const events = [];

      service.on("started", (data) => {
        events.push({ type: "started", data });
      });

      service.on("stopped", (data) => {
        events.push({ type: "stopped", data });
      });

      await service.start();
      await service.stop();

      assert.strictEqual(events.length, 2);
      assert.strictEqual(events[0].type, "started");
      assert.strictEqual(events[1].type, "stopped");
    });
  });

  describe("multiple instances", () => {
    const services = [];

    after(async () => {
      try {
        for (const service of services) {
          if (service.isProxyRunning()) {
            await service.stop();
          }
        }
      } catch {
        // Ignore cleanup errors
      }
    });

    it("should allow multiple proxy instances on different ports", async () => {
      const service1 = new StandaloneProxyService({ keepAlive: false });
      const service2 = new StandaloneProxyService({ keepAlive: false });
      services.push(service1, service2);

      const info1 = await service1.start();
      const info2 = await service2.start();

      assert.notStrictEqual(
        info1.port,
        info2.port,
        "Ports should be different"
      );
      assert.strictEqual(service1.isProxyRunning(), true);
      assert.strictEqual(service2.isProxyRunning(), true);
    });
  });
});
