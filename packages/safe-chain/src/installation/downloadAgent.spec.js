import { describe, it, after } from "node:test";
import assert from "node:assert";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  DOWNLOAD_URLS,
  getAgentDownloadUrl,
  verifyChecksum,
} from "./downloadAgent.js";

describe("downloadAgent", () => {
  const tempFiles = [];

  after(() => {
    for (const file of tempFiles) {
      try {
        unlinkSync(file);
      } catch {
        // ignore cleanup errors
      }
    }
  });

  for (const [platform, architectures] of Object.entries(DOWNLOAD_URLS)) {
    for (const [arch, { url, checksum }] of Object.entries(architectures)) {
      it(`${platform}/${arch} has a valid download definition`, () => {
        assert.match(
          url,
          /^https:\/\/github\.com\/AikidoSec\/safechain-internals\/releases\/download\/v\d+\.\d+\.\d+\/.+/,
        );
        assert.match(checksum, /^sha256:[a-f0-9]{64}$/);
      });
    }
  }

  it("builds agent download URLs from the current version", () => {
    assert.equal(
      getAgentDownloadUrl("SafeChainUltimate.pkg"),
      "https://github.com/AikidoSec/safechain-internals/releases/download/v1.0.0/SafeChainUltimate.pkg",
    );
  });

  it("verifies checksum for a local file", async () => {
    const destPath = join(tmpdir(), `safe-chain-test-${Date.now()}`);
    tempFiles.push(destPath);

    writeFileSync(destPath, "safe-chain-test");

    const expectedHash = createHash("sha256")
      .update("safe-chain-test")
      .digest("hex");

    assert.equal(
      await verifyChecksum(destPath, `sha256:${expectedHash}`),
      true,
    );
    assert.equal(
      await verifyChecksum(destPath, `sha256:${"0".repeat(64)}`),
      false,
    );
  });
});
