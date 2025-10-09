import os from "os";
import path from "path";

/**
 * Gets the global bunfig.toml path
 * @returns {string} Path to global bunfig.toml
 */
export function getGlobalConfigPath() {
  return path.join(os.homedir(), ".bunfig.toml");
}

/**
 * Adds or updates the scanner configuration in TOML content
 * @param {string} content - Existing TOML content
 * @returns {{content: string, changed: boolean}} Updated content and change status
 */
export function addScannerToToml(content) {
  const scannerLine = 'scanner = "@aikidosec/safe-chain-bun"';
  
  if (content.includes(scannerLine)) {
    return { content, changed: false };
  }
  
  const lines = content.split(/[\r\n\u2028\u2029]+/);
  const installSecurityRegex = /^\[install\.security\]$/;
  const scannerRegex = /^scanner\s*=.*$/;
  
  const securitySectionIndex = lines.findIndex(line => installSecurityRegex.test(line));
  
  if (securitySectionIndex >= 0) {
    const scannerLineIndex = lines.findIndex((line, index) => 
      index > securitySectionIndex && scannerRegex.test(line)
    );
    
    if (scannerLineIndex >= 0) {
      lines[scannerLineIndex] = scannerLine;
    } else {
      lines.splice(securitySectionIndex + 1, 0, scannerLine);
    }
  } else {
    if (lines[lines.length - 1] !== '') {
      lines.push('');
    }
    lines.push('[install.security]');
    lines.push(scannerLine);
    lines.push('');
  }
  
  return { content: lines.join(os.EOL), changed: true };
}

/**
 * Removes safe-chain-bun scanner configuration from TOML content
 * @param {string} content - Existing TOML content
 * @returns {{content: string, changed: boolean}} Updated content and change status
 */
export function removeScannerFromToml(content) {
  const scannerLine = 'scanner = "@aikidosec/safe-chain-bun"';
  
  if (!content.includes(scannerLine)) {
    return { content, changed: false };
  }
  
  const lines = content.split(/[\r\n\u2028\u2029]+/);
  const installSecurityRegex = /^\[install\.security\]$/;
  const scannerRegex = /^scanner\s*=\s*"@aikidosec\/safe-chain-bun"$/;
  
  const securitySectionIndex = lines.findIndex(line => installSecurityRegex.test(line));
  
  if (securitySectionIndex >= 0) {
    const scannerLineIndex = lines.findIndex((line, index) => 
      index > securitySectionIndex && scannerRegex.test(line)
    );
    
    if (scannerLineIndex >= 0) {
      lines.splice(scannerLineIndex, 1);
      
      // Check if [install.security] section is now empty
      let isEmpty = true;
      for (let i = securitySectionIndex + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === '') continue;
        if (line.startsWith('#')) continue;
        if (line.startsWith('[')) break;
        isEmpty = false;
        break;
      }
      
      if (isEmpty) {
        let sectionEnd = lines.length;
        for (let i = securitySectionIndex + 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line.startsWith('[')) {
            sectionEnd = i;
            break;
          }
        }
        
        let removeStart = securitySectionIndex;
        let removeEnd = sectionEnd;
        
        while (removeEnd > securitySectionIndex + 1 && lines[removeEnd - 1].trim() === '') {
          removeEnd--;
        }
        
        if (removeStart > 0 && lines[removeStart - 1].trim() === '') {
          removeStart--;
        }
        
        lines.splice(removeStart, removeEnd - removeStart);
      }
      
      return { content: lines.join(os.EOL), changed: true };
    }
  }
  
  return { content, changed: false };
}