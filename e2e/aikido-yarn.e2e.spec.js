import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { createTempDir, cleanupTempDir, runAikidoCommand, isPackageManagerAvailable } from './test-helpers.js';

describe('aikido-yarn e2e tests', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('should allow installation of legitimate package (axios)', async () => {
    // Fail if yarn is not available
    const yarnAvailable = await isPackageManagerAvailable('yarn');
    assert.ok(yarnAvailable, 'yarn is not available - check CI/CD configuration');

    const result = await runAikidoCommand('aikido-yarn', ['add', 'axios', '--dry-run'], {
      cwd: tempDir,
      timeout: 10000,
      env: { NPM_TOKEN: 'test-token' } // Set NPM_TOKEN to avoid yarn config error
    });

    // Should succeed (exit code 0) and not show malware warning
    assert.equal(result.code, 0, `Expected success but got: ${result.stderr}`);
    assert.ok(!result.stdout.includes('MALWARE'), 'Should not detect axios as malware');
    assert.ok(!result.stderr.includes('MALWARE'), 'Should not detect axios as malware');
  });

  it('should block installation of malware package (eslint-js)', async () => {
    // Fail if yarn is not available
    const yarnAvailable = await isPackageManagerAvailable('yarn');
    assert.ok(yarnAvailable, 'yarn is not available - check CI/CD configuration');

    const result = await runAikidoCommand('aikido-yarn', ['add', 'eslint-js'], {
      cwd: tempDir,
      timeout: 10000,
      env: { NPM_TOKEN: 'test-token' } // Set NPM_TOKEN to avoid yarn config error
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

  it('should handle yarn add with version specifiers', async () => {
    // Fail if yarn is not available
    const yarnAvailable = await isPackageManagerAvailable('yarn');
    assert.ok(yarnAvailable, 'yarn is not available - check CI/CD configuration');

    const result = await runAikidoCommand('aikido-yarn', ['add', 'axios@1.0.0', '--dry-run'], {
      cwd: tempDir,
      timeout: 10000,
      env: { NPM_TOKEN: 'test-token' } // Set NPM_TOKEN to avoid yarn config error
    });

    // Should succeed with version specifier
    assert.equal(result.code, 0, `Expected success with version specifier but got: ${result.stderr}`);
    assert.ok(!result.stdout.includes('MALWARE'), 'Should not detect axios with version as malware');
  });
});