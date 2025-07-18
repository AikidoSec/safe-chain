import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { createTempDir, cleanupTempDir, runAikidoCommand, isPackageManagerAvailable } from './test-helpers.js';

describe('aikido-pnpx e2e tests', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('should allow execution of legitimate package (cowsay)', async () => {
    // Fail if pnpm is not available (pnpx comes with pnpm)
    const pnpmAvailable = await isPackageManagerAvailable('pnpm');
    assert.ok(pnpmAvailable, 'pnpm/pnpx is not available - check CI/CD configuration');

    const result = await runAikidoCommand('aikido-pnpx', ['cowsay', '--help'], {
      cwd: tempDir,
      timeout: 10000
    });

    // Should not detect cowsay as malware, regardless of execution result
    assert.ok(!result.stdout.includes('MALWARE'), 'Should not detect cowsay as malware');
    assert.ok(!result.stderr.includes('MALWARE'), 'Should not detect cowsay as malware');
  });

  it('should block execution of malware package (eslint-js)', async () => {
    // Fail if pnpm is not available (pnpx comes with pnpm)
    const pnpmAvailable = await isPackageManagerAvailable('pnpm');
    assert.ok(pnpmAvailable, 'pnpm/pnpx is not available - check CI/CD configuration');

    const result = await runAikidoCommand('aikido-pnpx', ['eslint-js'], {
      cwd: tempDir,
      timeout: 10000
    });

    // Should fail (non-zero exit code) and show malware warning
    assert.notEqual(result.code, 0, 'Should fail when trying to execute malware');
    
    // Check that malware was detected
    const output = result.stdout + result.stderr;
    assert.ok(
      output.includes('malware') || output.includes('MALWARE') || output.includes('blocked') || output.includes('dangerous') || output.includes('Malicious changes detected'),
      `Should detect malware but got: ${output}`
    );
  });

  it('should handle pnpx with version specifiers', async () => {
    // Fail if pnpm is not available (pnpx comes with pnpm)
    const pnpmAvailable = await isPackageManagerAvailable('pnpm');
    assert.ok(pnpmAvailable, 'pnpm/pnpx is not available - check CI/CD configuration');

    const result = await runAikidoCommand('aikido-pnpx', ['cowsay@1.0.0', '--help'], {
      cwd: tempDir,
      timeout: 10000
    });

    // Should not detect cowsay with version as malware
    assert.ok(!result.stdout.includes('MALWARE'), 'Should not detect cowsay with version as malware');
    assert.ok(!result.stderr.includes('MALWARE'), 'Should not detect cowsay with version as malware');
  });
});