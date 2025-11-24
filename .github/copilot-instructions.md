# Aikido Safe Chain - AI Coding Agent Instructions

## Project Overview

Safe Chain is a security tool that prevents malware installation by wrapping package managers (npm, yarn, pnpm, bun, pip) with a MITM proxy that checks packages against Aikido's malware database in real-time. It works through shell integration that aliases package manager commands to Safe Chain wrappers.

## Architecture

### Core Components

1. **Shell Integration** (`src/shell-integration/`)
   - `setup.js` / `teardown.js` / `setup-ci.js`: Modify shell startup files to wrap package manager commands
   - `startup-scripts/`: Shell-specific scripts (POSIX, Fish, PowerShell) that define wrapper functions
   - Wrappers check if `aikido-*` commands exist, otherwise fall back to original commands with warning

2. **Entry Points** (`bin/`)
   - Each package manager has an `aikido-{pm}.js` wrapper (e.g., `aikido-npm.js`, `aikido-pip.js`)
   - Wrappers call `initializePackageManager(name)` then invoke `main(args)` from `src/main.js`
   - `safe-chain.js` provides CLI commands: `setup`, `teardown`, `setup-ci`, `--version`

3. **Main Flow** (`src/main.js`)
   - Starts MITM proxy server on random port
   - Parses and strips `--safe-chain-*` flags (e.g., `--safe-chain-logging=verbose`)
   - Scans command arguments for malware if supported
   - Runs actual package manager with proxy environment variables set
   - Verifies no malicious packages were downloaded during execution

4. **Registry Proxy** (`src/registryProxy/`)
   - HTTP/HTTPS MITM proxy that intercepts package downloads
   - `mitmRequestHandler.js`: Generates dynamic TLS certs for each host using `node-forge`
   - `interceptors/`: Ecosystem-specific logic (npm, PyPI) to inspect and block package downloads
   - Sets `HTTPS_PROXY`, `GLOBAL_AGENT_HTTP_PROXY`, `NODE_EXTRA_CA_CERTS` env vars for child process

5. **Package Manager Abstraction** (`src/packagemanager/`)
   - Each PM implements `PackageManager` interface: `runCommand`, `isSupportedCommand`, `getDependencyUpdatesForCommand`
   - `currentPackageManager.js` initializes and stores singleton based on command
   - npm uses dependency scanning via dry-run commands; pip/others use argument scanning only

6. **Scanning** (`src/scanning/`)
   - `index.js`: Pre-execution scanning for supported commands (e.g., npm install)
   - `audit/index.js`: Checks packages against malware database, returns `allowedChanges`/`disallowedChanges`
   - `malwareDatabase.js`: Fetches from `https://malware-list.aikido.dev/malware_predictions.json` (JS) or `malware_pypi.json` (Python)

### macOS Agent (System-Wide Protection)

7. **Installer** (`installer/`)
   - **Purpose**: Creates macOS .pkg installer for system-wide agent (no CLI wrappers needed)
   - **Build**: `npm run build:installer` creates `build/AikidoSafeChain.pkg`
   - **Architecture**: See `installer/ARCHITECTURE.md` for complete design
   
8. **Agent Daemon** (`installer/agent/`)
   - **Long-running process**: Runs as LaunchDaemon on port 8765 (fixed, not random)
   - **index.js**: Main daemon with PID management, signal handlers, logging to `/var/log/aikido-safe-chain/`
   - **Reuses proxy code**: Imports from `lib/registryProxy/` (copied during build)
   - **Auto-start**: Configured via `/Library/LaunchDaemons/dev.aikido.safe-chain.plist`
   
9. **System Configuration** (`installer/agent/configure-proxy.js`)
   - **Certificate**: Installs CA to macOS system keychain via `security add-trusted-cert`
   - **Proxy**: Configures all network interfaces using `networksetup` commands
   - **Persistence**: Saves original settings to restore on uninstall
   - **Install location**: `/Library/Application Support/AikidoSafety/`
   
10. **Installer Package**
    - **Built with**: `pkgbuild` and `productbuild` (native macOS tools)
    - **Includes**: Bundled Node.js runtime, agent code, CA certificates, LaunchDaemon plist
    - **Scripts**: `preinstall` (stops existing agent), `postinstall` (installs cert, configures proxy, starts daemon)
    - **Uninstaller**: `uninstall.sh` script that reverses all changes

## Development Patterns

### TypeScript in JavaScript Project

- Uses JSDoc type annotations with `@typedef`, `@param`, `@returns` for type checking
- `tsconfig.json` has `allowJs: true`, `checkJs: true`, `noEmit: true` for type-checking without compilation
- Run `npm run typecheck` to validate types across `.js` files

### Testing Strategy

- **Unit tests**: `*.spec.js` files colocated with source, using Node.js native test runner
  - Run: `npm test` (workspace root) or `npm test --workspace=packages/safe-chain`
  - Uses `--experimental-test-module-mocks` for module mocking
- **E2E tests**: `test/e2e/*.e2e.spec.js` using Docker containers
  - `DockerTestContainer.js` manages ephemeral containers with different package managers
  - Tests shell integration by spawning PTY sessions and parsing output
  - Run: `npm run test:e2e` (requires Docker)

### Configuration

- CLI flags: `--safe-chain-logging=verbose|silent`, `--safe-chain-skip-minimum-package-age`
- Config file support via `src/config/configFile.js` for scan timeouts
- Two ecosystems: `ECOSYSTEM_JS` (npm/yarn/pnpm/bun), `ECOSYSTEM_PY` (pip), and `ECOSYSTEM_ALL` (both, for agent)
- Set via `setEcoSystem()` in each `bin/aikido-*.js` entry point
- Agent uses `ECOSYSTEM_ALL` to intercept and protect both JavaScript and Python package downloads
- Set via `setEcoSystem()` in each `bin/aikido-*.js` entry point

### Key Workflows

**Build installer** (macOS agent feature):
```bash
cd installer
npm install
npm run build
# Outputs: build/AikidoSafeChain.pkg and build/uninstall.sh
```

**Test installer locally**:
```bash
cd installer
npm run build
npm run test-install     # Installs the .pkg
npm run test-uninstall   # Runs uninstaller script
```

**Check agent status**:
```bash
# Daemon status
sudo launchctl list | grep aikido

# Logs
tail -f /var/log/aikido-safe-chain/stdout.log
tail -f /var/log/aikido-safe-chain/stderr.log

# Proxy configuration
networksetup -getwebproxy Wi-Fi

# Certificate
security find-certificate -c "Aikido Safe Chain CA" /Library/Keychains/System.keychain
```

**Run tests locally**:
```bash
npm test                    # Unit tests for all packages
npm run test:e2e           # E2E tests (requires Docker)
npm run lint               # oxlint with deny-warnings
npm run typecheck          # TypeScript validation
```

**Test shell integration**:
```bash
safe-chain setup           # Modifies ~/.bashrc, ~/.zshrc, etc.
npm install safe-chain-test  # Should block (test malware package)
safe-chain teardown        # Cleans up shell files
```

## Important Conventions

- **No sub-shells**: Never use `bash -c` or similar unless absolutely necessary; run commands directly
- **User interaction**: Use `ui.write*()` methods from `environment/userInteraction.js`, not console.log
- **Error handling**: Global handlers in main.js log uncaught exceptions/rejections before exiting
- **Proxy lifecycle**: Proxy server must start before package manager runs, then verify no malicious packages post-execution
- **Minimum package age**: npm-only feature that suppresses packages <24hrs old (not in PyPI)
- **CI mode**: `setup-ci` outputs to stdout/stderr for GitHub Actions/Azure Pipelines compatibility

## External Dependencies

- **Aikido Intel API**: `malware-list.aikido.dev` (no auth required, uses ETag for versioning)
- **Certificates**: Uses `certifi` npm package for trusted CA bundle, `node-forge` for dynamic cert generation
- **Network**: `https-proxy-agent` for upstream proxy support, `make-fetch-happen` for caching
- **Shell detection**: Checks for bash/zsh/fish/PowerShell based on OS and PATH
- **Ecosystem support**: Three modes via `setEcoSystem()`:
  - `ECOSYSTEM_JS` - npm, yarn, pnpm, bun (JavaScript packages)
  - `ECOSYSTEM_PY` - pip (Python packages)  
  - `ECOSYSTEM_ALL` - Both ecosystems (used by long-running agent)

## Common Gotchas

- Shell integration requires terminal restart to take effect (shell startup file sourcing)
- `aikido-npm` commands must be in PATH; shell functions fall back gracefully if missing
- Proxy only intercepts HTTPS via CONNECT tunnels; HTTP requests use plain proxy
- E2E tests set `NODE_VERSION`, `NPM_VERSION`, etc. env vars for Docker build
- Python support is beta; uses module invocation interception (`python -m pip`)
