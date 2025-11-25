#!/usr/bin/env node

/**
 * Main build script for creating the macOS .pkg installer
 * 
 * 1. Clean previous builds
 * 2. Bundle Node.js runtime
 * 3. Bundle agent code and dependencies
 * 4. Generate CA certificate
 * 5. Create installer scripts
 * 6. Build .pkg with pkgbuild and productbuild
 * 7. Sign the package (if certificates available)
 */

import { execSync } from 'child_process';
import fs from 'fs';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';
import { pipeline } from 'stream/promises';
import { createWriteStream, createReadStream } from 'fs';
import { createGunzip } from 'zlib';
import * as tar from 'tar';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const buildDir = path.join(rootDir, 'build');
const distDir = path.join(rootDir, 'dist');

console.log('🏗️  Building Aikido Safe Chain macOS Installer...\n');

// Step 1: Clean and create directories
console.log('Preparing build directories...');
if (fs.existsSync(buildDir)) {
  fs.rmSync(buildDir, { recursive: true });
}
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true });
}
fs.mkdirSync(buildDir, { recursive: true });
fs.mkdirSync(distDir, { recursive: true });

const payloadDir = path.join(distDir, 'payload');
const installRoot = path.join(payloadDir, 'Library/Application Support/AikidoSafety');
fs.mkdirSync(installRoot, { recursive: true });
console.log('Directories created\n');

// Step 2: Bundle Node.js runtime
console.log('Bundling Node.js runtime...');
await bundleNodeRuntime();
console.log('Node.js bundled\n');

// Step 3: Bundle agent code
console.log('Bundling agent code...');
await bundleAgentCode();
console.log('Agent code bundled\n');

// Step 4: Generate certificates
console.log('Generating CA certificate...');
await generateCertificates();
console.log('Certificates generated\n');

// Step 5: Create LaunchDaemon plist
console.log('Creating LaunchDaemon configuration...');
await createLaunchDaemonPlist();
console.log('LaunchDaemon plist created\n');

// Step 6: Create installer scripts
console.log('Creating installer scripts...');
await createInstallerScripts();
console.log('Installer scripts created\n');

// Step 7: Create uninstaller
console.log('Creating uninstaller...');
await createUninstaller();
console.log('Uninstaller created\n');

// Step 8: Build package
console.log('Building .pkg installer...');
await buildPackage();
console.log('Package built\n');

console.log('Build complete!');
console.log(`\nInstaller: ${path.join(buildDir, 'AikidoSafeChain.pkg')}`);
console.log(`Uninstaller: ${path.join(buildDir, 'uninstall.sh')}\n`);

/**
 * Download a file from URL
 */
async function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      
      const fileStream = createWriteStream(destPath);
      response.pipe(fileStream);
      
      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });
      
      fileStream.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Bundle Node.js runtime - downloads official binary for target architecture
 */
async function bundleNodeRuntime() {
  const binDir = path.join(installRoot, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  
  // Detect target architecture (prefer arm64 for Apple Silicon)
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const nodeVersion = process.version; // e.g., v20.10.0
  
  console.log(`   Downloading Node.js ${nodeVersion} for macOS-${arch}...`);
  
  // Download official Node.js binary from nodejs.org
  const downloadUrl = `https://nodejs.org/dist/${nodeVersion}/node-${nodeVersion}-darwin-${arch}.tar.gz`;
  const tarballPath = path.join(buildDir, 'node.tar.gz');
  
  try {
    await downloadFile(downloadUrl, tarballPath);
    console.log(`   Downloaded Node.js tarball`);
    
    // Extract node binary from tarball
    const extractDir = path.join(buildDir, 'node-extract');
    fs.mkdirSync(extractDir, { recursive: true });
    
    await tar.extract({
      file: tarballPath,
      cwd: extractDir,
      strip: 2,
      filter: (path) => path.endsWith('/bin/node')
    });
    
    // Move extracted node binary to target location
    const extractedNode = path.join(extractDir, 'node');
    const targetNodePath = path.join(binDir, 'node');
    
    if (fs.existsSync(extractedNode)) {
      fs.copyFileSync(extractedNode, targetNodePath);
      fs.chmodSync(targetNodePath, 0o755);
      console.log(`   Installed Node.js ${nodeVersion} (${arch}) to ${targetNodePath}`);
    } else {
      throw new Error('Failed to extract node binary from tarball');
    }
    
    // Cleanup
    fs.rmSync(tarballPath);
    fs.rmSync(extractDir, { recursive: true });
    
  } catch (error) {
    console.warn(`   Failed to download Node.js: ${error.message}`);
    console.warn(`   Falling back to current Node.js binary (may not match target architecture)`);
    
    // Fallback to copying current Node.js binary
    const nodePath = process.execPath;
    const targetNodePath = path.join(binDir, 'node');
    fs.copyFileSync(nodePath, targetNodePath);
    fs.chmodSync(targetNodePath, 0o755);
    console.log(`   Copied Node.js ${process.version} (${process.arch}) from ${nodePath}`);
  }
}

/**
 * Bundle agent code and dependencies
 */
async function bundleAgentCode() {
  const agentDir = path.join(installRoot, 'agent');
  fs.mkdirSync(agentDir, { recursive: true });
  
  // Copy agent source files
  const agentSrc = path.join(rootDir, 'agent');
  copyDirectory(agentSrc, agentDir);
  
  // Copy necessary dependencies from packages/safe-chain
  const safeChainSrc = path.join(rootDir, '../packages/safe-chain/src');
  const safeChainDest = path.join(agentDir, 'lib');
  fs.mkdirSync(safeChainDest, { recursive: true });
  
  // Copy only registry proxy code (reused by agent)
  copyDirectory(
    path.join(safeChainSrc, 'registryProxy'),
    path.join(safeChainDest, 'registryProxy')
  );
  
  copyDirectory(
    path.join(safeChainSrc, 'scanning'),
    path.join(safeChainDest, 'scanning')
  );
  
  copyDirectory(
    path.join(safeChainSrc, 'api'),
    path.join(safeChainDest, 'api')
  );
  
  copyDirectory(
    path.join(safeChainSrc, 'config'),
    path.join(safeChainDest, 'config')
  );
  
  copyDirectory(
    path.join(safeChainSrc, 'environment'),
    path.join(safeChainDest, 'environment')
  );
  
  copyDirectory(
    path.join(safeChainSrc, 'utils'),
    path.join(safeChainDest, 'utils')
  );
  
  // Install production dependencies
  const agentPackageJson = path.join(agentDir, 'package.json');
  if (fs.existsSync(agentPackageJson)) {
    console.log('   Installing agent dependencies...');
    execSync('npm install --production --no-optional', {
      cwd: agentDir,
      stdio: 'inherit'
    });
  }
  
  console.log(`   Agent code bundled to ${agentDir}`);
}

/**
 * Generate CA certificate for MITM proxy
 * Reuses certificate generation code from safe-chain
 */
async function generateCertificates() {
  const certsDir = path.join(installRoot, 'certs');
  fs.mkdirSync(certsDir, { recursive: true });
  
  // Import certificate generation from safe-chain
  const certUtilsPath = path.join(rootDir, '../packages/safe-chain/src/registryProxy/certUtils.js');
  const { generateCa } = await import(certUtilsPath);
  const { default: forge } = await import('node-forge');
  
  // Generate CA certificate with system-wide agent attributes
  // (10 year validity vs 1 day for CLI, full org details for system keychain)
  const { privateKey, certificate } = generateCa({
    attrs: [
      { name: 'commonName', value: 'Aikido Safe Chain CA' },
      { name: 'countryName', value: 'US' },
      { shortName: 'ST', value: 'California' },
      { name: 'localityName', value: 'San Francisco' },
      { name: 'organizationName', value: 'Aikido Security' },
      { shortName: 'OU', value: 'Safe Chain' }
    ],
    validityDays: 3650 // 10 years
  });
  
  // Write certificate and key
  const certPem = forge.pki.certificateToPem(certificate);
  const keyPem = forge.pki.privateKeyToPem(privateKey);
  
  fs.writeFileSync(path.join(certsDir, 'ca-cert.pem'), certPem);
  fs.writeFileSync(path.join(certsDir, 'ca-key.pem'), keyPem);
  fs.chmodSync(path.join(certsDir, 'ca-key.pem'), 0o600);
  
  console.log(`   CA certificate generated in ${certsDir}`);
}

/**
 * Create LaunchDaemon plist file
 */
async function createLaunchDaemonPlist() {
  const plistDir = path.join(distDir, 'payload/Library/LaunchDaemons');
  fs.mkdirSync(plistDir, { recursive: true });
  
  const templatesDir = path.join(__dirname, 'templates');
  
  // Read plist template
  const plist = fs.readFileSync(path.join(templatesDir, 'dev.aikido.safe-chain.plist'), 'utf-8');
  
  fs.writeFileSync(path.join(plistDir, 'dev.aikido.safe-chain.plist'), plist);
  console.log(`   LaunchDaemon plist created`);
}

/**
 * Create installer pre/post install scripts
 */
async function createInstallerScripts() {
  const scriptsDir = path.join(distDir, 'scripts');
  fs.mkdirSync(scriptsDir, { recursive: true });
  
  const templatesDir = path.join(__dirname, 'templates');
  
  // Read script templates
  const postinstall = fs.readFileSync(path.join(templatesDir, 'postinstall.sh'), 'utf-8');
  const preinstall = fs.readFileSync(path.join(templatesDir, 'preinstall.sh'), 'utf-8');
  
  // Write scripts to dist directory
  fs.writeFileSync(path.join(scriptsDir, 'postinstall'), postinstall);
  fs.writeFileSync(path.join(scriptsDir, 'preinstall'), preinstall);
  fs.chmodSync(path.join(scriptsDir, 'postinstall'), 0o755);
  fs.chmodSync(path.join(scriptsDir, 'preinstall'), 0o755);
  
  console.log(`   Installer scripts created in ${scriptsDir}`);
}

/**
 * Create uninstaller script
 */
async function createUninstaller() {
  const templatesDir = path.join(__dirname, 'templates');
  
  // Read uninstaller template
  const uninstallScript = fs.readFileSync(path.join(templatesDir, 'uninstall.sh'), 'utf-8');
  
  // Write to both build and payload
  fs.writeFileSync(path.join(buildDir, 'uninstall.sh'), uninstallScript);
  fs.chmodSync(path.join(buildDir, 'uninstall.sh'), 0o755);
  
  const installUninstallPath = path.join(installRoot, 'uninstall.sh');
  fs.writeFileSync(installUninstallPath, uninstallScript);
  fs.chmodSync(installUninstallPath, 0o755);
  
  console.log(`   Uninstaller created in ${buildDir}`);
}

/**
 * Build the .pkg installer
 */
async function buildPackage() {
  const componentPkg = path.join(buildDir, 'component.pkg');
  const finalPkg = path.join(buildDir, 'AikidoSafeChain.pkg');
  
  // Build component package
  const pkgbuildCmd = [
    'pkgbuild',
    '--root', `"${path.join(distDir, 'payload')}"`,
    '--scripts', `"${path.join(distDir, 'scripts')}"`,
    '--identifier', 'dev.aikido.safe-chain',
    '--version', '1.0.0',
    '--install-location', '/',
    `"${componentPkg}"`
  ].join(' ');
  
  console.log(`   Running: ${pkgbuildCmd}`);
  execSync(pkgbuildCmd, { stdio: 'inherit' });
  
  const templatesDir = path.join(__dirname, 'templates');
  
  // Read distribution XML template
  const distribution = fs.readFileSync(path.join(templatesDir, 'distribution.xml'), 'utf-8');
  
  const distributionPath = path.join(buildDir, 'distribution.xml');
  fs.writeFileSync(distributionPath, distribution);
  
  // Create resources
  const resourcesDir = path.join(buildDir, 'resources');
  fs.mkdirSync(resourcesDir, { recursive: true });
  
  // Read HTML templates
  const welcomeHtml = fs.readFileSync(path.join(templatesDir, 'welcome.html'), 'utf-8');
  const conclusionHtml = fs.readFileSync(path.join(templatesDir, 'conclusion.html'), 'utf-8');
  
  // Write HTML files to resources directory
  fs.writeFileSync(path.join(resourcesDir, 'welcome.html'), welcomeHtml);
  fs.writeFileSync(path.join(resourcesDir, 'conclusion.html'), conclusionHtml);
  
  // Build final package
  const productbuildCmd = [
    'productbuild',
    '--distribution', `"${distributionPath}"`,
    '--resources', `"${resourcesDir}"`,
    '--package-path', `"${buildDir}"`,
    `"${finalPkg}"`
  ].join(' ');
  
  console.log(`   Running: ${productbuildCmd}`);
  execSync(productbuildCmd, { stdio: 'inherit' });
  
  console.log(`   Package created: ${finalPkg}`);
}

/**
 * Helper: Copy directory recursively
 */
function copyDirectory(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`   Warning: Source directory not found: ${src}`);
    return;
  }
  
  fs.mkdirSync(dest, { recursive: true });
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
