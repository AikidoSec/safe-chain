![Aikido Safe Chain](https://raw.githubusercontent.com/AikidoSec/safe-chain/main/docs/banner.svg)

# Aikido Safe Chain

[![NPM Version](https://img.shields.io/npm/v/%40aikidosec%2Fsafe-chain?style=flat-square)](https://www.npmjs.com/package/@aikidosec/safe-chain)
[![NPM Downloads](https://img.shields.io/npm/dw/%40aikidosec%2Fsafe-chain?style=flat-square)](https://www.npmjs.com/package/@aikidosec/safe-chain)

- ✅ **Block malware on developer laptops and CI/CD**
- ✅ **Supports npm and PyPI** more package managers coming
- ✅ **Blocks packages newer than 24 hours** without breaking your build
- ✅ **Tokenless, free, no build data shared**

Aikido Safe Chain supports the following package managers:

- 📦 **npm**
- 📦 **npx**
- 📦 **yarn**
- 📦 **pnpm**
- 📦 **pnpx**
- 📦 **bun**
- 📦 **bunx**
- 📦 **pip**
- 📦 **pip3**
- 📦 **uv**
- 📦 **poetry**
- 📦 **pipx**

# Usage

![Aikido Safe Chain demo](https://raw.githubusercontent.com/AikidoSec/safe-chain/main/docs/safe-package-manager-demo.gif)

## Installation

Installing the Aikido Safe Chain is easy with our one-line installer.

### Unix/Linux/macOS

```shell
curl -fsSL https://github.com/AikidoSec/safe-chain/releases/latest/download/install-safe-chain.sh | sh
```

### Windows (PowerShell)

```powershell
iex (iwr "https://github.com/AikidoSec/safe-chain/releases/latest/download/install-safe-chain.ps1" -UseBasicParsing)
```

### Pinning to a specific version

To install a specific version instead of the latest, replace `latest` with the version number in the URL (available from version 1.3.2 onwards):

**Unix/Linux/macOS:**

```shell
curl -fsSL https://github.com/AikidoSec/safe-chain/releases/download/x.x.x/install-safe-chain.sh | sh
```

**Windows (PowerShell):**

```powershell
iex (iwr "https://github.com/AikidoSec/safe-chain/releases/download/x.x.x/install-safe-chain.ps1" -UseBasicParsing)
```

You can find all available versions on the [releases page](https://github.com/AikidoSec/safe-chain/releases).

### Verify the installation

1. **❗Restart your terminal** to start using the Aikido Safe Chain.
   - This step is crucial as it ensures that the shell aliases for npm, npx, yarn, pnpm, pnpx, bun, bunx, pip, pip3, poetry, uv and pipx are loaded correctly. If you do not restart your terminal, the aliases will not be available.

2. **Verify the installation** by running the verification command:

   ```shell
   npm safe-chain-verify
   pnpm safe-chain-verify
   pip safe-chain-verify
   uv safe-chain-verify

   # Any other supported package manager: {packagemanager} safe-chain-verify
   ```

   - The output should display "OK: Safe-chain works!" confirming that Aikido Safe Chain is properly installed and running.

3. **(Optional) Test malware blocking** by attempting to install a test package:

   For JavaScript/Node.js:

   ```shell
   npm install safe-chain-test
   ```

   For Python:

   ```shell
   pip3 install safe-chain-pi-test
   ```

   - The output should show that Aikido Safe Chain is blocking the installation of these test packages as they are flagged as malware.

When running `npm`, `npx`, `yarn`, `pnpm`, `pnpx`, `bun`, `bunx`, `pip`, `pip3`, `uv`, `poetry` and `pipx` commands, the Aikido Safe Chain will automatically check for malware in the packages you are trying to install. It also intercepts Python module invocations for pip when available (e.g., `python -m pip install ...`, `python3 -m pip download ...`). If any malware is detected, it will prompt you to exit the command.

You can check the installed version by running:

```shell
safe-chain --version
```

## How it works

### Malware Blocking

The Aikido Safe Chain works by running a lightweight proxy server that intercepts package downloads from the npm registry and PyPI. When you run npm, npx, yarn, pnpm, pnpx, bun, bunx, pip, pip3, uv, poetry or pipx commands, all package downloads are routed through this local proxy, which verifies packages in real-time against **[Aikido Intel - Open Sources Threat Intelligence](https://intel.aikido.dev/?tab=malware)**. If malware is detected in any package (including deep dependencies), the proxy blocks the download before the malicious code reaches your machine.

### Minimum package age (npm only)

For npm packages, Safe Chain temporarily suppresses packages published within the last 24 hours (by default) until they have been validated against malware. This provides an additional security layer during the critical period when newly published packages are most vulnerable to containing undetected threats. You can configure this threshold or bypass this protection entirely - see the [Minimum Package Age Configuration](#minimum-package-age) section below.

⚠️ This feature **only applies to npm-based package managers** (npm, npx, yarn, pnpm, pnpx, bun, bunx) and does not apply to Python package managers (uv, pip, pip3, poetry, pipx).

### Shell Integration

The Aikido Safe Chain integrates with your shell to provide a seamless experience when using npm, npx, yarn, pnpm, pnpx, bun, bunx, and Python package managers (pip, uv, poetry, pipx). It sets up aliases for these commands so that they are wrapped by the Aikido Safe Chain commands, which manage the proxy server before executing the original commands. We currently support:

- ✅ **Bash**
- ✅ **Zsh**
- ✅ **Fish**
- ✅ **PowerShell**
- ✅ **PowerShell Core**

More information about the shell integration can be found in the [shell integration documentation](https://github.com/AikidoSec/safe-chain/blob/main/docs/shell-integration.md).

## Uninstallation

To uninstall the Aikido Safe Chain, use our one-line uninstaller:

### Unix/Linux/macOS

```shell
curl -fsSL https://github.com/AikidoSec/safe-chain/releases/latest/download/uninstall-safe-chain.sh | sh
```

### Windows (PowerShell)

```powershell
iex (iwr "https://github.com/AikidoSec/safe-chain/releases/latest/download/uninstall-safe-chain.ps1" -UseBasicParsing)
```

**❗Restart your terminal** after uninstalling to ensure all aliases are removed.

# Configuration

## Logging

You can control the output from Aikido Safe Chain using the `--safe-chain-logging` flag or the `SAFE_CHAIN_LOGGING` environment variable.

### Configuration Options

You can set the logging level through multiple sources (in order of priority):

1. **CLI Argument** (highest priority):
   - `--safe-chain-logging=silent` - Suppresses all Aikido Safe Chain output except when malware is blocked. The package manager output is written to stdout as normal, and Safe Chain only writes a short message if it has blocked malware and causes the process to exit.

     ```shell
     npm install express --safe-chain-logging=silent
     ```

   - `--safe-chain-logging=verbose` - Enables detailed diagnostic output from Aikido Safe Chain. Useful for troubleshooting issues or understanding what Safe Chain is doing behind the scenes.

     ```shell
     npm install express --safe-chain-logging=verbose
     ```

2. **Environment Variable**:

   ```shell
   export SAFE_CHAIN_LOGGING=verbose
   npm install express
   ```

   Valid values: `silent`, `normal`, `verbose`

   This is useful for setting a default logging level for all package manager commands in your terminal session or CI/CD environment.

## Minimum Package Age

You can configure how long packages must exist before Safe Chain allows their installation. By default, packages must be at least 24 hours old before they can be installed through npm-based package managers.

### Configuration Options

You can set the minimum package age through multiple sources (in order of priority):

1. **CLI Argument** (highest priority):

   ```shell
   npm install express --safe-chain-minimum-package-age-hours=48
   ```

2. **Environment Variable**:

   ```shell
   export SAFE_CHAIN_MINIMUM_PACKAGE_AGE_HOURS=48
   npm install express
   ```

3. **Config File** (`~/.aikido/config.json`):

   ```json
   {
     "minimumPackageAgeHours": 48
   }
   ```

### Excluding Packages

Exclude trusted packages from minimum age filtering via environment variable or config file (both are merged). Use `@scope/*` to trust all packages from an organization:

```shell
export SAFE_CHAIN_NPM_MINIMUM_PACKAGE_AGE_EXCLUSIONS="@aikidosec/*"
```

```json
{
  "npm": {
    "minimumPackageAgeExclusions": ["@aikidosec/*"]
  }
}
```

## Custom Registries

Configure Safe Chain to scan packages from custom or private registries.

Supported ecosystems:

- Node.js
- Python

### Configuration Options

You can set custom registries through environment variable or config file. Both sources are merged together.

1. **Environment Variable** (comma-separated):

   ```shell
   export SAFE_CHAIN_NPM_CUSTOM_REGISTRIES="npm.company.com,registry.internal.net"
   export SAFE_CHAIN_PIP_CUSTOM_REGISTRIES="pip.company.com,registry.internal.net"
   ```

2. **Config File** (`~/.aikido/config.json`):

   ```json
   {
     "npm": {
       "customRegistries": ["npm.company.com", "registry.internal.net"]
     },
     "pip": {
       "customRegistries": ["pip.company.com", "registry.internal.net"]
     }
   }
   ```

# Usage in CI/CD

You can protect your CI/CD pipelines from malicious packages by integrating Aikido Safe Chain into your build process. This ensures that any packages installed during your automated builds are checked for malware before installation.

## Installation for CI/CD

Use the `--ci` flag to automatically configure Aikido Safe Chain for CI/CD environments. This sets up executable shims in the PATH instead of shell aliases.

### Unix/Linux/macOS (GitHub Actions, Azure Pipelines, etc.)

```shell
curl -fsSL https://github.com/AikidoSec/safe-chain/releases/latest/download/install-safe-chain.sh | sh -s -- --ci
```

### Windows (Azure Pipelines, etc.)

```powershell
iex "& { $(iwr 'https://github.com/AikidoSec/safe-chain/releases/latest/download/install-safe-chain.ps1' -UseBasicParsing) } -ci"
```

## Supported Platforms

- ✅ **GitHub Actions**
- ✅ **Azure Pipelines**
- ✅ **CircleCI**
- ✅ **Jenkins**
- ✅ **Bitbucket Pipelines**
- ✅ **GitLab Pipelines**

## GitHub Actions Example

```yaml
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: "22"
    cache: "npm"

- name: Install safe-chain
  run: curl -fsSL https://github.com/AikidoSec/safe-chain/releases/latest/download/install-safe-chain.sh | sh -s -- --ci

- name: Install dependencies
  run: npm ci
```

## Azure DevOps Example

```yaml
- task: NodeTool@0
  inputs:
    versionSpec: "22.x"
  displayName: "Install Node.js"

- script: curl -fsSL https://github.com/AikidoSec/safe-chain/releases/latest/download/install-safe-chain.sh | sh -s -- --ci
  displayName: "Install safe-chain"

- script: npm ci
  displayName: "Install dependencies"
```

## CircleCI Example

```yaml
version: 2.1
jobs:
  build:
    docker:
      - image: cimg/node:lts
    steps:
      - checkout
      - run: |
          curl -fsSL https://raw.githubusercontent.com/AikidoSec/safe-chain/main/install-scripts/install-safe-chain.sh | sh -s -- --ci
      - run: npm ci
workflows:
  build_and_test:
    jobs:
      - build
```

## Jenkins Example

Note: This assumes Node.js and npm are installed on the Jenkins agent.

```groovy
pipeline {
  agent any

  environment {
    // Jenkins does not automatically persist PATH updates from setup-ci,
    // so add the shims + binary directory explicitly for all stages.
    PATH = "${env.HOME}/.safe-chain/shims:${env.HOME}/.safe-chain/bin:${env.PATH}"
  }

  stages {
    stage('Install safe-chain') {
      steps {
        sh '''
          set -euo pipefail

          # Install Safe Chain for CI
          curl -fsSL https://github.com/AikidoSec/safe-chain/releases/latest/download/install-safe-chain.sh | sh -s -- --ci
        '''
      }
    }

    stage('Install project dependencies etc...') {
      steps {
        sh '''
          set -euo pipefail
          npm ci
        '''
      }
    }
  }
}
```

## Bitbucket Pipelines Example

```yaml
image: node:22

steps:
  - step:
      name: Install
      script:
        - curl -fsSL https://github.com/AikidoSec/safe-chain/releases/latest/download/install-safe-chain.sh | sh -s -- --ci
        - export PATH=~/.safe-chain/shims:$PATH
        - npm ci
```

After setup, all subsequent package manager commands in your CI pipeline will automatically be protected by Aikido Safe Chain's malware detection.

## GitLab Pipelines Example

To add safe-chain in GitLab pipelines, you need to install it in the image running the pipeline. This can be done by:

1. Define a dockerfile to run your build

   ```dockerfile
   FROM node:lts

   # Install safe-chain
   RUN curl -fsSL https://github.com/AikidoSec/safe-chain/releases/latest/download/install-safe-chain.sh | sh -s -- --ci

   # Add safe-chain to PATH
   ENV PATH="/root/.safe-chain/shims:/root/.safe-chain/bin:${PATH}"
   ```

2. Build the Docker image in your CI pipeline

   ```yaml
   build-image:
     stage: build-image
     image: docker:latest
     services:
       - docker:dind
     script:
       - docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY
       - docker build -t $CI_REGISTRY_IMAGE:latest .
       - docker push $CI_REGISTRY_IMAGE:latest
   ```

3. Use the image in your pipeline:
   ```yaml
   npm-ci:
     stage: install
     image: $CI_REGISTRY_IMAGE:latest
     script:
       - npm ci
   ```

The full pipeline for this example looks like this:

```yaml
stages:
  - build-image
  - install

build-image:
  stage: build-image
  image: docker:latest
  services:
    - docker:dind
  script:
    - docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY
    - docker build -t $CI_REGISTRY_IMAGE:latest .
    - docker push $CI_REGISTRY_IMAGE:latest

npm-ci:
  stage: install
  image: $CI_REGISTRY_IMAGE:latest
  script:
    - npm ci
```

# Troubleshooting

Having issues? See the [Troubleshooting Guide](https://help.aikido.dev/code-scanning/aikido-malware-scanning/safe-chain-troubleshooting) for help with common problems.
