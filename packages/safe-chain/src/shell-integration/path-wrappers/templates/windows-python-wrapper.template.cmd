@echo off
REM Generated wrapper for python/python3 by safe-chain
REM Intercepts `python[3] -m pip[...]` in CI environments

REM Remove shim directory from PATH to prevent infinite loops
set "SHIM_DIR=%USERPROFILE%\.safe-chain\shims"
call set "CLEAN_PATH=%%PATH:%SHIM_DIR%;=%%"

REM Determine invoked name (python or python3) from the script name
set "INVOKED=%~n0"

REM Check for -m pip or -m pip3 without parentheses to avoid parser issues
if /I "%1" NEQ "-m" goto FALLBACK

set "SECOND=%2"
if /I "%SECOND%"=="pip3" goto CALL_PIP3
if /I "%SECOND%"=="pip" goto CALL_PIP
goto FALLBACK

:CALL_PIP3
shift
shift
set "PATH=%CLEAN_PATH%" & aikido-pip3 %1 %2 %3 %4 %5 %6 %7 %8 %9
goto :eof

:CALL_PIP
shift
shift
if /I "%INVOKED%"=="python3" (
  set "PATH=%CLEAN_PATH%" & aikido-pip3 %1 %2 %3 %4 %5 %6 %7 %8 %9
) else (
  set "PATH=%CLEAN_PATH%" & aikido-pip %1 %2 %3 %4 %5 %6 %7 %8 %9
)
goto :eof

REM Fallback to real python/python3 matching the invoked name
:FALLBACK
for /f "tokens=*" %%i in ('set "PATH=%CLEAN_PATH%" ^& where %INVOKED% 2^>nul') do (
  "%%i" %*
  goto :eof
)

echo Error: Could not find original %INVOKED% 1>&2
exit /b 1
