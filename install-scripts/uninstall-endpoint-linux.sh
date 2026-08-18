#!/bin/sh

# Uninstalls Aikido Endpoint Protection on Linux
#
# Usage: curl -fsSL <url> | sudo sh

set -e  # Exit on error

# Configuration
# Must match the package name in the .deb control file and the .rpm spec
PKG_NAME="aikido-endpoint-protection"

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

# Check whether the package is installed through dpkg
deb_installed() {
    command -v dpkg-query >/dev/null 2>&1 || return 1
    dpkg-query -W -f='${Status}' "$PKG_NAME" 2>/dev/null | grep -q "install ok installed"
}

# Check whether the package is installed through rpm
rpm_installed() {
    command -v rpm >/dev/null 2>&1 || return 1
    rpm -q "$PKG_NAME" >/dev/null 2>&1
}

# Main uninstallation
main() {
    # Check if we're running on Linux
    if [ "$(uname -s)" != "Linux" ]; then
        error "This script is only supported on Linux."
    fi

    # Check if we're running as root
    if [ "$(id -u)" -ne 0 ]; then
        error "Root privileges required. Please re-run with sudo, e.g.: curl -fsSL <url> | sudo sh"
    fi

    info "Looking for Aikido Endpoint Protection installation..."

    if deb_installed; then
        info "Uninstalling Aikido Endpoint Protection..."
        if command -v apt-get >/dev/null 2>&1; then
            DEBIAN_FRONTEND=noninteractive apt-get -y purge "$PKG_NAME"
        else
            dpkg --purge "$PKG_NAME"
        fi
    elif rpm_installed; then
        info "Uninstalling Aikido Endpoint Protection..."
        if command -v dnf >/dev/null 2>&1; then
            dnf -y remove "$PKG_NAME"
        elif command -v yum >/dev/null 2>&1; then
            yum -y remove "$PKG_NAME"
        else
            rpm -e "$PKG_NAME"
        fi
    else
        error "Aikido Endpoint Protection does not appear to be installed."
    fi

    info "Aikido Endpoint Protection uninstalled successfully!"
}

main "$@"
