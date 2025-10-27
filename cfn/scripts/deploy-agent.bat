@echo off
REM Batch file wrapper for PowerShell agent deployment script
REM Usage: deploy-agent.bat

echo ==========================================
echo Deploy AgentCore Agent (Windows)
echo ==========================================

REM Check if PowerShell is available
where powershell >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: PowerShell not found. Please install PowerShell.
    exit /b 1
)

REM Get script directory
set SCRIPT_DIR=%~dp0

REM Run PowerShell script with execution policy bypass
powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%deploy-agent.ps1"

REM Check exit code
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Agent deployment failed. Check the output above.
    exit /b %ERRORLEVEL%
)

echo.
echo ==========================================
echo Agent deployment completed successfully!
echo ==========================================
pause
