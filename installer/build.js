#!/usr/bin/env node

/**
 * Build script for creating standalone Safe Chain binaries
 * Uses esbuild to bundle ES modules, then @yao-pkg/pkg to create executable
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, copyFileSync, writeFileSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const execAsync = promisify(exec);

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const DIST_DIR = join(__dirname, 'dist');
const BUNDLE_DIR = join(DIST_DIR, 'bundle');
const SAFE_CHAIN_DIR = join(ROOT_DIR, 'packages/safe-chain');

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const platform = args.find(arg => arg.startsWith('--platform='))?.split('=')[1] || 'macos';
  return { platform };
}

/**
 * Ensure dist directory exists
 */
function ensureDistDirectory() {
  if (!existsSync(DIST_DIR)) {
    mkdirSync(DIST_DIR, { recursive: true });
  }
  if (!existsSync(BUNDLE_DIR)) {
    mkdirSync(BUNDLE_DIR, { recursive: true });
  }
}

/**
 * Bundle ES modules using esbuild
 * This converts ES modules to CommonJS that pkg can handle
 */
async function bundleWithEsbuild() {
  console.log('Bundling with esbuild...');
  
  const entryPoint = join(SAFE_CHAIN_DIR, 'bin/safe-chain.js');
  const outputFile = join(BUNDLE_DIR, 'safe-chain-bundled.cjs');
  
  await esbuild.build({
    entryPoints: [entryPoint],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    outfile: outputFile,
    external: [
      // Keep node: protocol imports external
      'node:*',
    ],
    loader: {
      '.json': 'json', // Inline JSON files
    },
    // We need to inject a polyfill because:
    // source code is ESM (uses import.meta.url)
    // target is CommonJS (required by pkg)
    // CommonJS doesn't have import.meta.url, and ESM doesn't have __filename/__dirname
    // create a fake import.meta.url from __filename
    banner: {
      js: `// Polyfill for import.meta.url in CommonJS
var __filename = __filename || (() => {
  try {
    return require('url').fileURLToPath(__filename);
  } catch (e) {
    return __filename;
  }
})();
var __dirname = __dirname || require('path').dirname(__filename);
var import_meta_url = typeof __filename !== 'undefined' ? require('url').pathToFileURL(__filename).href : undefined;
`,
    },
    define: {
      'import.meta.url': 'import_meta_url',
    },
    minify: false, // Keep readable for debugging
    sourcemap: false,
  });
  
  console.log('Bundle created at:', outputFile);
  return outputFile;
}

async function buildMacOS() {
  console.log('Building macOS binary...');
  
  // Step 1: Bundle with esbuild
  const bundledFile = await bundleWithEsbuild();
  
  // Step 2: Package with pkg
  const targetPlatform = 'node20-macos-arm64';
  const outputPath = join(DIST_DIR, 'safe-chain-macos-arm64');
  
  // Copy shell-integration files to a staging directory with the structure we want in /snapshot
  const stagingDir = join(DIST_DIR, 'staging');
  const stagingShellInt = join(stagingDir, 'src/shell-integration');
  
  // Clean and create staging directory
  if (existsSync(stagingDir)) {
    rmSync(stagingDir, { recursive: true });
  }
  mkdirSync(stagingShellInt, { recursive: true });
  
  // Copy shell-integration directory
  const shellIntegrationSrc = join(SAFE_CHAIN_DIR, 'src/shell-integration');
  
  // Helper to copy directory recursively
  const copyDir = (src, dest) => {
    if (!existsSync(dest)) {
      mkdirSync(dest, { recursive: true });
    }
    const entries = readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = join(src, entry.name);
      const destPath = join(dest, entry.name);
      if (entry.isDirectory()) {
        copyDir(srcPath, destPath);
      } else {
        copyFileSync(srcPath, destPath);
      }
    }
  };
  
  copyDir(shellIntegrationSrc, stagingShellInt);
  
  const pkgArgs = [
    bundledFile,
    '--target', targetPlatform,
    '--output', outputPath,
    '--compress', 'GZip',
    // Include contents of staging/src - files will be at /snapshot/src/shell-integration/
    `--assets=${join(stagingDir, 'src')}/**/*`,
  ];

  console.log(`Running: npx @yao-pkg/pkg ${pkgArgs.join(' ')}`);
  
  // Use spawn instead of execFile to avoid issues with glob expansion
  const { spawn } = await import('node:child_process');
  
  const pkgProcess = spawn('npx', ['@yao-pkg/pkg', ...pkgArgs], { 
    cwd: __dirname,
    stdio: 'inherit'
  });
  
  await new Promise((resolve, reject) => {
    pkgProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`pkg failed with code ${code}`));
      } else {
        resolve();
      }
    });
  });  console.log('✓ Binary created at:', outputPath);
  
  // Create installer package
  await createMacOSInstaller(outputPath);
}

/**
 * Create macOS installer with certificate installation
 */
async function createMacOSInstaller(binaryPath) {
  console.log('Creating macOS installer package...');
  
  const installerDir = join(DIST_DIR, 'macos-installer');
  const scriptsDir = join(installerDir, 'scripts');
  const resourcesDir = join(installerDir, 'resources');
  
  // Create directory structure
  mkdirSync(scriptsDir, { recursive: true });
  mkdirSync(resourcesDir, { recursive: true });
  
  // Copy binary to resources
  const binaryDestination = join(resourcesDir, 'safe-chain');
  copyFileSync(binaryPath, binaryDestination);
  
  // Read installer scripts from separate files
  const scriptsSourceDir = join(__dirname, 'scripts');
  const preinstallScript = readFileSync(join(scriptsSourceDir, 'darwin_preinstall.sh'), 'utf8');
  const postinstallScript = readFileSync(join(scriptsSourceDir, 'darwin_postinstall.sh'), 'utf8');
  const uninstallScript = readFileSync(join(scriptsSourceDir, 'darwin_uninstall.sh'), 'utf8');
  
  // Write scripts to installer directory
  writeFileSync(join(scriptsDir, 'preinstall'), preinstallScript, { mode: 0o755 });
  writeFileSync(join(scriptsDir, 'postinstall'), postinstallScript, { mode: 0o755 });
  writeFileSync(join(installerDir, 'uninstall.sh'), uninstallScript, { mode: 0o755 });

  // Run pkgbuild to create the .pkg file
  console.log('Running pkgbuild...');
  const pkgName = 'SafeChain.pkg';
  const pkgPath = join(installerDir, pkgName);
  
  // Get version from package.json
  const packageJson = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8'));
  const version = packageJson.version;

  const pkgbuildArgs = [
    '--root', resourcesDir,
    '--scripts', scriptsDir,
    '--identifier', 'com.aikido.safe-chain',
    '--version', version,
    '--install-location', '/tmp/safe-chain-install',
    pkgPath
  ];

  await execAsync(`pkgbuild ${pkgbuildArgs.join(' ')}`);
  console.log(`Mac OS Installer created at: ${pkgPath}`);
}

/**
 * Build Linux binary and installer
 */
async function buildLinux() {
  // TODO: Implement Linux binary creation
}

/**
 * Build Windows binary and installer
 */
async function buildWindows() {
  // TODO: Implement Windows binary creation
}

/**
 * Main build function
 */
async function build() {
  const { platform } = parseArgs();
  
  console.log('=== Safe Chain Installer Builder ===');
  console.log(`Platform: ${platform}`);
  console.log('');
  
  ensureDistDirectory();
  
  try {
    switch (platform) {
      case 'macos':
        await buildMacOS();
        break;
      case 'linux':
        await buildLinux();
        break;
      case 'windows':
        await buildWindows();
        break;
      default:
        console.error(`Unknown platform: ${platform}`);
        console.error('Valid options: macos, linux, windows');
        process.exit(1);
    }
  } catch (error) {
    process.exit(1);
  }
}

// Run the build
build();
