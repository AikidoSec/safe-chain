# Aikido Safe Chain - macOS Installer

This directory contains the build system for creating a macOS system-wide agent installer for Aikido Safe Chain.

## Overview

The installer creates a `.pkg` package that installs a long-running background service (LaunchDaemon) on macOS. This provides system-wide malware protection without requiring CLI wrapper commands.

## Features

- **System-wide Protection**: Intercepts all package manager traffic (npm, pip, etc.) regardless of how they're invoked
- **LaunchDaemon Integration**: Runs automatically at system boot
- **Certificate Management**: Installs trusted CA certificate in system keychain
- **Proxy Configuration**: Configures system HTTP/HTTPS proxy settings for all network interfaces
- **Uninstaller**: Clean removal of all components

## Requirements

- **macOS**: 10.15 (Catalina) or newer
- **Node.js**: 18+ (bundled with installer)
- **Admin Privileges**: Required for installation
- **Developer Tools**: Required to build the installer (pkgbuild, productbuild)

## Building the Installer

### Prerequisites

```bash
# Install dependencies
npm install

# Ensure Xcode Command Line Tools are installed
xcode-select --install
```

### Configuration

Agent settings can be configured in `agent/settings.js` before building:

- **`AGENT_PORT`**: Proxy server port (default: 8765)
- **`PROXY_HOST`**: Proxy bind address (default: 127.0.0.1)
- **`BYPASS_DOMAINS`**: Domains to bypass proxy (default: *.local, 169.254/16, etc.)

Other settings include file paths for logs, PID file, and configuration.

### Build Process

```bash
# Build the complete installer package
npm run build
```

This will:
1. Bundle Node.js runtime
2. Bundle agent code and dependencies
3. Generate CA certificates
4. Create LaunchDaemon plist
5. Create installer scripts (pre/postinstall)
6. Build .pkg using pkgbuild and productbuild
7. Sign the package (if certificates available)

### Output

- `build/AikidoSafeChain.pkg` - Installer package
- `build/uninstall.sh` - Uninstaller script

## Installation

```bash
# Install the package
sudo installer -pkg build/AikidoSafeChain.pkg -target /

# Or double-click AikidoSafeChain.pkg in Finder
```

The installer will:
1. Install files to `/Library/Application Support/AikidoSafety/`
2. Install CA certificate to system keychain
3. Configure system proxy settings
4. Start the agent daemon

## Uninstallation

```bash
# Run the uninstaller
sudo bash /Library/Application\ Support/AikidoSafety/uninstall.sh

# Or use the copy in build/
sudo bash build/uninstall.sh
```

This will:
1. Stop and remove the LaunchDaemon
2. Remove CA certificate from system keychain
3. Restore original proxy settings
4. Delete all installed files

## Directory Structure

```
installer/
├── package.json                 # Build dependencies
├── ARCHITECTURE.md              # Detailed architecture documentation
├── README.md                    # This file
├── scripts/
│   ├── darwin-build-installer.js  # Main build script (macOS only)
│   └── templates/               # Bash script templates
│       ├── postinstall.sh       # Post-installation script
│       ├── preinstall.sh        # Pre-installation script
│       └── uninstall.sh         # Uninstaller script
├── agent/
│   ├── package.json             # Agent dependencies
│   ├── index.js                 # Main agent daemon
│   ├── configure-proxy.js       # Proxy configuration manager
│   └── settings.js              # Centralized agent settings
├── build/                       # Build output (created by npm run build)
│   ├── AikidoSafeChain.pkg     # Installer package
│   └── uninstall.sh            # Uninstaller script
└── dist/                        # Intermediate build files (created during build)
    ├── payload/                # Files to be installed
    └── scripts/                # Installer scripts
```

## Installed Components

After installation, the following components are installed:

### Files

```
/Library/Application Support/AikidoSafety/
├── bin/
│   └── node                     # Bundled Node.js runtime
├── agent/
│   ├── index.js                 # Agent daemon
│   ├── configure-proxy.js       # Proxy configuration tool
│   ├── settings.js              # Configuration settings
│   ├── lib/                     # Shared code from safe-chain
│   └── node_modules/            # Dependencies
├── certs/
│   ├── ca-cert.pem             # CA certificate (public)
│   └── ca-key.pem              # CA private key (0600 permissions)
└── uninstall.sh                 # Uninstaller script

/Library/LaunchDaemons/
└── dev.aikido.safe-chain.plist # LaunchDaemon configuration

/var/log/aikido-safe-chain/
├── stdout.log                   # Agent output logs
└── stderr.log                   # Agent error logs

/var/run/
└── aikido-safe-chain.pid       # PID file (when running)
```

### System Configuration

- **Keychain**: CA certificate installed in `/Library/Keychains/System.keychain`
- **Proxy**: All network interfaces configured with HTTP/HTTPS proxy at `127.0.0.1:8765`
- **LaunchDaemon**: Auto-starts at boot, runs as root

## Testing

### Test Installation (Development)

```bash
# Build and install
npm run build
npm run test-install

# Check if agent is running
sudo launchctl list | grep aikido
tail -f /var/log/aikido-safe-chain/stdout.log

# Test malware blocking
npm install safe-chain-test

# Uninstall
npm run test-uninstall
```

### Manual Testing

```bash
# Check proxy configuration
networksetup -getwebproxy Wi-Fi
networksetup -getsecurewebproxy Wi-Fi

# Check certificate
security find-certificate -c "Aikido Safe Chain CA" /Library/Keychains/System.keychain

# Check if proxy is responding
curl -x http://127.0.0.1:8765 http://example.com

# View logs
tail -f /var/log/aikido-safe-chain/stdout.log
tail -f /var/log/aikido-safe-chain/stderr.log

# Check daemon status
sudo launchctl list dev.aikido.safe-chain
```

## Troubleshooting

### Agent Not Starting

```bash
# Check logs
tail -100 /var/log/aikido-safe-chain/stderr.log

# Check if port is in use
lsof -i :8765

# Manually start for debugging
sudo /Library/Application\ Support/AikidoSafety/bin/node \
     /Library/Application\ Support/AikidoSafety/agent/index.js
```

### Proxy Not Working

```bash
# Verify proxy configuration
/Library/Application\ Support/AikidoSafety/bin/node \
  /Library/Application\ Support/AikidoSafety/agent/configure-proxy.js --status

# Reconfigure proxy
sudo /Library/Application\ Support/AikidoSafety/bin/node \
  /Library/Application\ Support/AikidoSafety/agent/configure-proxy.js --install
```

### Certificate Issues

```bash
# Verify certificate is installed
security find-certificate -c "Aikido Safe Chain CA" /Library/Keychains/System.keychain

# View certificate details
security find-certificate -p -c "Aikido Safe Chain CA" /Library/Keychains/System.keychain | \
  openssl x509 -text -noout

# Reinstall certificate
sudo security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain \
  /Library/Application\ Support/AikidoSafety/certs/ca-cert.pem
```

## Code Signing (for Distribution)

To sign the installer for distribution:

1. **Obtain a Developer ID Installer certificate** from Apple Developer Program
2. **Install the certificate** in your keychain
3. **Build will automatically sign** if certificate is available

```bash
# Check for signing identities
security find-identity -v -p codesigning

# Build (will auto-sign if certificate found)
npm run build

# Verify signature
pkgutil --check-signature build/AikidoSafeChain.pkg
```

For notarization (required for Gatekeeper approval):

```bash
# Submit for notarization
xcrun notarytool submit build/AikidoSafeChain.pkg \
  --apple-id "your-apple-id@example.com" \
  --team-id "YOUR_TEAM_ID" \
  --password "app-specific-password"

# Wait for approval, then staple
xcrun stapler staple build/AikidoSafeChain.pkg
```

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed architecture documentation.

## License

AGPL-3.0-or-later - See LICENSE file in repository root.
