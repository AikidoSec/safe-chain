import { describe, it, after } from "node:test";
import assert from "node:assert";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlinkSync } from "node:fs";
import {
  DOWNLOAD_URLS,
  downloadFile,
  verifyChecksum,
} from "./downloadAgent.js";

describe("downloadAgent checksums", { timeout: 120_000 }, () => {
  const downloadedFiles = [];

  after(() => {
    for (const file of downloadedFiles) {
      try {
        unlinkSync(file);
      } catch {
        // ignore cleanup errors
      }
    }
  });

  for (const [platform, architectures] of Object.entries(DOWNLOAD_URLS)) {
    for (const [arch, { url, checksum }] of Object.entries(architectures)) {
      it(`${platform}/${arch} checksum matches`, async () => {
        const destPath = join(
          tmpdir(),
          `safe-chain-test-${platform}-${arch}-${Date.now()}`
        );
        downloadedFiles.push(destPath);

        await downloadFile(url, destPath);

        const isValid = await verifyChecksum(destPath, checksum);
        assert.strictEqual(
          isValid,
          true,
          `Checksum mismatch for ${platform}/${arch} (${url})`
        );
      });
    }
  }
});
