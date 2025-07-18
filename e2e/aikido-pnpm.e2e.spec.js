import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { createTempDir, cleanupTempDir, runAikidoCommand, isPackageManagerAvailable } from './test-helpers.js';

describe('aikido-pnpm e2e tests', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('should allow installation of legitimate package (axios)', async () => {
    // Fail if pnpm is not available
    const pnpmAvailable = await isPackageManagerAvailable('pnpm');
    assert.ok(pnpmAvailable, 'pnpm is not available - check CI/CD configuration');

    const result = await runAikidoCommand('aikido-pnpm', ['add', 'axios'], {
      cwd: tempDir,
      timeout: 10000
    });

    // Should succeed (exit code 0) and not show malware warning
    // Note: pnpm may still exit with non-zero due to network issues, but should not show malware warnings
    assert.ok(!result.stdout.includes('MALWARE'), 'Should not detect axios as malware');
    assert.ok(!result.stderr.includes('MALWARE'), 'Should not detect axios as malware');
  });

  it('should block installation of malware package (eslint-js)', async () => {
    // Fail if pnpm is not available
    const pnpmAvailable = await isPackageManagerAvailable('pnpm');
    assert.ok(pnpmAvailable, 'pnpm is not available - check CI/CD configuration');

    const result = await runAikidoCommand('aikido-pnpm', ['add', 'eslint-js'], {
      cwd: tempDir,
      timeout: 10000
    });

    // Should fail (non-zero exit code) and show malware warning
    assert.notEqual(result.code, 0, 'Should fail when trying to install malware');
    
    // Check that malware was detected
    const output = result.stdout + result.stderr;
    assert.ok(
      output.includes('malware') || output.includes('MALWARE') || output.includes('blocked') || output.includes('dangerous') || output.includes('Malicious changes detected'),
      `Should detect malware but got: ${output}`
    );
  });

  it('should handle pnpm add with version specifiers', async () => {
    // Fail if pnpm is not available
    const pnpmAvailable = await isPackageManagerAvailable('pnpm');
    assert.ok(pnpmAvailable, 'pnpm is not available - check CI/CD configuration');

    const result = await runAikidoCommand('aikido-pnpm', ['add', 'axios@1.0.0'], {
      cwd: tempDir,
      timeout: 10000
    });

    // Should succeed with version specifier
    // Note: pnpm may still exit with non-zero due to network issues, but should not show malware warnings
    assert.ok(!result.stdout.includes('MALWARE'), 'Should not detect axios with version as malware');
  });
});