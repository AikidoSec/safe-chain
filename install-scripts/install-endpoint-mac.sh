#!/bin/sh

# Downloads and installs Aikido Endpoint Protection on macOS
#
# Usage: curl -fsSL <url> | sudo sh -s -- --token <TOKEN>

set -e  # Exit on error

# Configuration
INSTALL_URL="https://github.com/AikidoSec/safechain-internals/releases/download/v1.3.4/EndpointProtection.pkg"
DOWNLOAD_SHA256="f2ea55588d42e4aa17545ad787f46dd36001009e2ddb9655c497b1a36edf3581"
TOKEN_FILE="/tmp/aikido_endpoint_token.txt"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Helper functions
info() {
    printf "${GREEN}[INFO]${NC} %s\n" "$1"
}

error() {
    printf "${RED}[ERROR]${NC} %s\n" "$1" >&2
    exit 1
}

# Download file
download() {
    url="$1"
    dest="$2"

    if command -v curl >/dev/null 2>&1; then
        curl -fsSL "$url" -o "$dest" || error "Failed to download from $url"
    elif command -v wget >/dev/null 2>&1; then
        wget -q "$url" -O "$dest" || error "Failed to download from $url"
    else
        error "Neither curl nor wget found. Please install one of them."
    fi
}

# Verify SHA256 checksum
verify_checksum() {
    file="$1"
    expected="$2"

    actual=$(shasum -a 256 "$file" | awk '{ print $1 }')

    if [ "$actual" != "$expected" ]; then
        error "Checksum verification failed. Expected: $expected, Got: $actual"
    fi

    info "Checksum verified successfully."
}

# Cleanup temporary files
cleanup() {
    if [ -f "$PKG_FILE" ]; then
        rm -f "$PKG_FILE"
    fi
    if [ -f "$TOKEN_FILE" ]; then
        rm -f "$TOKEN_FILE"
    fi
}

# Parse command-line arguments
parse_arguments() {
    TOKEN=""

    while [ $# -gt 0 ]; do
        case "$1" in
            --token)
                if [ -z "${2:-}" ]; then
                    error "--token requires a value"
                fi
                TOKEN="$2"
                shift 2
                ;;
            *)
                error "Unknown argument: $1"
                ;;
        esac
    done
}

# Main installation
main() {
    parse_arguments "$@"

    # 1. Check if we're running on macOS
    if [ "$(uname -s)" != "Darwin" ]; then
        error "This script is only supported on macOS."
    fi

    # Check if we're running as root
    if [ "$(id -u)" -ne 0 ]; then
        error "Root privileges required. Please re-run with sudo, e.g.: curl -fsSL <url> | sudo sh -s -- --token <TOKEN>"
    fi

    # Check if token is provided via command argument
    if [ -z "$TOKEN" ]; then
        error "Token is required. Pass it with --token <TOKEN> or enter it when prompted."
    fi

    # Validate token to prevent injection
    case "$TOKEN" in
        *[\"\'\;\`\$\ ]*)
            error "Invalid token format. Token must not contain quotes, semicolons, backticks, dollar signs, or whitespace."
            ;;
    esac

    # 2. Download and verify checksum
    PKG_FILE=$(mktemp /tmp/AikidoEndpoint.XXXXXX.pkg)
    trap cleanup EXIT

    info "Downloading Aikido Endpoint Protection..."
    download "$INSTALL_URL" "$PKG_FILE"

    info "Verifying checksum..."
    verify_checksum "$PKG_FILE" "$DOWNLOAD_SHA256"

    # 3. Write token to file for the installer
    printf "%s" "$TOKEN" > "$TOKEN_FILE"

    # 4. Install the package
    info "Installing Aikido Endpoint Protection..."
    installer -pkg "$PKG_FILE" -target /

    info "Aikido Endpoint Protection installed successfully!"
}

main "$@"
