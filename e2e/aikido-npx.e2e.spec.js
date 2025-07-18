import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { createTempDir, cleanupTempDir, runAikidoCommand, isPackageManagerAvailable } from './test-helpers.js';

describe('aikido-npx e2e tests', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('should allow execution of legitimate package (cowsay)', async () => {
    // Fail if npm is not available (npx comes with npm)
    const npmAvailable = await isPackageManagerAvailable('npm');
    assert.ok(npmAvailable, 'npm/npx is not available - check CI/CD configuration');

    const result = await runAikidoCommand('aikido-npx', ['cowsay', '--help'], {
      cwd: tempDir,
      timeout: 10000
    });

    // Should not detect cowsay as malware, regardless of execution result
    assert.ok(!result.stdout.includes('MALWARE'), 'Should not detect cowsay as malware');
    assert.ok(!result.stderr.includes('MALWARE'), 'Should not detect cowsay as malware');
  });

  it('should block execution of malware package (eslint-js)', async () => {
    // Fail if npm is not available (npx comes with npm)
    const npmAvailable = await isPackageManagerAvailable('npm');
    assert.ok(npmAvailable, 'npm/npx is not available - check CI/CD configuration');

    const result = await runAikidoCommand('aikido-npx', ['eslint-js'], {
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

  it('should handle npx with version specifiers', async () => {
    // Fail if npm is not available (npx comes with npm)
    const npmAvailable = await isPackageManagerAvailable('npm');
    assert.ok(npmAvailable, 'npm/npx is not available - check CI/CD configuration');

    const result = await runAikidoCommand('aikido-npx', ['cowsay@1.0.0', '--help'], {
      cwd: tempDir,
      timeout: 10000
    });

    // Should not detect cowsay with version as malware
    assert.ok(!result.stdout.includes('MALWARE'), 'Should not detect cowsay with version as malware');
    assert.ok(!result.stderr.includes('MALWARE'), 'Should not detect cowsay with version as malware');
  });

  it('should handle npx with package arguments', async () => {
    // Fail if npm is not available (npx comes with npm)
    const npmAvailable = await isPackageManagerAvailable('npm');
    assert.ok(npmAvailable, 'npm/npx is not available - check CI/CD configuration');

    const result = await runAikidoCommand('aikido-npx', ['cowsay', 'hello world'], {
      cwd: tempDir,
      timeout: 10000
    });

    // Should not detect cowsay as malware, regardless of execution result
    assert.ok(!result.stdout.includes('MALWARE'), 'Should not detect cowsay as malware');
    assert.ok(!result.stderr.includes('MALWARE'), 'Should not detect cowsay as malware');
  });
});