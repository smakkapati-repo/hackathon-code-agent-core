# Windows Deployment Guide

This guide explains how to deploy BankIQ+ on Windows machines.

## Prerequisites

- **PowerShell 5.1+** (comes with Windows 10/11)
- **AWS CLI** installed and configured
- **Python 3.10+** with pip
- **Git Bash** (optional, for running .sh scripts)

## Installation

1. **Install Python dependencies:**
   ```powershell
   pip install bedrock-agentcore-starter-toolkit boto3 requests
   ```

2. **Configure AWS credentials:**
   ```powershell
   aws configure
   ```

## Deployment Scripts

### Option 1: Use PowerShell Scripts (Recommended)

Windows-native PowerShell scripts that handle all the automation:

```powershell
# Phase 1: Infrastructure
.\cfn\scripts\phase1-infrastructure.ps1

# Phase 2: Agent (Windows-specific)
.\cfn\scripts\deploy-agent.ps1

# Phase 3: Backend
.\cfn\scripts\phase3-backend-codebuild.ps1

# Phase 4: Frontend
.\cfn\scripts\phase4-frontend.ps1
```

### Option 2: Use Batch Files

Double-click or run from Command Prompt:

```cmd
cd cfn\scripts
deploy-agent.bat
```

### Option 3: Use Git Bash (Linux-style)

If you have Git Bash installed, you can use the original .sh scripts:

```bash
./cfn/scripts/deploy-all.sh
```

## Key Differences: Windows vs Mac/Linux

| Feature | Mac/Linux (.sh) | Windows (.ps1) |
|---------|----------------|----------------|
| Shell | Bash | PowerShell |
| Line endings | LF | CRLF |
| Path separator | `/` | `\` |
| Temp directory | `/tmp` | `$env:TEMP` |
| Input handling | `printf \| command` | `Get-Content \| command` |
| Color output | ANSI codes | `-ForegroundColor` |

## Windows-Specific Files

- **deploy-agent.ps1** - PowerShell version of deploy-agent.sh
- **deploy-agent.bat** - Batch wrapper for easy execution
- **WINDOWS_DEPLOYMENT.md** - This file

## Troubleshooting

### PowerShell Execution Policy Error

If you see "cannot be loaded because running scripts is disabled":

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### AWS CLI Not Found

Install AWS CLI v2 for Windows:
https://aws.amazon.com/cli/

### Python Not Found

Install Python from:
https://www.python.org/downloads/windows/

Make sure to check "Add Python to PATH" during installation.

### agentcore Command Not Found

```powershell
pip install --upgrade bedrock-agentcore-starter-toolkit
```

### Line Ending Issues

If you cloned the repo on Windows, Git may have converted line endings. To fix:

```powershell
git config core.autocrlf false
git rm --cached -r .
git reset --hard
```

## Manual Agent Configuration (If Automated Fails)

If the automated configuration doesn't work, you can configure manually:

```powershell
cd backend
agentcore configure --entrypoint bank_iq_agent.py
```

When prompted, enter:
1. **Agent name:** `bank_iq_agent`
2. **Execution role:** Press Enter (auto-create)
3. **ECR repository:** Press Enter (auto-create)
4. **Dependency file:** Press Enter (use requirements.txt)
5. **OAuth:** Press Enter (not needed)
6. **Headers:** Press Enter (not needed)
7. **Memory:** Press Enter (use default)

Then deploy:

```powershell
agentcore launch -a bank_iq_agent --auto-update-on-conflict
```

## Support

For issues specific to Windows deployment, check:
- PowerShell version: `$PSVersionTable.PSVersion`
- AWS CLI version: `aws --version`
- Python version: `python --version`
- agentcore version: `pip show bedrock-agentcore-starter-toolkit`

## Next Steps

After successful deployment:
1. Get your CloudFront URL from AWS Console
2. Access the application
3. Test all features (Peer Analytics, Compliance, Financial Reports)
4. Check CloudWatch logs if issues occur

## Differences from Mac/Linux Deployment

The Windows scripts provide the same functionality as the Mac/Linux scripts but with:
- Native PowerShell syntax
- Windows-compatible path handling
- Proper encoding for Windows terminals
- Batch file wrappers for convenience
- Better error messages for Windows users

All core functionality remains identical - only the deployment automation differs.
