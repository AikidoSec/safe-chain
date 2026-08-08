# Uninstalls Aikido Endpoint Protection endpoint on Windows
#
# Usage: iex "& { $(iwr '<url>' -UseBasicParsing) } [-debug]"

param(
    [switch]$debug
)

# Configuration
$AppName = "Aikido Endpoint Protection"
$script:KeepLogFile = $false
$script:DebugUsage = 'iex "& { $(iwr ''<url>'' -UseBasicParsing) } -debug"'

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

# Main uninstallation
function Uninstall-Endpoint {
    # Check if we're running as Administrator
    if (-not (Test-Administrator)) {
        Write-Error-Custom "Administrator privileges required. Please run this script in an elevated terminal (Run as Administrator)."
    }

    # Find the installed product
    Write-Info "Looking for Aikido Endpoint Protection installation..."
    $app = Get-WmiObject -Class Win32_Product -Filter "Name='$AppName'"

    if (-not $app) {
        Write-Error-Custom "Aikido Endpoint Protection does not appear to be installed."
    }

    $productCode = $app.IdentifyingNumber
    $logFile = Join-Path $env:TEMP "AikidoEndpoint-$([System.Guid]::NewGuid().ToString('N')).log"

    try {
        Write-Info "Uninstalling Aikido Endpoint Protection..."
        $msiArgs = @("/x", $productCode, "/qn", "/norestart")
        if ($debug) {
            Write-Info "Debug logging enabled. MSI log: $logFile"
            $msiArgs += @("/L*V", "`"$logFile`"")
        }
        $process = Start-Process -FilePath "msiexec" -ArgumentList $msiArgs -Wait -PassThru

        if ($debug) {
            Write-Info "MSI uninstaller log output:"
            if (Test-Path $logFile) {
                Get-Content -Path $logFile | Write-Host
            }
            else {
                Write-Host "[WARN] No log file was produced at $logFile" -ForegroundColor Yellow
            }
        }

        if ($process.ExitCode -ne 0) {
            Write-MsiFailure -ExitCode $process.ExitCode -Action "uninstaller" -LogFile $logFile
        }

        Write-Info "Aikido Endpoint Protection uninstalled successfully!"
    }
    finally {
        # Cleanup
        if ((Test-Path $logFile) -and -not $script:KeepLogFile) {
            Remove-Item -Path $logFile -Force -ErrorAction SilentlyContinue
        }
    }
}

# Run uninstallation
try {
    Uninstall-Endpoint
}
catch {
    Write-Error-Custom "Uninstallation failed: $_"
}
