import fs from "fs";
import os from "os";

/**
 * Read and parse basic TOML file structure
 * Only handles simple key-value pairs and sections
 */
export function readTOMLFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const result = {};
  const lines = content.split(/[\r\n\u2028\u2029]+/);
  let currentSection = null;

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Skip empty lines and comments
    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    // Handle sections like [install.security]
    if (trimmedLine.startsWith("[") && trimmedLine.endsWith("]")) {
      currentSection = trimmedLine.slice(1, -1);
      if (!result[currentSection]) {
        result[currentSection] = {};
      }
      continue;
    }

    // Handle key-value pairs
    const equalIndex = trimmedLine.indexOf("=");
    if (equalIndex > 0) {
      const key = trimmedLine.slice(0, equalIndex).trim();
      let value = trimmedLine.slice(equalIndex + 1).trim();

      // Remove quotes from string values
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (currentSection) {
        result[currentSection][key] = value;
      } else {
        result[key] = value;
      }
    }
  }

  return result;
}

/**
 * Update TOML file with new configuration
 * Adds or updates the [install.security] section
 */
export function updateTOMLFile(filePath, config) {
  let content = "";

  if (fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, "utf-8");
  }

  // Check if [install.security] section exists
  const securitySectionRegex = /^\[install\.security\]/m;
  const scannerLineRegex = /^scanner\s*=\s*["']?[^"'\n]*["']?/m;

  if (!securitySectionRegex.test(content)) {
    // Add the section if it doesn't exist
    content = content.trim();
    if (content && !content.endsWith("\n")) {
      content += "\n";
    }
    content += "\n[install.security]\n";
  }

  // Add or update scanner configuration
  if (config["install.security"] && config["install.security"].scanner) {
    const scannerValue = config["install.security"].scanner;
    const scannerLine = `scanner = "${scannerValue}"`;

    if (scannerLineRegex.test(content)) {
      // Replace existing scanner line
      content = content.replace(scannerLineRegex, scannerLine);
    } else {
      // Add scanner line after [install.security] section
      content = content.replace(
        /^\[install\.security\]/m,
        `[install.security]\n${scannerLine}`
      );
    }
  }

  fs.writeFileSync(filePath, content.trim() + os.EOL, "utf-8");
}

/**
 * Remove a TOML section and all its content
 */
export function removeTOMLSection(filePath, sectionName) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split(/[\r\n\u2028\u2029]+/);
  const updatedLines = [];
  let inTargetSection = false;
  let skipNextEmptyLine = false;

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Check if this is the target section
    if (trimmedLine === `[${sectionName}]`) {
      inTargetSection = true;
      skipNextEmptyLine = true;
      continue;
    }

    // Check if we're entering a new section
    if (
      trimmedLine.startsWith("[") &&
      trimmedLine.endsWith("]") &&
      trimmedLine !== `[${sectionName}]`
    ) {
      inTargetSection = false;
      skipNextEmptyLine = false;
    }

    // Skip empty line immediately after removed section
    if (skipNextEmptyLine && trimmedLine === "") {
      skipNextEmptyLine = false;
      continue;
    }

    skipNextEmptyLine = false;

    // Keep line if we're not in the target section
    if (!inTargetSection) {
      updatedLines.push(line);
    }
  }

  // Remove trailing empty lines
  while (
    updatedLines.length > 0 &&
    updatedLines[updatedLines.length - 1].trim() === ""
  ) {
    updatedLines.pop();
  }

  fs.writeFileSync(
    filePath,
    updatedLines.join(os.EOL) + (updatedLines.length > 0 ? os.EOL : ""),
    "utf-8"
  );
}

/**
 * Remove a specific scanner from the [install.security] section
 * Only removes the section if it contains the specified scanner
 */
export function removeScannerFromTOMLSection(filePath, scannerValue) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const tomlData = readTOMLFile(filePath);

  // Check if install.security section exists and contains our scanner
  if (
    tomlData["install.security"] &&
    tomlData["install.security"].scanner === scannerValue
  ) {
    // Remove the entire section since it only contains our scanner
    removeTOMLSection(filePath, "install.security");
  }

  // If the section doesn't exist or contains a different scanner, do nothing
}
