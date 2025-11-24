# Safe Chain macOS Agent Architecture

## Overview

The Safe Chain macOS Agent is a long-running background service that provides system-wide malware protection for package installations without requiring CLI wrapper commands. It intercepts all HTTP/HTTPS traffic through a MITM proxy installed at the system level.

## Components

### 1. Agent Daemon (`agent-daemon/`)

**Purpose**: Long-running Node.js process that runs the MITM proxy server

**Key Features**:
- Runs as a macOS LaunchDaemon (system-level, starts at boot)
- Fixed port (default: 8765) for predictable system configuration
- Reuses existing `registryProxy` code from CLI implementation
- Logs to `/var/log/aikido-safe-chain/`
- PID file at `/var/run/aikido-safe-chain.pid`
- Graceful shutdown handling (SIGTERM, SIGINT)

**Technology**:
- Node.js (bundled with installer)
- Existing proxy infrastructure from `packages/safe-chain/src/registryProxy/`

### 2. System Configuration Manager (`system-config/`)

**Purpose**: Manages macOS system-level settings for proxy and certificates

**Responsibilities**:

#### Certificate Management
- Generates root CA certificate (reuses `certUtils.js`)
- Installs CA to system keychain: `/Library/Keychains/System.keychain`
- Uses `security add-trusted-cert -d -r trustRoot` command
- Certificate path: `/Library/Application Support/AikidoSafety/certs/ca-cert.pem`
- Removal: `security delete-certificate -c "Aikido Safe Chain CA"`

#### Proxy Configuration
- Configures all active network interfaces (Wi-Fi, Ethernet, USB, etc.)
- Uses `networksetup` commands:
  - `-setwebproxy` for HTTP
  - `-setsecurewebproxy` for HTTPS
- Proxy server: `127.0.0.1:8765`
- Bypass domains: `*.local, 169.254/16, 127.0.0.1, localhost`
- Stores original settings for restoration on uninstall

### 3. LaunchDaemon Configuration (`launchd/`)

**Plist**: `/Library/LaunchDaemons/dev.aikido.safe-chain.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>dev.aikido.safe-chain</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Library/Application Support/AikidoSafety/bin/node</string>
        <string>/Library/Application Support/AikidoSafety/agent/index.js</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>
    <key>StandardOutPath</key>
    <string>/var/log/aikido-safe-chain/stdout.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/aikido-safe-chain/stderr.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>NODE_ENV</key>
        <string>production</string>
    </dict>
</dict>
</plist>
```

**Management Commands**:
```bash
# Load (start) daemon
sudo launchctl load /Library/LaunchDaemons/dev.aikido.safe-chain.plist

# Unload (stop) daemon
sudo launchctl unload /Library/LaunchDaemons/dev.aikido.safe-chain.plist

# Check status
sudo launchctl list | grep aikido
```

### 4. Installer Package (`build/`)

**Type**: macOS `.pkg` installer created with `pkgbuild` and `productbuild`

**Structure**:
```
AikidoSafeChain.pkg
├── Distribution.xml          # Installer flow definition
├── Resources/
│   ├── welcome.html         # Welcome screen
│   ├── conclusion.html      # Success screen
│   └── background.png       # Installer background
└── Packages/
    └── aikido-safe-chain.pkg
        ├── Payload/         # Files to install
        │   └── Library/Application Support/AikidoSafety/
        │       ├── bin/node                    # Bundled Node.js
        │       ├── agent/                      # Agent code
        │       │   ├── index.js
        │       │   ├── node_modules/
        │       │   └── package.json
        │       └── certs/                      # CA certificates
        └── Scripts/
            ├── preinstall          # Stop existing agent
            ├── postinstall         # Install cert, configure proxy, start agent
            └── preuninstall        # Cleanup (for uninstaller)
```

**Install Scripts**:

`postinstall`:
```bash
#!/bin/bash
set -e

INSTALL_DIR="/Library/Application Support/AikidoSafety"
LAUNCHD_PLIST="/Library/LaunchDaemons/dev.aikido.safe-chain.plist"

# Create log directory
mkdir -p /var/log/aikido-safe-chain
chmod 755 /var/log/aikido-safe-chain

# Install certificate to system keychain
security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain \
  "$INSTALL_DIR/certs/ca-cert.pem"

# Configure system proxy for all network services
"$INSTALL_DIR/bin/node" "$INSTALL_DIR/agent/configure-proxy.js" --install

# Load and start the LaunchDaemon
launchctl load -w "$LAUNCHD_PLIST"

exit 0
```

### 5. Uninstaller (`uninstall.sh`)

Distributed as standalone script:
```bash
#!/bin/bash
# Aikido Safe Chain Uninstaller

# Stop and remove daemon
launchctl unload /Library/LaunchDaemons/dev.aikido.safe-chain.plist
rm /Library/LaunchDaemons/dev.aikido.safe-chain.plist

# Remove certificate
security delete-certificate -c "Aikido Safe Chain CA" /Library/Keychains/System.keychain

# Restore proxy settings
/Library/Application\ Support/AikidoSafety/bin/node \
  /Library/Application\ Support/AikidoSafety/agent/configure-proxy.js --uninstall

# Remove files
rm -rf "/Library/Application Support/AikidoSafety"
rm -rf /var/log/aikido-safe-chain

echo "Aikido Safe Chain has been uninstalled."
```

## Installation Flow

1. **User runs installer**: `AikidoSafeChain.pkg`
2. **Preinstall**: Stops any running agent
3. **Install Payload**: Copies files to `/Library/Application Support/AikidoSafety/`
4. **Postinstall**:
   - Installs CA certificate to system keychain (requires admin password)
   - Configures system proxy settings for all network interfaces
   - Loads LaunchDaemon (starts agent)
5. **Agent starts**: Proxy server listens on port 8765
6. **System ready**: All package manager traffic (npm, pip, etc.) flows through proxy

## Security Considerations

### Permissions
- Installer requires admin privileges (standard for system modifications)
- LaunchDaemon runs as root (needed for privileged port and system access)
- Agent process drops privileges where possible

### Code Signing
- `.pkg` installer must be signed with Developer ID Installer certificate
- Agent binary should be notarized for Gatekeeper approval
- Prevents "unidentified developer" warnings

### Network Security
- CA certificate private key secured at `/Library/Application Support/AikidoSafety/certs/`
- Only accessible by root user (chmod 600)
- Certificate validity: 10 years (regenerates on expiry)

### Bypass Mechanisms
- Respects NO_PROXY environment variable
- Bypass domains configured in system proxy settings
- Emergency disable: `sudo launchctl unload /Library/LaunchDaemons/dev.aikido.safe-chain.plist`

## Compatibility

### macOS Versions
- **Minimum**: macOS 10.15 (Catalina)
- **Recommended**: macOS 12+ (Monterey and newer)
- **Tested**: macOS 13 (Ventura), macOS 14 (Sonoma)

### Architecture
- **Intel (x64)**: Fully supported
- **Apple Silicon (arm64)**: Fully supported (universal binary)

### Network Interfaces
- Wi-Fi
- Ethernet
- USB Ethernet
- Thunderbolt Ethernet
- VPN connections (limited - VPN may override proxy settings)

## Monitoring & Debugging

### Logs
```bash
# View agent logs
tail -f /var/log/aikido-safe-chain/stdout.log
tail -f /var/log/aikido-safe-chain/stderr.log

# Check daemon status
sudo launchctl list | grep aikido

# View system log
log show --predicate 'process == "aikido-safe-chain"' --last 1h
```

### Health Checks
```bash
# Check if proxy is responding
curl -x http://127.0.0.1:8765 http://example.com

# Verify certificate installation
security find-certificate -c "Aikido Safe Chain CA" /Library/Keychains/System.keychain

# Check proxy configuration
networksetup -getwebproxy Wi-Fi
networksetup -getsecurewebproxy Wi-Fi
```

### Troubleshooting
- **Agent not starting**: Check `/var/log/aikido-safe-chain/stderr.log`
- **Certificate errors**: Verify cert in Keychain Access > System > Certificates
- **Proxy not working**: Check `networksetup` output, verify port 8765 is listening
- **Performance issues**: Monitor CPU/memory in Activity Monitor

## Build Process

```bash
# From installer/ directory
npm install
npm run build

# Outputs:
# - build/AikidoSafeChain.pkg (signed installer)
# - build/uninstall.sh (uninstaller script)
```

## Future Enhancements

1. **GUI Application**: macOS menu bar app for status and configuration
2. **Selective Filtering**: UI to enable/disable protection per-application
3. **Statistics Dashboard**: View blocked packages, scan history
4. **Auto-Updates**: Self-updating agent via signed delta updates
5. **Enterprise Management**: MDM integration, centralized configuration
6. **Network Adapter Detection**: Auto-configure new network interfaces
