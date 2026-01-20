#!/bin/sh

# Downloads and installs safe-chain, depending on the operating system and architecture
#
# Usage with "curl -fsSL {url} | sh" --> See README.md

set -e  # Exit on error

# Configuration
VERSION="${SAFE_CHAIN_VERSION:-}"  # Will be fetched from latest release if not set
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
# For legacy versions (when SAFE_CHAIN_VERSION is set), use 'linux' instead of 'linuxstatic'
detect_os() {
    case "$(uname -s)" in
        Linux*)
            if [ -n "$SAFE_CHAIN_VERSION" ]; then
                echo "linux"
            else
                echo "linuxstatic"
            fi
            ;;
        Darwin*)                echo "macos" ;;
        MINGW*|MSYS*|CYGWIN*)   echo "win" ;;
        *)                      error "Unsupported operating system: $(uname -s)" ;;
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

# Get currently installed version of safe-chain
get_installed_version() {
    if ! command_exists safe-chain; then
        echo ""
        return
    fi

    # Extract version from "Current safe-chain version: X.Y.Z" output
    installed_version=$(safe-chain -v 2>/dev/null | grep "Current safe-chain version:" | sed -E 's/.*: (.*)/\1/')
    echo "$installed_version"
}

# Check if the requested version is already installed
is_version_installed() {
    requested_version="$1"
    installed_version=$(get_installed_version)

    if [ -z "$installed_version" ]; then
        return 1  # Not installed
    fi

    # Strip leading 'v' from versions if present for comparison
    requested_clean=$(echo "$requested_version" | sed 's/^v//')
    installed_clean=$(echo "$installed_version" | sed 's/^v//')

    if [ "$requested_clean" = "$installed_clean" ]; then
        return 0  # Same version installed
    else
        return 1  # Different version installed
    fi
}

# Fetch latest release version tag from GitHub
fetch_latest_version() {
    # Try using GitHub API to get the latest release tag
    if command_exists curl; then
        latest_version=$(curl -fsSL "https://api.github.com/repos/AikidoSec/safe-chain/releases/latest" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')
    elif command_exists wget; then
        latest_version=$(wget -qO- "https://api.github.com/repos/AikidoSec/safe-chain/releases/latest" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')
    else
        error "Neither curl nor wget found. Please install one of them or set SAFE_CHAIN_VERSION environment variable."
    fi

    if [ -z "$latest_version" ]; then
        error "Failed to fetch latest version from GitHub API. Please set SAFE_CHAIN_VERSION environment variable."
    fi

    echo "$latest_version"
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
remove_npm_installation() {
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
remove_volta_installation() {
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

# Check and uninstall nvm-managed package if present across all Node versions
remove_nvm_installation() {
    # This script is run in sh shell for greatest compatibility.
    # Because nvm is usually setup in bash/zsh/fish startup scripts, we need to source it.
    # Otherwise it won't be available in sh.
    if [ -s "$HOME/.nvm/nvm.sh" ]; then
        # Source nvm to make it available in this script
        . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
    elif [ -s "$NVM_DIR/nvm.sh" ]; then
        . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
    fi

    # Check if nvm is now available
    if ! command_exists nvm; then
        return
    fi

    nvm_versions=$(nvm list 2>/dev/null | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+' || echo "")

    if [ -z "$nvm_versions" ]; then
        return
    fi

    # Track if we found any installations
    found_installation=false
    uninstall_failed=false
    current_version=$(nvm current 2>/dev/null || echo "")

    # Check each version for safe-chain installation
    for version in $nvm_versions; do
        # Check if this version has safe-chain installed
        # Use nvm exec to run npm list in the context of that Node version
        if nvm exec "$version" npm list -g @aikidosec/safe-chain >/dev/null 2>&1; then
            if [ "$found_installation" = false ]; then
                info "Detected nvm installation(s) of @aikidosec/safe-chain"
                info "Uninstalling from all Node versions..."
                found_installation=true
            fi

            info "  Removing from Node $version..."
            if nvm exec "$version" npm uninstall -g @aikidosec/safe-chain >/dev/null 2>&1; then
                info "  Successfully uninstalled from Node $version"
            else
                warn "  Failed to uninstall from Node $version"
                uninstall_failed=true
            fi
        fi
    done

    # Restore original Node version if it was set
    if [ -n "$current_version" ] && [ "$current_version" != "none" ] && [ "$current_version" != "system" ]; then
        nvm use "$current_version" >/dev/null 2>&1 || true
    fi

    # If any uninstall failed, error out instead of continuing
    if [ "$uninstall_failed" = true ]; then
        error "Failed to uninstall @aikidosec/safe-chain from all nvm Node versions. Please uninstall manually and try again."
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
                warn "--include-python is deprecated and ignored. Python ecosystem is now included by default."
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

    # Parse command-line arguments
    parse_arguments "$@"

    # Show deprecation warning if SAFE_CHAIN_VERSION is set
    if [ -n "$SAFE_CHAIN_VERSION" ]; then
        warn "SAFE_CHAIN_VERSION environment variable is deprecated."
        warn ""
        warn "Please use direct download URLs for version pinning instead:"
        warn ""
        if [ "$USE_CI_SETUP" = "true" ]; then
            warn "  curl -fsSL https://github.com/AikidoSec/safe-chain/releases/download/${SAFE_CHAIN_VERSION}/install-safe-chain.sh | sh -s -- --ci"
        else
            warn "  curl -fsSL https://github.com/AikidoSec/safe-chain/releases/download/${SAFE_CHAIN_VERSION}/install-safe-chain.sh | sh"
        fi
        warn ""
    fi

    # Fetch latest version if VERSION is not set
    if [ -z "$VERSION" ]; then
        info "Fetching latest release version..."
        VERSION=$(fetch_latest_version)
    fi

    # Check if the requested version is already installed
    if is_version_installed "$VERSION"; then
        info "safe-chain ${VERSION} is already installed"
        exit 0
    fi

    # Build installation message
    INSTALL_MSG="Installing safe-chain ${VERSION}"
    if [ "$USE_CI_SETUP" = "true" ]; then
        INSTALL_MSG="${INSTALL_MSG} in ci"
    fi

    info "$INSTALL_MSG"

    # Check for existing safe-chain installation through nvm, volta, or npm
    remove_npm_installation
    remove_volta_installation
    remove_nvm_installation

    # Detect platform
    OS=$(detect_os)
    ARCH=$(detect_arch)
    if [ "$OS" = "win" ]; then
        BINARY_NAME="safe-chain-${OS}-${ARCH}.exe"
    else
        BINARY_NAME="safe-chain-${OS}-${ARCH}"
    fi

    info "Detected platform: ${OS}-${ARCH}"

    # Create installation directory
    if [ ! -d "$INSTALL_DIR" ]; then
        info "Creating installation directory: $INSTALL_DIR"
        mkdir -p "$INSTALL_DIR" || error "Failed to create directory $INSTALL_DIR"
    fi

    # Download binary
    DOWNLOAD_URL="${REPO_URL}/releases/download/${VERSION}/${BINARY_NAME}"
    TEMP_FILE="${INSTALL_DIR}/${BINARY_NAME}"

    info "Downloading from: $DOWNLOAD_URL"
    download "$DOWNLOAD_URL" "$TEMP_FILE"

    # Rename and make executable
    if [ "$OS" = "win" ]; then
        FINAL_FILE="${INSTALL_DIR}/safe-chain.exe"
    else
        FINAL_FILE="${INSTALL_DIR}/safe-chain"
    fi
    mv "$TEMP_FILE" "$FINAL_FILE" || error "Failed to move binary to $FINAL_FILE"
    if [ "$OS" != "win" ]; then
        chmod +x "$FINAL_FILE" || error "Failed to make binary executable"
    fi

    info "Binary installed to: $FINAL_FILE"

    # Download safechain-proxy
    if [ "$OS" = "macos" ] || [ "$OS" = "linux" ] || [ "$OS" = "linuxstatic" ]; then
        info "Downloading safechain-proxy..."

        if [ "$OS" = "macos" ]; then
            if [ "$ARCH" = "arm64" ]; then
                PROXY_URL="https://github.com/AikidoSec/safechain-internals/releases/download/v0.0.7-linux-proxy-bins/safechain-proxy-darwin-arm64"
            else
                PROXY_URL="https://github.com/AikidoSec/safechain-internals/releases/download/v0.0.7-linux-proxy-bins/safechain-proxy-darwin-amd64"
            fi
        else
            # Linux (both linux and linuxstatic)
            if [ "$ARCH" = "x64" ]; then
                PROXY_URL="https://github.com/AikidoSec/safechain-internals/releases/download/v0.0.7-linux-proxy-bins/safechain-proxy-linux-amd64"
            else
                PROXY_URL="https://github.com/AikidoSec/safechain-internals/releases/download/v0.0.7-linux-proxy-bins/safechain-proxy-linux-arm64"
            fi
        fi

        if [ -n "$PROXY_URL" ]; then
            PROXY_FILE="${INSTALL_DIR}/safechain-proxy"
            download "$PROXY_URL" "$PROXY_FILE"
            chmod +x "$PROXY_FILE" || error "Failed to make proxy executable"
            info "Proxy installed to: $PROXY_FILE"
        fi
    fi

    # Build setup command based on arguments
    SETUP_CMD="setup"
    SETUP_ARGS=""

    if [ "$USE_CI_SETUP" = "true" ]; then
        SETUP_CMD="setup-ci"
    fi

    # Execute safe-chain setup
    info "Running safe-chain $SETUP_CMD $SETUP_ARGS..."
    if ! "$FINAL_FILE" $SETUP_CMD $SETUP_ARGS; then
        warn "safe-chain was installed but setup encountered issues."
        warn "You can run 'safe-chain $SETUP_CMD $SETUP_ARGS' manually later."
    fi
}

main "$@"
