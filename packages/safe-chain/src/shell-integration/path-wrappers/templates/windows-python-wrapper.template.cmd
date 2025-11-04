@echo off
REM Generated wrapper for python/python3 by safe-chain
REM Intercepts `python[3] -m pip[...]` in CI environments

REM Remove shim directory from PATH to prevent infinite loops
set "SHIM_DIR=%USERPROFILE%\.safe-chain\shims"
call set "CLEAN_PATH=%%PATH:%SHIM_DIR%;=%%"

REM Determine invoked name (python or python3) from the script name
set "INVOKED=%~n0"

REM Check for -m pip or -m pip3
if "%1"=="-m" (
  if /I "%2"=="pip3" (
    shift
    shift
    set "PATH=%CLEAN_PATH%" & aikido-pip3 %*
    goto :eof
  )
  if /I "%2"=="pip" (
    shift
    shift
    if /I "%INVOKED%"=="python3" (
      set "PATH=%CLEAN_PATH%" & aikido-pip3 %*
    ) else (
      set "PATH=%CLEAN_PATH%" & aikido-pip %*
    )
    goto :eof
  )
)

REM Fallback to real python/python3 matching the invoked name
for /f "tokens=*" %%i in ('set "PATH=%CLEAN_PATH%" ^& where %INVOKED% 2^>nul') do (
  "%%i" %*
  goto :eof
)

echo Error: Could not find original %INVOKED% 1>&2
exit /b 1
