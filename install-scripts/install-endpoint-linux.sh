#!/bin/sh

# Downloads and installs Aikido Endpoint Protection on Linux
#
# Usage: curl -fsSL <url> | sh -s -- --token <TOKEN> [--headless] [--container|--ci-cd]
#    or: curl -fsSL <url> | AIKIDO_TOKEN=<TOKEN> sh -s -- [--headless] [--container|--ci-cd]
#
#   --token      enrollment token. Optional when AIKIDO_TOKEN is set, or when this
#                machine already has a token. --token wins over AIKIDO_TOKEN.
#   --headless   server/VM: no tray, skip GTK/WebKit Recommends, still L4, reboot required
#   --container  run *inside* a container: no tray, skip Recommends, L7, ephemeral secrets, no reboot
#                not for Docker/Jenkins hosts; those use --headless
#   --ci-cd      deprecated alias for --container

# The body below is fed to this on stdin, so a `curl | sh` run can re-run it as root
run_as_root() {
    if [ "$(id -u)" -eq 0 ]; then
        sh -s -- "$@"
        return
    fi

    # sudo/doas reset the environment, so the inputs read from it are passed through
    for escalate in sudo doas; do
        if command -v "$escalate" >/dev/null 2>&1; then
            "$escalate" env AIKIDO_TOKEN="${AIKIDO_TOKEN:-}" AIKIDO_PACKAGE_FILE="${AIKIDO_PACKAGE_FILE:-}" sh -s -- "$@"
            return
        fi
    done

    printf '\033[0;31m[ERROR]\033[0m %s\n' "Root privileges required. Install sudo or doas, or re-run as root." >&2
    return 1
}

run_as_root "$@" <<'AIKIDO_EOF'
set -e  # Exit on error

# Configuration
BASE_URL="https://github.com/AikidoSec/safechain-internals/releases/download/v1.10.40"

# Checksums per artifact, keyed by asset name
SHA256_AMD64_DEB="12e9a64a470f15f66fbd18d6937d19f6280c6f131d8420f44129256cb8e092e1"
SHA256_ARM64_DEB="d259d1b6a89a3d6ef218e5355f1368234a82a37307bd18ce090a29cfed559fd5"
SHA256_AMD64_EL9_RPM="d058a7e9879a78bdee7c60272bb024eb31bd208efc9d77a6a9125fb9c2630468"
SHA256_ARM64_EL9_RPM="fbfed590e581d7cad271bb749bef6748db0c9247ee52534b370c42eac1fd5ac1"
SHA256_AMD64_EL10_RPM="4e232839a2d381086982155c466c303a5f500f93d56ee583fd7ea788cb5817e5"
SHA256_ARM64_EL10_RPM="cea6c57afb8aa13a08c9410ee85ade3775b6bf1f71cd3803f593db911a5e6901"
SHA256_AMD64_ARCH_PKG="558d9c8026293de1bce6b7b9ef936679877496ab415b857b241b568de8745e0c"

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

is_wsl1() {
    awk '$2 == "/" && ($3 == "wslfs" || $3 == "lxfs") { found = 1 }
         END { exit !found }' /proc/mounts 2>/dev/null && return 0
    grep -qE -- '-Microsoft$' /proc/sys/kernel/osrelease 2>/dev/null
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

    if command -v sha256sum >/dev/null 2>&1; then
        actual=$(sha256sum "$file" | awk '{ print $1 }')
    elif command -v shasum >/dev/null 2>&1; then
        actual=$(shasum -a 256 "$file" | awk '{ print $1 }')
    elif command -v openssl >/dev/null 2>&1; then
        actual=$(openssl dgst -sha256 "$file" | awk '{ print $NF }')
    else
        error "No SHA256 tool found. Please install coreutils or openssl."
    fi

    if [ "$actual" != "$expected" ]; then
        error "Checksum verification failed. Expected: $expected, Got: $actual"
    fi

    info "Checksum verified successfully."
}

# Cleanup temporary files
cleanup() {
    if [ "${PKG_FILE_OWNED:-}" = "1" ] && [ -n "${PKG_FILE:-}" ] && [ -f "$PKG_FILE" ]; then
        rm -f "$PKG_FILE"
    fi
}

# Parse command-line arguments
parse_arguments() {
    TOKEN=""
    CONTAINER=""
    HEADLESS=""

    while [ $# -gt 0 ]; do
        case "$1" in
            --token)
                if [ -z "${2:-}" ]; then
                    error "--token requires a value"
                fi
                case "$2" in
                    --*)
                        error "--token requires a value"
                        ;;
                esac
                TOKEN="$2"
                shift 2
                ;;
            --container)
                CONTAINER="1"
                shift
                ;;
            --ci-cd)
                # Deprecated alias for --container
                CONTAINER="1"
                shift
                ;;
            --headless)
                HEADLESS="1"
                shift
                ;;
            *)
                error "Unknown argument: $1. This installer stops so it does not install the wrong flavor."
                ;;
        esac
    done
}

# Determine amd64 or arm64
detect_arch() {
    machine=$(uname -m)

    case "$machine" in
        x86_64|amd64)
            ARCH="amd64"
            ;;
        aarch64|arm64)
            ARCH="arm64"
            ;;
        *)
            error "Unsupported architecture: $machine. Only amd64 (x86_64) and arm64 (aarch64) are supported."
            ;;
    esac
}

# Map the RHEL-family major version to the Enterprise Linux build we ship
detect_el_version() {
    major="${OS_VERSION_ID%%.*}"

    case "$major" in
        9)
            EL_VERSION="el9"
            ;;
        10)
            EL_VERSION="el10"
            ;;
        *)
            error "Unsupported RPM-based distribution: ${OS_ID:-unknown} ${OS_VERSION_ID:-unknown}. Only Enterprise Linux 9 and 10 are supported."
            ;;
    esac
}

# Determine deb or rpm, and for rpm the Enterprise Linux version
detect_package_type() {
    OS_ID=""
    OS_ID_LIKE=""
    OS_VERSION_ID=""

    if [ -r /etc/os-release ]; then
        # shellcheck disable=SC1091
        . /etc/os-release
        OS_ID="${ID:-}"
        OS_ID_LIKE="${ID_LIKE:-}"
        OS_VERSION_ID="${VERSION_ID:-}"
    fi

    case "$OS_ID" in
        debian|ubuntu|linuxmint|pop|raspbian|elementary|kali|zorin|neon)
            PKG_TYPE="deb"
            return
            ;;
        rhel|centos|rocky|almalinux|ol|oracle|scientific|cloudlinux|virtuozzo)
            PKG_TYPE="rpm"
            detect_el_version
            return
            ;;
        amzn)
            # Amazon Linux 2023 tracks the el9 glibc; older releases are too old
            if [ "$OS_VERSION_ID" = "2023" ]; then
                PKG_TYPE="rpm"
                EL_VERSION="el9"
                return
            fi
            error "Unsupported distribution: Amazon Linux ${OS_VERSION_ID:-unknown}. Only Amazon Linux 2023 is supported."
            ;;
        fedora)
            # Fedora 44 is the tested release. It installs the el10 RPM.
            # A later major stays refused until that version is tested.
            if [ "$OS_VERSION_ID" = "44" ]; then
                PKG_TYPE="rpm"
                EL_VERSION="el10"
                return
            fi
            error "Unsupported distribution: Fedora ${OS_VERSION_ID:-unknown}. Only Fedora 44 is supported."
            ;;
        arch)
            PKG_TYPE="pacman"
            return
            ;;
    esac

    # Unrecognized distribution: fall back to the family it declares
    case " $OS_ID_LIKE " in
        *" debian "*)
            PKG_TYPE="deb"
            return
            ;;
        *" rhel "*|*" centos "*|*" fedora "*)
            PKG_TYPE="rpm"
            detect_el_version
            return
            ;;
        *" arch "*)
            PKG_TYPE="pacman"
            return
            ;;
    esac

    # No usable os-release: a Debian-based system is still safe to detect from dpkg
    if command -v dpkg >/dev/null 2>&1; then
        PKG_TYPE="deb"
        return
    fi

    error "Unsupported distribution: ${OS_ID:-unknown} ${OS_VERSION_ID:-unknown}. Only Debian-based, Enterprise Linux 9/10 and Arch-based distributions are supported."
}

# Resolve the asset to download and its expected checksum
detect_package() {
    detect_arch
    detect_package_type

    if [ "$PKG_TYPE" = "deb" ]; then
        ASSET="EndpointProtection-${ARCH}.deb"
        command -v dpkg >/dev/null 2>&1 || error "dpkg not found, which is required to install the .deb package."
    elif [ "$PKG_TYPE" = "pacman" ]; then
        [ "$ARCH" = "amd64" ] || error "Unsupported architecture for Arch Linux: $ARCH. Only amd64 (x86_64) is supported."
        ASSET="EndpointProtection-${ARCH}.pkg.tar.zst"
        command -v pacman >/dev/null 2>&1 || error "pacman not found, which is required to install the Arch Linux package."
    else
        ASSET="EndpointProtection-${ARCH}.${EL_VERSION}.rpm"
        command -v rpm >/dev/null 2>&1 || error "rpm not found, which is required to install the .rpm package."
    fi

    case "$ASSET" in
        EndpointProtection-amd64.deb) EXPECTED_SHA256="$SHA256_AMD64_DEB" ;;
        EndpointProtection-arm64.deb) EXPECTED_SHA256="$SHA256_ARM64_DEB" ;;
        EndpointProtection-amd64.el9.rpm) EXPECTED_SHA256="$SHA256_AMD64_EL9_RPM" ;;
        EndpointProtection-arm64.el9.rpm) EXPECTED_SHA256="$SHA256_ARM64_EL9_RPM" ;;
        EndpointProtection-amd64.el10.rpm) EXPECTED_SHA256="$SHA256_AMD64_EL10_RPM" ;;
        EndpointProtection-arm64.el10.rpm) EXPECTED_SHA256="$SHA256_ARM64_EL10_RPM" ;;
        EndpointProtection-amd64.pkg.tar.zst) EXPECTED_SHA256="$SHA256_AMD64_ARCH_PKG" ;;
        *) error "No package available for this system ($ASSET)." ;;
    esac

    if [ -z "$EXPECTED_SHA256" ]; then
        error "No checksum configured for $ASSET. Please report this to Aikido support."
    fi
}

# Enrollment file written by the package. An upgrade leaves it in place, so a
# new token is required only when this file has none.
ENDPOINT_CONFIG="/var/lib/aikidosecurity/endpoint-protection/run/config.json"

# Non-empty token in config.json, compact {"token":"x"} or the daemon's
# pretty-printed "token": "x". "token":"" is not enrolled.
config_has_token() {
    [ -f "$1" ] || return 1
    grep -Eq '"token"[[:space:]]*:[[:space:]]*"[^"[:space:]]' "$1"
}

# Run the package manager with the settings the installer reads from the environment.
# --container/--ci-cd wins if headless is also set: do not also export AIKIDO_HEADLESS.
# Export both env names so this script works against today's v1.8.1 package
# (AIKIDO_CI_CD only) and the next package (AIKIDO_CONTAINER, alias AIKIDO_CI_CD).
# Drop inherited mode vars first so sudo -E / ambient env cannot override the CLI.
run_installer() {
    unset AIKIDO_CONTAINER AIKIDO_HEADLESS AIKIDO_CI_CD
    if [ -n "$CONTAINER" ]; then
        AIKIDO_TOKEN="$TOKEN" AIKIDO_CONTAINER="$CONTAINER" AIKIDO_CI_CD="$CONTAINER" "$@"
    elif [ -n "$HEADLESS" ]; then
        AIKIDO_TOKEN="$TOKEN" AIKIDO_HEADLESS="$HEADLESS" "$@"
    else
        AIKIDO_TOKEN="$TOKEN" "$@"
    fi
}

# Install the .deb through apt-get so hard dependencies get resolved. apt is the
# only step here that pulls Recommends, so that is what headless and container
# runs opt out of.
install_deb() {
    if ! command -v apt-get >/dev/null 2>&1; then
        run_installer dpkg -i "$PKG_FILE"
        return
    fi

    export DEBIAN_FRONTEND=noninteractive
    if ! apt-get update; then
        info "Could not refresh package lists. Continuing with cached lists."
    fi

    # --reinstall so re-running for the same version still applies the token
    set -- apt-get install -y --reinstall
    if [ -n "$CONTAINER" ] || [ -n "$HEADLESS" ]; then
        set -- "$@" --no-install-recommends
    fi

    run_installer "$@" "$PKG_FILE"
}

# True when the file matches a version that is already installed
rpm_already_installed() {
    nevra=$(rpm -qp --queryformat '%{NAME}-%{VERSION}-%{RELEASE}.%{ARCH}' "$PKG_FILE" 2>/dev/null) || return 1
    [ -n "$nevra" ] || return 1
    rpm -q "$nevra" >/dev/null 2>&1
}

# Install the .rpm through dnf/yum so hard dependencies get resolved. Weak
# dependencies are dnf's doing, so headless and container runs turn them off.
install_rpm() {
    if command -v dnf >/dev/null 2>&1; then
        set -- dnf
    elif command -v yum >/dev/null 2>&1; then
        set -- yum
    else
        # --replacepkgs so re-running for the same version still applies the token
        run_installer rpm -Uvh --replacepkgs "$PKG_FILE"
        return
    fi

    # dnf skips the scriptlets for an already installed version and refuses to
    # reinstall one that is absent, so the verb depends on what is on the system
    if rpm_already_installed; then
        set -- "$@" reinstall -y
    else
        set -- "$@" install -y
    fi

    if [ -n "$CONTAINER" ] || [ -n "$HEADLESS" ]; then
        set -- "$@" --setopt=install_weak_deps=False
    fi

    run_installer "$@" "$PKG_FILE"
}

# pacman -U reinstalls the same version, so re-running still applies the token.
install_pacman() {
    run_installer pacman -U --noconfirm "$PKG_FILE"
}

# Main installation
main() {
    parse_arguments "$@"

    # 1. Check if we're running on Linux
    if [ "$(uname -s)" != "Linux" ]; then
        error "This script is only supported on Linux."
    fi

    if is_wsl1; then
        error "WSL1 is not supported. Aikido Endpoint Protection requires WSL2."
    fi

    [ -z "$TOKEN" ] && TOKEN="${AIKIDO_TOKEN:-}"

    if [ -z "$TOKEN" ]; then
        if config_has_token "$ENDPOINT_CONFIG"; then
            info "Already enrolled. Keeping the existing token."
        else
            error "Token is required. Pass it with --token <TOKEN> or set AIKIDO_TOKEN."
        fi
    fi

    # Validate token to prevent injection
    case "$TOKEN" in
        *[\"\'\;\`\$\ ]*)
            error "Invalid token format. Token must not contain quotes, semicolons, backticks, dollar signs, or whitespace."
            ;;
    esac

    # 2. Determine which package this system needs
    detect_package
    info "Detected ${OS_ID:-unknown} ${OS_VERSION_ID:-unknown} ($ARCH), using $ASSET"

    if [ -n "${AIKIDO_PACKAGE_FILE:-}" ]; then
        case "$AIKIDO_PACKAGE_FILE" in
            *://*)
                error "AIKIDO_PACKAGE_FILE must be a local file, not a URL."
                ;;
        esac
        if [ ! -f "$AIKIDO_PACKAGE_FILE" ] || [ ! -r "$AIKIDO_PACKAGE_FILE" ]; then
            error "Package file not found or not readable: $AIKIDO_PACKAGE_FILE"
        fi
        case "$AIKIDO_PACKAGE_FILE" in
            *.deb)
                [ "$PKG_TYPE" = "deb" ] || error "AIKIDO_PACKAGE_FILE is a .deb but this system needs $ASSET."
                ;;
            *.rpm)
                [ "$PKG_TYPE" = "rpm" ] || error "AIKIDO_PACKAGE_FILE is an RPM but this system needs $ASSET."
                ;;
            *.pkg.tar.zst)
                [ "$PKG_TYPE" = "pacman" ] || error "AIKIDO_PACKAGE_FILE is an Arch Linux package but this system needs $ASSET."
                ;;
            *)
                error "AIKIDO_PACKAGE_FILE must be a .deb, .rpm or .pkg.tar.zst (got: $AIKIDO_PACKAGE_FILE)"
                ;;
        esac
        PKG_FILE="$AIKIDO_PACKAGE_FILE"
        PKG_FILE_OWNED=0
        info "Using local package $PKG_FILE (checksum skipped)"
    else
        # 3. Download and verify checksum
        PKG_FILE=$(mktemp "/tmp/AikidoEndpoint.XXXXXX.${ASSET#*.}")
        PKG_FILE_OWNED=1
        trap cleanup EXIT

        info "Downloading Aikido Endpoint Protection..."
        download "${BASE_URL}/${ASSET}" "$PKG_FILE"
        chmod 644 "$PKG_FILE"

        info "Verifying checksum..."
        verify_checksum "$PKG_FILE" "$EXPECTED_SHA256"
    fi

    # 4. Install the package
    info "Installing Aikido Endpoint Protection..."
    if [ "$PKG_TYPE" = "deb" ]; then
        install_deb
    elif [ "$PKG_TYPE" = "pacman" ]; then
        install_pacman
    else
        install_rpm
    fi

    info "Aikido Endpoint Protection installed successfully!"
}

main "$@"
AIKIDO_EOF
