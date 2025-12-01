#!/bin/sh

# Downloads and installs safe-chain, depending on the operating system and architecture
# Usage: curl -fsSL https://raw.githubusercontent.com/AikidoSec/safe-chain/main/install-scripts/install-safe-chain.sh | sh
#    or: wget -qO- https://raw.githubusercontent.com/AikidoSec/safe-chain/main/install-scripts/install-safe-chain.sh | sh

set -e  # Exit on error

# Configuration
VERSION="${SAFE_CHAIN_VERSION:-v0.0.3-binaries-beta}"
INSTALL_DIR="${HOME}/.safe-chain/bin"
REPO_URL="https://github.com/AikidoSec/safe-chain"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
info() {
    printf "${GREEN}[INFO]${NC} %s\n" "$1"
}

warn() {
    printf "${YELLOW}[WARN]${NC} %s\n" "$1"
}

error() {
    printf "${RED}[ERROR]${NC} %s\n" "$1" >&2
    exit 1
}

# Detect OS
detect_os() {
    case "$(uname -s)" in
        Linux*)     echo "linux" ;;
        Darwin*)    echo "macos" ;;
        *)          error "Unsupported operating system: $(uname -s)" ;;
    esac
}

# Detect architecture
detect_arch() {
    case "$(uname -m)" in
        x86_64|amd64)   echo "x64" ;;
        aarch64|arm64)  echo "arm64" ;;
        *)              error "Unsupported architecture: $(uname -m)" ;;
    esac
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Download file
download() {
    url="$1"
    dest="$2"

    if command_exists curl; then
        curl -fsSL "$url" -o "$dest" || error "Failed to download from $url"
    elif command_exists wget; then
        wget -q "$url" -O "$dest" || error "Failed to download from $url"
    else
        error "Neither curl nor wget found. Please install one of them."
    fi
}

# Main installation
main() {
    info "Installing safe-chain ${VERSION}..."

    # Detect platform
    OS=$(detect_os)
    ARCH=$(detect_arch)
    BINARY_NAME="safe-chain-${OS}-${ARCH}"

    info "Detected platform: ${OS}-${ARCH}"

    # Create installation directory
    if [ ! -d "$INSTALL_DIR" ]; then
        info "Creating installation directory: $INSTALL_DIR"
        mkdir -p "$INSTALL_DIR" || error "Failed to create directory $INSTALL_DIR"
    fi

    # Download binary
    DOWNLOAD_URL="${REPO_URL}/releases/download/${VERSION}/${BINARY_NAME}"
    TEMP_FILE="${INSTALL_DIR}/${BINARY_NAME}"
    FINAL_FILE="${INSTALL_DIR}/safe-chain"

    info "Downloading from: $DOWNLOAD_URL"
    download "$DOWNLOAD_URL" "$TEMP_FILE"

    # Rename and make executable
    mv "$TEMP_FILE" "$FINAL_FILE" || error "Failed to move binary to $FINAL_FILE"
    chmod +x "$FINAL_FILE" || error "Failed to make binary executable"

    info "Binary installed to: $FINAL_FILE"

    # Execute safe-chain setup
    info "Running safe-chain setup..."
    if "$FINAL_FILE" setup; then
        info "✓ safe-chain installed and configured successfully!"
    else
        warn "safe-chain was installed but setup encountered issues."
        warn "You can run 'safe-chain setup' manually later."
    fi

    info "Installation complete!"
}

main
