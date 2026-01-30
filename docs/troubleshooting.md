# Troubleshooting

This guide helps you diagnose and resolve common issues with Aikido Safe Chain.

## Verification & Diagnostics

### Check Installation

```bash
# Check version
safe-chain --version
```

### Verify Shell Integration

Run the verification command for your package manager:

```bash
npm safe-chain-verify
pnpm safe-chain-verify
pip safe-chain-verify
uv safe-chain-verify

# Any other supported package manager: {packagemanager} safe-chain-verify
```

Expected output: `OK: Safe-chain works!`

### Test Malware Blocking

Verify that malware detection is working:

**For JavaScript/Node.js:**

```bash
npm install safe-chain-test
```

**For Python:**

```bash
pip3 install safe-chain-pi-test
```

These test packages are flagged as malware and should be blocked by Safe Chain.

**If the test package installs successfully instead of being blocked**, see [Malware Not Being Blocked](#malware-not-being-blocked) below.

### Logging Options

Use logging flags or environment variables to get more information:

```bash
# Verbose mode - detailed diagnostic output for troubleshooting
npm install express --safe-chain-logging=verbose

# Or set it globally for all commands in your session
export SAFE_CHAIN_LOGGING=verbose
npm install express

# Silent mode - suppress all output except malware blocking
npm install express --safe-chain-logging=silent
```

## Common Issues

### Malware Not Being Blocked

**Symptom:** Test malware packages (like `safe-chain-test`) install successfully when they should be blocked

**Most Common Cause:** The package is cached in your package manager's local store

Safe-chain blocks malicious packages by intercepting network requests to package registries using its proxy.

When a package is already cached locally, the package manager skips downloading it from the registry, which bypasses the proxy.

**Resolution Steps:**

1. **Clear your package manager's cache:**

   ```bash
   # For npm
   npm cache clean --force

   # For pnpm
   pnpm store prune

   # For yarn (classic)
   yarn cache clean

   # For yarn (berry/v2+)
   yarn cache clean --all

   # For bun
   bun pm cache rm
   ```

   > **⚠️ Warning:** Cache clearing is safe but will remove all cached packages. Subsequent installations will need to re-download packages. In CI/CD environments or monorepos, this may affect build times.

2. **Clean local installation artifacts:**

   ```bash
   # Remove node_modules if you want a completely fresh install
   rm -rf node_modules
   ```

3. **Re-test malware blocking:**

   ```bash
   npm install safe-chain-test    # Should be blocked
   ```

### Shell Aliases Not Working After Installation

**Symptom:** Running `npm` shows regular npm instead of safe-chain wrapped version

**First step:** Restart your terminal (most common fix)

**Verify it's working:**

```bash
type npm
```

Should show: `npm is a function`

**If still not working:**

Check that your startup file sources safe-chain scripts from `~/.safe-chain/scripts/`:

- Bash: `~/.bashrc`
- Zsh: `~/.zshrc`
- Fish: `~/.config/fish/config.fish`
- PowerShell: `$PROFILE`

### "Command Not Found: safe-chain"

**Symptom:** Binary not found in PATH

**First step:** Restart your terminal

**Check PATH:**

```bash
echo $PATH
```

Should include `~/.safe-chain/bin`

**If persists:** Re-run the installation script

### PowerShell Execution Policy Blocks Scripts (Windows)

**Symptom:** When opening PowerShell, you see an error like:

```
. : File C:\Users\<username>\Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1 cannot be loaded because
running scripts is disabled on this system.
CategoryInfo          : SecurityError: (:) [], PSSecurityException
FullyQualifiedErrorId : UnauthorizedAccess
```

**Cause:** Windows PowerShell's default execution policy (`Restricted`) blocks all script execution, including safe-chain's initialization script that's sourced from your PowerShell profile.

**Resolution:**

1. **Set the execution policy to allow local scripts:**

   Open PowerShell as Administrator and run:

   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned
   ```

   This allows:
   - Local scripts (like safe-chain's) to run without signing
   - Downloaded scripts to run only if signed by a trusted publisher

2. **Restart PowerShell** and verify the error is resolved.

> **Note:** `RemoteSigned` is Microsoft's recommended execution policy for client computers. It provides a good balance between security and usability.

### Shell Aliases Persist After Uninstallation

**Symptom:** safe-chain commands still active after running uninstall script

**Steps:**

1. Run `safe-chain teardown` (if binary still exists)
2. Restart your terminal
3. If still present, manually edit shell config files:
   - Bash: `~/.bashrc`
   - Zsh: `~/.zshrc`
   - Fish: `~/.config/fish/config.fish`
   - PowerShell: `$PROFILE`
4. Remove lines that source scripts from `~/.safe-chain/scripts/`
5. Restart terminal again

## Manual Verification Steps

### Check Installation Status

```bash
# Check installation location (helps identify if installed via npm or as standalone binary)
which safe-chain

# Verify binary exists
ls ~/.safe-chain/bin/safe-chain

# Check version
safe-chain --version

# Test shell integration
type npm
type pip
```

**Expected `which` output:**

- Standalone binary (correct): `~/.safe-chain/bin/safe-chain` or `/Users/<username>/.safe-chain/bin/safe-chain`
- npm global (outdated): path containing `node_modules` or nvm version paths

If `which` shows an npm installation, see [Check for Conflicting Installations](#check-for-conflicting-installations).

### Check Shell Integration

```bash
# Which shell you're using
echo $SHELL

# Check if startup file sources safe-chain
# For Bash:
grep safe-chain ~/.bashrc

# For Zsh:
grep safe-chain ~/.zshrc

# For Fish:
grep safe-chain ~/.config/fish/config.fish

# Verify scripts exist
ls ~/.safe-chain/scripts/
```

### Check for Conflicting Installations

> **Note:** The install/uninstall scripts automatically detect and remove conflicting installations, but you can manually check:

```bash
# Check npm global
npm list -g @aikidosec/safe-chain

# Check Volta
volta list safe-chain

# Check nvm (all versions)
for version in $(nvm list | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+'); do
  nvm exec "$version" npm list -g @aikidosec/safe-chain 2>/dev/null && echo "Found in $version"
done
```

## Manual Cleanup

> **Note:** The install and uninstall scripts automatically handle these cleanup steps. Use these manual commands only if automatic cleanup fails.

### Remove npm Global Installation

```bash
npm uninstall -g @aikidosec/safe-chain
```

### Remove Volta Installation

```bash
volta uninstall @aikidosec/safe-chain
```

### Remove nvm Installations (All Versions)

```bash
# Automated approach
for version in $(nvm list | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+'); do
  nvm exec "$version" npm uninstall -g @aikidosec/safe-chain
done

# Or manual per version
nvm use <version>
npm uninstall -g @aikidosec/safe-chain
```

### Clean Shell Configuration Files

Manually remove safe-chain entries from:

- Bash: `~/.bashrc`
- Zsh: `~/.zshrc`
- Fish: `~/.config/fish/config.fish`
- PowerShell: `$PROFILE`

Look for and remove:

- Lines sourcing from `~/.safe-chain/scripts/`
- Any safe-chain related function definitions

### Remove Installation Directory

```bash
rm -rf ~/.safe-chain
```

## Getting More Information

### Enable Verbose Logging

Get detailed diagnostic output using a CLI flag or environment variable:

```bash
# Using CLI flag
npm install express --safe-chain-logging=verbose
pip install requests --safe-chain-logging=verbose

# Using environment variable (applies to all commands)
export SAFE_CHAIN_LOGGING=verbose
npm install express
```

### Report Issues

If you encounter problems:

1. Visit [GitHub Issues](https://github.com/AikidoSec/safe-chain/issues)
2. Include:
   - Operating system and version
   - Shell type and version
   - `safe-chain --version` output
   - Output from verification commands
   - Verbose logs of the failing command (add the `--safe-chain-logging=verbose` argument)
