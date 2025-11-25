# Aikido Safe Chain - AI Coding Agent Instructions

## Project Overview

Safe Chain is a security tool that prevents malware installation by wrapping package managers (npm, npx, yarn, pnpm, bun for JavaScript; uv, pip for Python) with a local MITM proxy. It intercepts package downloads, checks them against Aikido's malware database in real-time, and blocks malicious packages before they reach the developer's machine.

**Key Architecture Components:**
1. **Shell Integration** (`src/shell-integration/`): Creates shell aliases that wrap package manager commands with safe-chain executables
2. **Proxy Server** (`src/registryProxy/`): Local HTTP/HTTPS MITM proxy that intercepts registry traffic
3. **Interceptors** (`src/registryProxy/interceptors/`): Ecosystem-specific handlers (npm/PyPI) that modify requests/responses
4. **Package Managers** (`src/packagemanager/`): Adapters for each package manager (npm, yarn, pnpm, bun, pip)
5. **Scanning** (`src/scanning/`): Pre-install dependency analysis and malware detection

## Critical Workflows

### Running Tests
```bash
# Unit tests (uses Node.js native test runner with experimental mocks)
npm test

# E2E tests (Docker-based, tests all package managers)
npm run test:e2e

# Watch mode for development
npm run test:watch --workspace=packages/safe-chain
```

### Testing Shell Integration
E2E tests use `DockerTestContainer` to test shell integration in isolated environments. Each test spawns a Docker container, runs `safe-chain setup`, and verifies package manager interception works correctly.

## Project-Specific Conventions

### Entry Points & Ecosystem Initialization
Each package manager wrapper (e.g., `bin/aikido-npm.js`) sets the ecosystem (`ECOSYSTEM_JS` or `ECOSYSTEM_PY`) via `setEcoSystem()` before calling `main()`. This determines which interceptor and malware database to use.

### Proxy Environment Variables
Package managers are executed with modified environment variables:
- `HTTPS_PROXY=http://localhost:{port}` - Routes traffic through safe-chain proxy
- `NODE_EXTRA_CA_CERTS={path}` - Trust safe-chain's self-signed CA for MITM
- See `mergeSafeChainProxyEnvironmentVariables()` for case-insensitive merging logic

### MITM Proxy Architecture
- **HTTP requests**: Handled by `handleHttpProxyRequest()` (direct proxy)
- **HTTPS requests**: Use CONNECT tunnel via `mitmConnect()` which generates per-host certificates
- **Interceptors**: Chain-of-responsibility pattern in `interceptorBuilder.js` allows request/response modification
- **Ecosystem-specific**: `npmInterceptor.js` handles npm package info modification and blocking, `pipInterceptor.js` for PyPI

### Minimum Package Age (npm only)
`modifyNpmInfoResponse()` in `src/registryProxy/interceptors/npm/modifyNpmInfo.js` filters out npm package versions published within 24 hours by removing them from package metadata responses. This is npm-specific and doesn't apply to PyPI.

### Safe Command Execution
Always use `safeSpawn()` from `src/utils/safeSpawn.js` instead of raw `child_process.spawn()`. It properly sanitizes arguments with shell metacharacters to prevent injection vulnerabilities.

### UI Logging & Buffering
The `ui` object (`src/environment/userInteraction.js`) handles all output. During package manager execution, use `ui.startBufferingLogs()` to prevent interleaving with package manager output (cursor movement codes can break console rendering). Call `ui.writeBufferedLogsAndStopBuffering()` after.

### Testing Patterns
- **Unit tests**: Use Node.js native test runner (`node:test`) with `--experimental-test-module-mocks`
- **Mocking**: Mock modules with `mock.module()` API (see `*.spec.js` files)
- **E2E tests**: Use `DockerTestContainer` class which builds Docker images and provides shell execution via pseudo-terminals (node-pty)

## Key Files & Patterns

### Package Manager Adapters
Each package manager implements the `PackageManager` interface:
- `runCommand(args)`: Execute the package manager with proxy environment
- `isSupportedCommand(args)`: Check if command should be scanned (install/add/etc)
- `getDependencyUpdatesForCommand(args)`: Parse what packages will be installed

Example: `src/packagemanager/npm/createPackageManager.js`

### Shell Integration
Shell-specific modules in `src/shell-integration/supported-shells/` implement:
- `isInstalled()`: Check if shell exists on system
- `setup()`: Add safe-chain aliases to shell startup file
- `teardown()`: Remove aliases from startup file
- Shell startup scripts in `src/shell-integration/startup-scripts/`

### Configuration
- CLI args: `--safe-chain-skip-minimum-package-age`, `--safe-chain-verbose`, etc.
- Parsed by `initializeCliArguments()` which mutates the args array (removes safe-chain flags)
- Config file support in `src/config/configFile.js` for timeout settings

### Malware Detection
`fetchMalwareDatabase()` in `src/api/aikido.js` pulls malware lists from Aikido Intel. The interceptor calls `isMalwarePackage(name, version)` during download and calls `reqContext.blockMalware()` to prevent the download.

## Common Gotchas

- **Don't spawn package managers directly** - Use the package manager adapter's `runCommand()` to ensure proxy env vars are set
- **Ecosystem must be set early** - Each bin file calls `setEcoSystem()` before any package manager operations
- **State is global** - `src/config/settings.js` uses module-level state for ecosystem/logging settings
- **Docker for E2E only** - E2E tests require Docker; unit tests don't
- **Shell restart required** - After `safe-chain setup`, users must restart their terminal (shell aliases are sourced on startup)
