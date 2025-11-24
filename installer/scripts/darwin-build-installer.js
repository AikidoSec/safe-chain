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
import path from 'path';
import { fileURLToPath } from 'url';

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

// Step 9: Sign package (optional)
console.log('Signing package...');
await signPackage();

console.log('Build complete!');
console.log(`\nInstaller: ${path.join(buildDir, 'AikidoSafeChain.pkg')}`);
console.log(`Uninstaller: ${path.join(buildDir, 'uninstall.sh')}\n`);

/**
 * Bundle Node.js runtime from current installation
 */
async function bundleNodeRuntime() {
  const binDir = path.join(installRoot, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  
  // Copy current Node.js binary
  const nodePath = process.execPath;
  const targetNodePath = path.join(binDir, 'node');
  fs.copyFileSync(nodePath, targetNodePath);
  fs.chmodSync(targetNodePath, 0o755);
  
  console.log(`   Copied Node.js ${process.version} to ${targetNodePath}`);
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
 * Sign the package (optional, requires Developer ID certificate)
 */
async function signPackage() {
  try {
    const finalPkg = path.join(buildDir, 'AikidoSafeChain.pkg');
    
    // Check if signing identity exists
    const identities = execSync('security find-identity -v -p codesigning', { 
      encoding: 'utf-8' 
    });
    
    const developerIdMatch = identities.match(/Developer ID Installer: ([^"]+)/);
    
    if (!developerIdMatch) {
      console.log('   ⚠️  No Developer ID Installer certificate found. Skipping signing.');
      console.log('   Package will work but may show "unidentified developer" warning.');
      return;
    }
    
    const identity = developerIdMatch[0];
    console.log(`   Found signing identity: ${identity}`);
    
    const signedPkg = path.join(buildDir, 'AikidoSafeChain-signed.pkg');
    
    execSync(`productsign --sign "${identity}" "${finalPkg}" "${signedPkg}"`, {
      stdio: 'inherit'
    });
    
    // Replace unsigned with signed
    fs.renameSync(signedPkg, finalPkg);
    
    console.log('   ✅ Package signed successfully');
  } catch (error) {
    console.log(`   ⚠️  Signing failed: ${error.message}`);
    console.log('   Package will work but may show "unidentified developer" warning.');
  }
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
