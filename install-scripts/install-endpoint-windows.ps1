# Downloads and installs Aikido Endpoint Protection on Windows
#
# Usage: iex "& { $(iwr '<url>' -UseBasicParsing) } -token <TOKEN> [-is-mdm] [-debug]"

param(
    [string]$token,
    [switch]${is-mdm},
    [switch]$debug
)

# Configuration
$InstallUrl = "https://github.com/AikidoSec/safechain-internals/releases/download/v1.8.2/EndpointProtection.msi"
$DownloadSha256 = "e9585345f5c197cc6a7749dc9bf61651d153e49afe02f17d49954ecf0b42f384"

$script:KeepLogFile = $false
$script:DebugUsage = 'iex "& { $(iwr ''<url>'' -UseBasicParsing) } -token <TOKEN> -debug"'

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

function Write-Warn {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

# msiexec records the token in the verbose log in several places (the command
# line, the PROPERTY CHANGE entry, the property dump and the StoreToken custom
# action's CustomActionData). Clip it before the log is printed or handed to
# support. Encoding is preserved: MSI writes UTF-16LE logs on most systems.
function Protect-MsiLog {
    param(
        [string]$LogFile,
        [string]$Token
    )
    if ([string]::IsNullOrWhiteSpace($Token)) { return }
    if (-not (Test-Path $LogFile)) { return }
    try {
        $reader = New-Object System.IO.StreamReader($LogFile, [System.Text.Encoding]::UTF8, $true)
        try {
            $text = $reader.ReadToEnd()
            $encoding = $reader.CurrentEncoding
        }
        finally {
            $reader.Dispose()
        }
        $clipped = if ($Token.Length -gt 4) { "***" + $Token.Substring($Token.Length - 4) } else { "***" }
        if ($text.Contains($Token)) {
            [System.IO.File]::WriteAllText($LogFile, $text.Replace($Token, $clipped), $encoding)
        }
    }
    catch {
        # Never let a clipping failure mask the install error we are reporting.
        Remove-Item -Path $LogFile -Force -ErrorAction SilentlyContinue
        Write-Warn "Could not clip the token from the MSI log, so it was deleted instead: $_"
    }
}

# Common msiexec exit codes, so the failure output is actionable on its own
$MsiExitCodeHints = @{
    "1601" = "The Windows Installer service could not be accessed."
    "1602" = "The operation was cancelled."
    "1603" = "A fatal error occurred during the operation."
    "1618" = "Another installation is already in progress. Wait for it to finish and try again."
    "1619" = "The installation package could not be opened. It may be corrupt, inaccessible from this account, or blocked by security software."
    "1620" = "The installation package could not be opened because it is not a valid installer package."
    "1625" = "This operation is forbidden by system policy."
    "1638" = "Another version of this product is already installed."
    "3010" = "A restart is required to complete the operation."
}

function Write-MsiFailure {
    param(
        [int]$ExitCode,
        [string]$Action,
        [string]$LogFile
    )
    Write-Host "[ERROR] MSI $Action failed (exit code: $ExitCode)." -ForegroundColor Red
    if ($MsiExitCodeHints.ContainsKey("$ExitCode")) {
        Write-Warn $MsiExitCodeHints["$ExitCode"]
    }
    if ($debug) {
        $script:KeepLogFile = $true
        if (Test-Path $LogFile) {
            Write-Warn "Verbose MSI log kept at: $LogFile - please share it with Aikido support."
        }
    }
    else {
        Write-Warn "Re-run this script with the -debug flag to produce a verbose MSI log, then share that log with Aikido support."
        Write-Warn "Example: $script:DebugUsage"
    }
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
    $logFile = Join-Path $env:TEMP "AikidoEndpoint-$([System.Guid]::NewGuid().ToString('N')).log"

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
        $msiArgs = @("/i", "`"$msiFile`"", "/qn", "/norestart", "AIKIDO_TOKEN=$token")
        if (${is-mdm}) {
            $msiArgs += "IS_MDM=1"
        }
        if ($debug) {
            Write-Info "Debug logging enabled. MSI log: $logFile"
            $msiArgs += @("/L*V", "`"$logFile`"")
        }
        $process = Start-Process -FilePath "msiexec" -ArgumentList $msiArgs -Wait -PassThru

        # Before the log is echoed below or kept for support by Write-MsiFailure.
        Protect-MsiLog -LogFile $logFile -Token $token

        if ($debug) {
            Write-Info "MSI installer log output:"
            if (Test-Path $logFile) {
                Get-Content -Path $logFile | Write-Host
            }
            else {
                Write-Host "[WARN] No log file was produced at $logFile" -ForegroundColor Yellow
            }
        }

        if ($process.ExitCode -ne 0) {
            Write-MsiFailure -ExitCode $process.ExitCode -Action "installer" -LogFile $logFile
        }

        Write-Info "Aikido Endpoint Protection installed successfully!"
    }
    finally {
        # Cleanup
        if (Test-Path $msiFile) {
            Remove-Item -Path $msiFile -Force -ErrorAction SilentlyContinue
        }
        if ((Test-Path $logFile) -and -not $script:KeepLogFile) {
            Remove-Item -Path $logFile -Force -ErrorAction SilentlyContinue
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
