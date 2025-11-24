# Installer Script Templates

This directory contains bash scripts and HTML templates used during the macOS installer build process.

## Bash Scripts

### `preinstall.sh`

Executed **before** installation begins.

**Purpose**: Stop any existing Aikido Safe Chain agent that may be running.

**Actions**:
- Checks if LaunchDaemon plist exists
- Unloads (stops) the existing agent if found

**Exit Code**: Always exits 0 (allows installation to proceed even if agent wasn't running)

---

### `postinstall.sh`

Executed **after** files are installed to the system.

**Purpose**: Complete the agent setup and start the service.

**Actions**:
1. Create log directory (`/var/log/aikido-safe-chain/`)
2. Install CA certificate to system keychain
3. Configure system-wide HTTP/HTTPS proxy settings
4. Load and start the LaunchDaemon

**Exit Code**: Exits 0 on success. Prints warnings but continues if non-critical steps fail.

---

### `uninstall.sh`

Standalone uninstaller script.

**Purpose**: Completely remove the Aikido Safe Chain agent and restore system to pre-installation state.

**Actions**:
1. Stop and remove LaunchDaemon
2. Remove CA certificate from system keychain
3. Restore original proxy settings
4. Delete all installed files and logs

**Location**: 
- Included in installer: `/Library/Application Support/AikidoSafety/uninstall.sh`
- Also copied to: `build/uninstall.sh` (for distribution)

**Usage**:
```bash
sudo bash "/Library/Application Support/AikidoSafety/uninstall.sh"
```

---

## HTML Templates

### `welcome.html`

Displayed on the **Welcome** screen of the macOS installer.

**Purpose**: Introduce the user to Aikido Safe Chain and explain what the installer will do.

**Content**:
- Product introduction
- Brief description of system-wide protection
- List of required administrator privileges:
  - Certificate installation
  - Proxy configuration
  - LaunchDaemon installation

---

### `conclusion.html`

Displayed on the **Installation Complete** screen after successful installation.

**Purpose**: Confirm successful installation and provide next steps.

**Content**:
- Success confirmation
- Explanation that protection is now active
- Uninstall instructions
- Support link to aikido.dev

---

## XML Configuration

### `distribution.xml`

Defines the macOS installer package structure and flow.

**Purpose**: Configure the `productbuild` installer with:
- Package metadata (title, organization)
- Installation requirements (domains, scripts)
- User interface flow (welcome, conclusion screens)
- Package references and dependencies

**Key Elements**:
- `<title>`: Installer window title
- `<organization>`: Package identifier prefix
- `<welcome>` / `<conclusion>`: HTML files to display
- `<pkg-ref>`: Reference to component package
- `<choices-outline>`: Installation options (currently non-customizable)

**Note**: This file is used by `productbuild` to create the final .pkg installer.

---

### `dev.aikido.safe-chain.plist`

macOS LaunchDaemon configuration file.

**Purpose**: Configure the system daemon that runs the Safe Chain agent at boot.

**Key Elements**:
- `<key>Label</key>`: Unique identifier (dev.aikido.safe-chain)
- `<key>ProgramArguments</key>`: Node.js executable + agent script path
- `<key>RunAtLoad</key>`: Start daemon on system boot
- `<key>KeepAlive</key>`: Restart policy (on unexpected exit only)
- `<key>StandardOutPath</key>` / `<key>StandardErrorPath</key>`: Log file paths
- `<key>EnvironmentVariables</key>`: NODE_ENV=production
- `<key>WorkingDirectory</key>`: Agent execution directory

**Installation Location**: `/Library/LaunchDaemons/dev.aikido.safe-chain.plist`

**Note**: This file is used by `createLaunchDaemonPlist()` to configure the auto-start daemon.

---

## Editing Templates

These templates are copied during the build process. To modify installer content:

1. **Edit the template** in `installer/scripts/templates/`
   - Bash scripts: `*.sh`
   - HTML files: `*.html`
   - XML configuration: `distribution.xml`, `dev.aikido.safe-chain.plist`
2. **Rebuild the installer**: `npm run build`
3. **Test changes**: `npm run test-install`

**Note**: The build process reads these files and includes them in the `.pkg` installer. Changes to templates require rebuilding the installer package.

## Variables Used

All scripts use consistent path variables:

- `INSTALL_DIR`: `/Library/Application Support/AikidoSafety`
- `LAUNCHD_PLIST`: `/Library/LaunchDaemons/dev.aikido.safe-chain.plist`
- `LOG_DIR`: `/var/log/aikido-safe-chain`

These match the values defined in `installer/agent/settings.js`.

## Error Handling

All scripts use:
- `set -e`: Exit immediately if any command fails
- `|| true`: Allow specific commands to fail without stopping execution
- `2>/dev/null`: Suppress error messages for expected failures

This ensures reliable installation while providing graceful degradation for non-critical failures.
