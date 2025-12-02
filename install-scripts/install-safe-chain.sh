#!/bin/sh

# Downloads and installs safe-chain, depending on the operating system and architecture
#
# Usage with "curl -fsSL {url} | sh" --> See README.md

set -e  # Exit on error

# Configuration
VERSION="${SAFE_CHAIN_VERSION:-v0.0.7-binaries-beta}"
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

# Check and uninstall npm global package if present
check_npm_installation() {
    if ! command_exists npm; then
        return
    fi

    # Check if safe-chain is installed as an npm global package
    if npm list -g @aikidosec/safe-chain >/dev/null 2>&1; then
        info "Detected npm global installation of @aikidosec/safe-chain"
        info "Uninstalling npm version before installing binary version..."

        if npm uninstall -g @aikidosec/safe-chain >/dev/null 2>&1; then
            info "Successfully uninstalled npm version"
        else
            warn "Failed to uninstall npm version automatically"
            warn "Please run: npm uninstall -g @aikidosec/safe-chain"
        fi
    fi
}

# Check and uninstall Volta-managed package if present
check_volta_installation() {
    if ! command_exists volta; then
        return
    fi

    # Volta manages global packages in its own directory
    # Check if safe-chain is installed via Volta
    if volta list safe-chain >/dev/null 2>&1; then
        info "Detected Volta installation of @aikidosec/safe-chain"
        info "Uninstalling Volta version before installing binary version..."

        if volta uninstall @aikidosec/safe-chain >/dev/null 2>&1; then
            info "Successfully uninstalled Volta version"
        else
            warn "Failed to uninstall Volta version automatically"
            warn "Please run: volta uninstall @aikidosec/safe-chain"
        fi
    fi
}

# Parse command-line arguments
parse_arguments() {
    for arg in "$@"; do
        case "$arg" in
            --ci)
                USE_CI_SETUP=true
                ;;
            --include-python)
                INCLUDE_PYTHON=true
                ;;
            *)
                error "Unknown argument: $arg"
                ;;
        esac
    done
}

# Main installation
main() {
    # Initialize argument flags
    USE_CI_SETUP=false
    INCLUDE_PYTHON=false

    # Parse command-line arguments
    parse_arguments "$@"

    info "Installing safe-chain ${VERSION}..."

    # Check for existing npm installation
    check_npm_installation

    # Check for existing Volta installation
    check_volta_installation

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

    # Build setup command based on arguments
    SETUP_CMD="setup"
    SETUP_ARGS=""

    if [ "$USE_CI_SETUP" = "true" ]; then
        SETUP_CMD="setup-ci"
    fi

    if [ "$INCLUDE_PYTHON" = "true" ]; then
        SETUP_ARGS="--include-python"
    fi

    # Execute safe-chain setup
    info "Running safe-chain $SETUP_CMD $SETUP_ARGS..."
    if ! "$FINAL_FILE" $SETUP_CMD $SETUP_ARGS; then
        warn "safe-chain was installed but setup encountered issues."
        warn "You can run 'safe-chain $SETUP_CMD $SETUP_ARGS' manually later."
    fi
}

main "$@"
