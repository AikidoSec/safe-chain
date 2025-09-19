@echo off
REM Generated wrapper for {{PACKAGE_MANAGER}} by safe-chain
REM This wrapper intercepts {{PACKAGE_MANAGER}} calls for non-interactive environments

REM Remove shim directory from PATH to prevent infinite loops
set "SHIM_DIR=%USERPROFILE%\.safe-chain\shims"
call set "CLEAN_PATH=%%PATH:%SHIM_DIR%;=%%"

REM Check if aikido command is available with clean PATH
set "PATH=%CLEAN_PATH%" & where {{AIKIDO_COMMAND}} >nul 2>&1
if %errorlevel%==0 (
    REM Call aikido command with clean PATH
    set "PATH=%CLEAN_PATH%" & {{AIKIDO_COMMAND}} %*
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