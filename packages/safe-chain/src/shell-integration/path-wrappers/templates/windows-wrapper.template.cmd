@echo off
REM Generated wrapper for {{PACKAGE_MANAGER}} by safe-chain
REM This wrapper intercepts {{PACKAGE_MANAGER}} calls for non-interactive environments

REM Remove shim directory from PATH to prevent infinite loops
set "SHIM_DIR=%~dp0"
if "%SHIM_DIR:~-1%"=="\" set "SHIM_DIR=%SHIM_DIR:~0,-1%"
call set "CLEAN_PATH=%%PATH:%SHIM_DIR%;=%%"

REM Check if aikido command is available with clean PATH and capture its full path
set "SAFE_CHAIN_PATH="
for /f "tokens=*" %%i in ('set "PATH=%CLEAN_PATH%" ^& where safe-chain 2^>nul') do (
    if not defined SAFE_CHAIN_PATH set "SAFE_CHAIN_PATH=%%i"
)

if defined SAFE_CHAIN_PATH (
    REM Call aikido command with clean PATH using the resolved full path
    set "PATH=%CLEAN_PATH%" & "%SAFE_CHAIN_PATH%" {{PACKAGE_MANAGER}} %*
) else (
    REM Find the original command with clean PATH
    for /f "tokens=*" %%i in ('set "PATH=%CLEAN_PATH%" ^& where {{PACKAGE_MANAGER}} 2^>nul') do (
        "%%i" %*
        goto :eof
    )
    
    REM If we get here, original command was not found
    echo Error: Could not find original {{PACKAGE_MANAGER}} >&2
    exit /b 1
)
