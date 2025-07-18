import { spawn } from 'child_process';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

/**
 * Creates a temporary directory for testing
 */
export async function createTempDir() {
  const { writeFile } = await import('fs/promises');
  const tempDir = await mkdtemp(join(tmpdir(), 'aikido-e2e-'));
  
  // Create a basic package.json to avoid yarn/pnpm issues
  const packageJson = {
    name: 'test-project',
    version: '1.0.0',
    description: 'Test project for e2e tests'
  };
  
  await writeFile(join(tempDir, 'package.json'), JSON.stringify(packageJson, null, 2));
  
  return tempDir;
}

/**
 * Cleans up a temporary directory
 */
export async function cleanupTempDir(tempDir) {
  try {
    await rm(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Runs a command and captures stdout/stderr
 */
export function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'pipe',
      ...options
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({
        code,
        stdout,
        stderr
      });
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Runs an aikido command with timeout
 */
export async function runAikidoCommand(binaryName, args, options = {}) {
  const binaryPath = join(process.cwd(), 'bin', `${binaryName}.js`);
  const timeout = options.timeout || 10000; // 10 second timeout

  return new Promise((resolve, reject) => {
    const child = spawn('node', [binaryPath, ...args], {
      stdio: 'pipe',
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...options.env }
    });

    let stdout = '';
    let stderr = '';
    let timeoutId;

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      clearTimeout(timeoutId);
      resolve({
        code,
        stdout,
        stderr
      });
    });

    child.on('error', (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });

    // Set timeout
    timeoutId = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({
        code: 1,
        stdout,
        stderr: stderr + '\n[Test timeout - process killed]'
      });
    }, timeout);
  });
}

/**
 * Checks if a package manager is available in the system
 */
export async function isPackageManagerAvailable(packageManager) {
  try {
    const result = await runCommand(packageManager, ['--version']);
    return result.code === 0;
  } catch {
    return false;
  }
}