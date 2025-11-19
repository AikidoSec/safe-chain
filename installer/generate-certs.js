#!/usr/bin/env node

/**
 * Wrapper script for certificate generation during installer build
 * This re-exports the certificate generation functionality from the main package
 */

import { generateCACertificate } from '../packages/safe-chain/src/registryProxy/certUtils.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Generate certificate files (simple version for installer build)
 * For the full CLI version with nice output, use: safe-chain generate-cert
 * 
 * @param {string} outputDir - Directory to save certificate files
 * @returns {Promise<{certPath: string, keyPath: string}>}
 */
export async function generateCertificates(outputDir) {
  console.log('Generating Safe Chain CA certificate...');
  
  mkdirSync(outputDir, { recursive: true });
  
  const { cert, key } = generateCACertificate();
  
  const certPath = join(outputDir, 'ca-cert.pem');
  const keyPath = join(outputDir, 'ca-key.pem');
  
  writeFileSync(certPath, cert);
  writeFileSync(keyPath, key);
  
  console.log('✓ Certificate generated:');
  console.log(`  Certificate: ${certPath}`);
  console.log(`  Private Key: ${keyPath}`);
  
  return { certPath, keyPath };
}

// CLI usage - when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const outputDir = process.argv[2] || './certs';
  generateCertificates(outputDir).catch(error => {
    console.error('Error generating certificates:', error);
    process.exit(1);
  });
}
