#!/bin/sh

# Uninstalls SafeChain Ultimate endpoint on macOS
#
# Usage: curl -fsSL <url> | sudo sh

set -e  # Exit on error

# Configuration
UNINSTALL_SCRIPT="/Library/Application Support/AikidoSecurity/SafeChainUltimate/scripts/uninstall"

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

# Main uninstallation
main() {
    # Check if we're running on macOS
    if [ "$(uname -s)" != "Darwin" ]; then
        error "This script is only supported on macOS."
    fi

    # Check if we're running as root
    if [ "$(id -u)" -ne 0 ]; then
        error "Root privileges required. Please re-run with sudo, e.g.: curl -fsSL <url> | sudo sh"
    fi

    # Check if the uninstall script exists
    if [ ! -f "$UNINSTALL_SCRIPT" ]; then
        error "SafeChain Ultimate does not appear to be installed (uninstall script not found)."
    fi

    info "Uninstalling SafeChain Ultimate..."
    "$UNINSTALL_SCRIPT"

    info "SafeChain Ultimate uninstalled successfully!"
}

main "$@"
