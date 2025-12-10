#!/bin/sh

# Downloads and installs safe-chain, depending on the operating system and architecture
#
# Usage with "curl -fsSL {url} | sh" --> See README.md

set -e  # Exit on error

# Configuration
INSTALL_DIR="${HOME}/.safe-chain/bin"

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

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
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

# Main uninstallation
main() {
    SAFE_CHAIN_LOCATION="$INSTALL_DIR/safe-chain"

    if [ -x "$SAFE_CHAIN_LOCATION" ]; then
        info "Running safe-chain teardown..."
        "$SAFE_CHAIN_LOCATION" teardown || warn "safe-chain teardown encountered issues, continuing with uninstallation..."
    elif command_exists safe-chain; then
        info "Running safe-chain teardown..."
        safe-chain teardown || warn "safe-chain teardown encountered issues, continuing with uninstallation..."
    else
        warn "safe-chain command not found. Proceeding with uninstallation."
    fi

    remove_npm_installation
    remove_volta_installation

    # Remove install dir recursively if it exists
    if [ -d "$INSTALL_DIR" ]; then
        info "Removing installation directory $INSTALL_DIR"
        rm -rf "$INSTALL_DIR" || error "Failed to remove $INSTALL_DIR"
    else
        info "Installation directory $INSTALL_DIR does not exist. Nothing to remove."
    fi
}

main "$@"
