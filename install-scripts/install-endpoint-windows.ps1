# Downloads and installs Aikido Endpoint Protection on Windows
#
# Usage: iex "& { $(iwr '<url>' -UseBasicParsing) } -token <TOKEN>"

param(
    [string]$token
)

# Configuration
$InstallUrl = "https://github.com/AikidoSec/safechain-internals/releases/download/v1.3.4/EndpointProtection.msi"
$DownloadSha256 = "0699379716a9a8b1531befa538befb237252af9f7fd780b33f4dce73588c6f83"

# Ensure TLS 1.2 is enabled for downloads
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Helper functions
function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Green
}

function Write-Error-Custom {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
    exit 1
}

# Check if running as Administrator
function Test-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Main installation
function Install-Endpoint {
    # 1. Check if we're running as Administrator
    if (-not (Test-Administrator)) {
        Write-Error-Custom "Administrator privileges required. Please run this script in an elevated terminal (Run as Administrator)."
    }

    # Check if token is provided, prompt if not
    if ([string]::IsNullOrWhiteSpace($token)) {
        $token = Read-Host "Enter your Aikido endpoint token"
        if ([string]::IsNullOrWhiteSpace($token)) {
            Write-Error-Custom "Token is required. Pass it with -token <TOKEN> or enter it when prompted."
        }
    }

    # Validate token to prevent command/property injection via msiexec
    if ($token -match '[";`$\s]') {
        Write-Error-Custom "Invalid token format. Token must not contain quotes, semicolons, backticks, dollar signs, or whitespace."
    }

    # 2. Download the .msi
    $msiFile = Join-Path $env:TEMP "AikidoEndpoint-$([System.Guid]::NewGuid().ToString('N')).msi"

    Write-Info "Downloading Aikido Endpoint Protection..."
    try {
        $ProgressPreference = 'SilentlyContinue'
        Invoke-WebRequest -Uri $InstallUrl -OutFile $msiFile -UseBasicParsing
        $ProgressPreference = 'Continue'
    }
    catch {
        Write-Error-Custom "Failed to download from $InstallUrl : $_"
    }

    try {
        # Verify SHA256 checksum
        Write-Info "Verifying checksum..."
        $actualHash = (Get-FileHash -Path $msiFile -Algorithm SHA256).Hash.ToLower()
        if ($actualHash -ne $DownloadSha256) {
            Write-Error-Custom "Checksum verification failed. Expected: $DownloadSha256, Got: $actualHash"
        }
        Write-Info "Checksum verified successfully."

        # 3. Install the package with token passed as MSI property
        Write-Info "Installing Aikido Endpoint Protection..."
        $process = Start-Process -FilePath "msiexec" -ArgumentList "/i", "`"$msiFile`"", "/qn", "/norestart", "AIKIDO_TOKEN=$token" -Wait -PassThru
        if ($process.ExitCode -ne 0) {
            Write-Error-Custom "MSI installer failed (exit code: $($process.ExitCode))."
        }

        Write-Info "Aikido Endpoint Protection installed successfully!"
    }
    finally {
        # Cleanup
        if (Test-Path $msiFile) {
            Remove-Item -Path $msiFile -Force -ErrorAction SilentlyContinue
        }
    }
}

# Run installation
try {
    Install-Endpoint
}
catch {
    Write-Error-Custom "Installation failed: $_"
}
