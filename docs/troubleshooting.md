# Troubleshooting

This guide helps you diagnose and resolve common issues with Aikido Safe Chain.

## Verification & Diagnostics

**Check Installation**

```bash
# Check version
safe-chain --version
```

**Verify Shell Integration**

Run the verification command for your package manager:

```bash
npm safe-chain-verify
pnpm safe-chain-verify
```

```
Expected output: `OK: Safe-chain works!`
```

**Test Malware Blocking**

Verify that malware detection is working:
```
npm install safe-chain-test
```

These test packages are flagged as malware and should be blocked by Safe Chain.

**If the test package installs successfully instead of being blocked**, see Malware Not Being Blocked below.

## Logging Options

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

**Resolution Steps**

1) Clear your package manager's cache

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

2) Clean local installation artifacts:

```bash
# Remove node_modules if you want a completely fresh install
rm -rf node_modules
```

3) Re-test malware blocking:

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

* Bash: `~/.bashrc`
* Zsh: `~/.zshrc`
* Fish: `~/.config/fish/config.fish`
* PowerShell: `$PROFILE`

### AI Agent or Non-Interactive Install Is Not Protected

**Symptom:** Safe Chain works in your terminal, but an install started by Claude Code, Codex, Cursor, a CI job, or another subprocess does not show Safe Chain output.

**Cause:** `safe-chain setup` installs shell functions through startup files such as `.bashrc` and `.zshrc`. Non-interactive subprocesses may not source those files, so they resolve the original package-manager binary instead.

**Resolution:** Create executable shims and put them first in the agent's `PATH`:

```bash
safe-chain setup-ci
export PATH="$HOME/.safe-chain/shims:$HOME/.safe-chain/bin:$PATH"

command -v npm
# Expected: ~/.safe-chain/shims/npm

npm safe-chain-verify
# Expected: OK: Safe-chain works!
```

Start the agent from the configured shell or add the same `PATH` prefix to its environment settings. Make sure the agent invokes `npm`, `uv`, `pip`, or another supported package manager by name. Absolute paths such as `/usr/bin/npm` bypass the shims.

### Agent Sandbox Blocks Package Installs

**Symptoms:** A package install fails with a loopback connection error, proxy error, or a permission error such as `listen EPERM`.

**Cause:** Safe Chain starts a local proxy on `127.0.0.1` using an ephemeral port. The package manager connects to that proxy through the `HTTPS_PROXY` setting supplied by Safe Chain. Some agent sandboxes block processes from binding or connecting to loopback by default.

**Resolution:** Configure the sandbox to allow the agent process to bind and connect to `127.0.0.1` or `localhost`. Keep other sandbox restrictions enabled. Safe Chain binds the proxy only to loopback, so it is not exposed to the local network.

After changing the sandbox configuration, run:

```bash
npm safe-chain-verify
```

The expected output is `OK: Safe-chain works!`.

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

**Resolution**

1) Set the execution policy to allow local scripts

Open PowerShell as Administrator and run:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned
```

This allows:

* Local scripts (like safe-chain's) to run without signing
* Downloaded scripts to run only if signed by a trusted publisher

2) Restart PowerShell and verify the error is resolved.

> [!IMPORTANT]
> `RemoteSigned` is Microsoft's recommended execution policy for client computers. It provides a good balance between security and usability.

### Shell Aliases Persist After Uninstallation

**Symptom:** safe-chain commands still active after running uninstall script

**Steps**

1. Run `safe-chain teardown` (if binary still exists)
2. Restart your terminal
3. If still present, manually edit shell config files:
   * Bash: `~/.bashrc`
   * Zsh: `~/.zshrc`
   * Fish: `~/.config/fish/config.fish`
   * PowerShell: `$PROFILE`
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

* Standalone binary (correct): `~/.safe-chain/bin/safe-chain` or `/Users/<username>/.safe-chain/bin/safe-chain`
* npm global (outdated): path containing `node_modules` or nvm version paths

If `which` shows an npm installation, see Check for Conflicting Installations.

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

### Manual Cleanup

> **Note:** The install and uninstall scripts automatically handle these cleanup steps. Use these manual commands only if automatic cleanup fails.

#### Remove npm Global Installation

```bash
npm uninstall -g @aikidosec/safe-chain
```

#### Remove Volta Installation

```bash
volta uninstall @aikidosec/safe-chain
```

#### Remove nvm Installations (All Versions)

```bash
# Automated approach
for version in $(nvm list | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+'); do
  nvm exec "$version" npm uninstall -g @aikidosec/safe-chain
done

# Or manual per version
nvm use <version>
npm uninstall -g @aikidosec/safe-chain
```

#### Clean Shell Configuration Files

Manually remove safe-chain entries from:

* Bash: `~/.bashrc`
* Zsh: `~/.zshrc`
* Fish: `~/.config/fish/config.fish`
* PowerShell: `$PROFILE`

Look for and remove:

* Lines sourcing from `~/.safe-chain/scripts/`
* Any safe-chain related function definitions

#### Remove Installation Directory

```bash
rm -rf ~/.safe-chain
```
