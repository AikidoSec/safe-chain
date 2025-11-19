#!/bin/bash
set -e

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
INSTALLER_ROOT="${SCRIPT_DIR}/.."

echo "=== Building Safe Chain Installer for macOS ==="

# Ensure we are in the installer directory
cd "${INSTALLER_ROOT}"

# Install dependencies
echo "Installing build dependencies..."
npm install

# Build the binary and installer using the Node.js build script
echo "Building binary and installer..."
node build.js --platform=macos

echo "Done."
