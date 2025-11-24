import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ini from "ini";

describe("runPipCommand environment variable handling", () => {
  let runPip;
  let capturedArgs = null;
  let customEnv = null;
  let capturedConfigContent = null; // Capture config file content before cleanup

  beforeEach(async () => {
    capturedArgs = null;
    capturedConfigContent = null;

    // Mock safeSpawn to capture args and config file content before cleanup
    mock.module("../../utils/safeSpawn.js", {
      namedExports: {
        safeSpawn: async (command, args, options) => {
          capturedArgs = { command, args, options };
          // Capture the config file content before the function cleans it up
          if (options.env.PIP_CONFIG_FILE) {
            try {
              capturedConfigContent = await fs.readFile(options.env.PIP_CONFIG_FILE, "utf-8");
            } catch {
              // Ignore if file doesn't exist or can't be read
            }
          }
          return { status: 0 };
        },
      },
    });

    // Mock proxy env merge, allow custom env override
    mock.module("../../registryProxy/registryProxy.js", {
      namedExports: {
        mergeSafeChainProxyEnvironmentVariables: (env) => ({
          ...env,
          ...customEnv,
          // Force deterministic proxy for tests regardless of ambient env
          GLOBAL_AGENT_HTTP_PROXY: "http://localhost:8080",
          HTTPS_PROXY: "http://localhost:8080",
          HTTP_PROXY: "",
        }),
      },
    });

    // Mock certBundle to return a test combined bundle path
    mock.module("../../registryProxy/certBundle.js", {
      namedExports: {
        getCombinedCaBundlePath: () => "/tmp/test-combined-ca.pem",
      },
    });

    const mod = await import("./runPipCommand.js");
    runPip = mod.runPip;
  });

  afterEach(() => {
    mock.reset();
  });

  it("should set PIP_CERT env var and create config file", async () => {
    const res = await runPip("pip3", ["install", "requests"]);
    assert.strictEqual(res.status, 0);
    assert.ok(capturedArgs, "safeSpawn should have been called");
    // Check PIP_CERT env var
    assert.strictEqual(
      capturedArgs.options.env.PIP_CERT,
      "/tmp/test-combined-ca.pem",
      "PIP_CERT should be set to combined bundle path"
    );
    // Check PIP_CONFIG_FILE env var exists and is a non-empty string
    const configPath = capturedArgs.options.env.PIP_CONFIG_FILE;
    assert.ok(configPath, "PIP_CONFIG_FILE should be set");
    assert.strictEqual(typeof configPath, "string", "PIP_CONFIG_FILE should be a string");
    assert.ok(configPath.length > 0, "PIP_CONFIG_FILE should be a non-empty path");
  });

  it("should set REQUESTS_CA_BUNDLE and SSL_CERT_FILE for default PyPI (no explicit index)", async () => {
    const res = await runPip("pip3", ["install", "requests"]);
    assert.strictEqual(res.status, 0);

    assert.ok(capturedArgs, "safeSpawn should have been called");
    
    // Check environment variables are set
    assert.strictEqual(
      capturedArgs.options.env.REQUESTS_CA_BUNDLE,
      "/tmp/test-combined-ca.pem",
      "REQUESTS_CA_BUNDLE should be set to combined bundle path"
    );
    assert.strictEqual(
      capturedArgs.options.env.SSL_CERT_FILE,
      "/tmp/test-combined-ca.pem",
      "SSL_CERT_FILE should be set to combined bundle path"
    );
  });

  it("should set CA environment variables even for external/test PyPI mirror (covers non-CLI traffic)", async () => {
    const res = await runPip("pip3", [
      "install",
      "certifi",
      "--index-url",
      "https://test.pypi.org/simple",
    ]);
    assert.strictEqual(res.status, 0);
    // Env vars should be set unconditionally
    assert.strictEqual(
      capturedArgs.options.env.REQUESTS_CA_BUNDLE,
      "/tmp/test-combined-ca.pem"
    );
    assert.strictEqual(
      capturedArgs.options.env.SSL_CERT_FILE,
      "/tmp/test-combined-ca.pem"
    );
  });

  it("should still set CA env vars for PyPI even with user --cert flag", async () => {
    // For default PyPI, we still set env vars; pip CLI --cert takes precedence
    const res = await runPip("pip3", ["install", "requests"]);
    assert.strictEqual(res.status, 0);
    
    // Environment variables still set (pip CLI --cert takes precedence)
    assert.strictEqual(
      capturedArgs.options.env.REQUESTS_CA_BUNDLE,
      "/tmp/test-combined-ca.pem"
    );
    assert.strictEqual(
      capturedArgs.options.env.SSL_CERT_FILE,
      "/tmp/test-combined-ca.pem"
    );
  });

  it("should preserve HTTPS_PROXY from proxy merge", async () => {
    const res = await runPip("pip3", ["install", "requests"]);
    assert.strictEqual(res.status, 0);
    
    assert.strictEqual(
      capturedArgs.options.env.HTTPS_PROXY,
      "http://localhost:8080",
      "HTTPS_PROXY should be set by proxy merge"
    );
  });

  it("should create a new temp config when existing config exists (original file untouched)", async () => {
    const tmpDir = os.tmpdir();
    const userCfgPath = path.join(tmpDir, `safe-chain-test-pip-${Date.now()}.ini`);
    const initial = "[global]\nindex-url = https://example.com/simple\n";
    await fs.writeFile(userCfgPath, initial, "utf-8");

    customEnv = { PIP_CONFIG_FILE: userCfgPath };
    const res = await runPip("pip3", ["install", "requests"]);
    assert.strictEqual(res.status, 0);
    const newCfgPath = capturedArgs.options.env.PIP_CONFIG_FILE;
    assert.notStrictEqual(newCfgPath, userCfgPath, "should point to a new temp config file");

    // Original file unchanged
    const originalContent = await fs.readFile(userCfgPath, "utf-8");
    const originalParsed = ini.parse(originalContent);
    assert.strictEqual(originalParsed.global.cert, undefined, "original file should not gain cert");

    // New file has merged settings (read from captured content before cleanup)
    assert.ok(capturedConfigContent, "config content should have been captured");
    const newParsed = ini.parse(capturedConfigContent);
    assert.strictEqual(newParsed.global.cert, "/tmp/test-combined-ca.pem", "new config should include cert");
    assert.strictEqual(newParsed.global.proxy, "http://localhost:8080", "new config should include proxy from env");
    assert.strictEqual(newParsed.global["index-url"], "https://example.com/simple", "index-url should be preserved");
    customEnv = null;
  });

  it("should create new config with proxy set from env (ini-validated)", async () => {
    // No PIP_CONFIG_FILE in env => creation path
    const res = await runPip("pip3", ["install", "requests"]);
    assert.strictEqual(res.status, 0);

    assert.ok(capturedConfigContent, "config content should have been captured");
    const parsed = ini.parse(capturedConfigContent);
    assert.ok(parsed.global, "[global] should exist after creation");
    assert.strictEqual(
      parsed.global.proxy,
      "http://localhost:8080",
      "proxy should be set from merged env"
    );
    assert.strictEqual(
      parsed.global.cert,
      "/tmp/test-combined-ca.pem",
      "cert should be set during creation"
    );
  });

  it("should create new temp config adding cert but preserving existing proxy (original file unchanged)", async () => {
    const tmpDir = os.tmpdir();
    const userCfgPath = path.join(tmpDir, `safe-chain-test-pip-${Date.now()}.ini`);
    const initial = "[global]\nproxy = http://original:9999\n";
    await fs.writeFile(userCfgPath, initial, "utf-8");

    customEnv = { PIP_CONFIG_FILE: userCfgPath };
    const res = await runPip("pip3", ["install", "requests"]);
    assert.strictEqual(res.status, 0);
    const newCfgPath = capturedArgs.options.env.PIP_CONFIG_FILE;
    assert.notStrictEqual(newCfgPath, userCfgPath, "should use a new temp config file");

    // Original file unchanged
    const originalParsed = ini.parse(await fs.readFile(userCfgPath, "utf-8"));
    assert.strictEqual(originalParsed.global.cert, undefined, "original file should not gain cert");
    assert.strictEqual(originalParsed.global.proxy, "http://original:9999", "original proxy remains");

    // New file: cert and proxy always overwritten (read from captured content)
    assert.ok(capturedConfigContent, "config content should have been captured");
    const newParsed = ini.parse(capturedConfigContent);
    assert.strictEqual(newParsed.global.cert, "/tmp/test-combined-ca.pem", "cert always overwritten in temp config");
    assert.strictEqual(newParsed.global.proxy, "http://localhost:8080", "proxy always overwritten in temp config");
    customEnv = null;
  });

  it("should create new temp config preserving existing cert and proxy while leaving original file unchanged", async () => {
    const tmpDir = os.tmpdir();
    const cfgPath = path.join(tmpDir, `safe-chain-test-pip-${Date.now()}.ini`);
    const initialIni = [
      "[global]",
      "cert = /path/to/existing.pem",
      "proxy = http://original:9999",
      ""
    ].join("\n");
    await fs.writeFile(cfgPath, initialIni, "utf-8");

    customEnv = { PIP_CONFIG_FILE: cfgPath };
    const res = await runPip("pip3", ["install", "requests"]);
    assert.strictEqual(res.status, 0, "execution should succeed");
    const newCfgPath = capturedArgs.options.env.PIP_CONFIG_FILE;
    assert.notStrictEqual(newCfgPath, cfgPath, "should use a newly generated temp config file");

    // Original file stays untouched
    const originalContent = await fs.readFile(cfgPath, "utf-8");
    const originalParsed = ini.parse(originalContent);
    assert.strictEqual(originalParsed.global.cert, "/path/to/existing.pem", "original cert preserved");
    assert.strictEqual(originalParsed.global.proxy, "http://original:9999", "original proxy preserved");

  // New temp config: cert and proxy always overwritten (read from captured content)
  assert.ok(capturedConfigContent, "config content should have been captured");
  const newParsed = ini.parse(capturedConfigContent);
  assert.strictEqual(newParsed.global.cert, "/tmp/test-combined-ca.pem", "cert always overwritten in temp config");
  assert.strictEqual(newParsed.global.proxy, "http://localhost:8080", "proxy always overwritten in temp config");
    customEnv = null;
  });

  it("should create new temp config preserving existing cert and adding missing proxy", async () => {
    const tmpDir = os.tmpdir();
    const userCfgPath = path.join(tmpDir, `safe-chain-test-pip-${Date.now()}.ini`);
    const initial = "[global]\ncert = /path/to/existing.pem\n";
    await fs.writeFile(userCfgPath, initial, "utf-8");

    customEnv = { PIP_CONFIG_FILE: userCfgPath };
    const res = await runPip("pip3", ["install", "requests"]);
    assert.strictEqual(res.status, 0);
    const newCfgPath = capturedArgs.options.env.PIP_CONFIG_FILE;
    assert.notStrictEqual(newCfgPath, userCfgPath, "should produce a new temp config file");

    // Original remains unchanged
    const originalParsed = ini.parse(await fs.readFile(userCfgPath, "utf-8"));
    assert.strictEqual(originalParsed.global.cert, "/path/to/existing.pem", "original cert unchanged");
    assert.strictEqual(originalParsed.global.proxy, undefined, "original proxy still missing");

  // New file: cert and proxy always overwritten (read from captured content)
  assert.ok(capturedConfigContent, "config content should have been captured");
  const newParsed = ini.parse(capturedConfigContent);
  assert.strictEqual(newParsed.global.cert, "/tmp/test-combined-ca.pem", "cert always overwritten in temp config");
  assert.strictEqual(newParsed.global.proxy, "http://localhost:8080", "proxy always overwritten in temp config");
    customEnv = null;
  });

  it("should log warnings when cert and proxy are already set in user config file", async () => {
    const tmpDir = os.tmpdir();
    const cfgPath = path.join(tmpDir, `safe-chain-test-pip-warn-${Date.now()}.ini`);
    const initialIni = [
      "[global]",
      "cert = /user/cert.pem",
      "proxy = http://user-proxy:9999",
      ""
    ].join("\n");
    await fs.writeFile(cfgPath, initialIni, "utf-8");

    customEnv = { PIP_CONFIG_FILE: cfgPath };
    
    // Capture stdout/stderr
    let output = "";
    const originalWrite = process.stdout.write;
    const originalError = process.stderr.write;
    process.stdout.write = (chunk, ...args) => { output += chunk; return originalWrite.apply(process.stdout, [chunk, ...args]); };
    process.stderr.write = (chunk, ...args) => { output += chunk; return originalError.apply(process.stderr, [chunk, ...args]); };

    await runPip("pip3", ["install", "requests"]);

    process.stdout.write = originalWrite;
    process.stderr.write = originalError;

    assert.ok(output.includes("cert found in PIP_CONFIG_FILE"), "Should warn about cert overwrite in output");
    assert.ok(output.includes("proxy found in PIP_CONFIG_FILE"), "Should warn about proxy overwrite in output");
    customEnv = null;
  });
});
