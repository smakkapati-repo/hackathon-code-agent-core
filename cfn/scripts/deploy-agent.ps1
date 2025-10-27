# PowerShell script for deploying AgentCore Agent on Windows
# Usage: .\deploy-agent.ps1

$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Deploy AgentCore Agent (Windows)" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# Get script directory and navigate to backend
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Join-Path (Split-Path -Parent (Split-Path -Parent $ScriptDir)) "backend"
Set-Location $BackendDir

# Set environment variables
$env:PYTHONIOENCODING = "utf-8"
$AwsRegion = if ($env:AWS_DEFAULT_REGION) { $env:AWS_DEFAULT_REGION } else { 
    try { 
        (aws configure get region 2>$null) 
    } catch { 
        "us-east-1" 
    }
}
$env:AWS_DEFAULT_REGION = $AwsRegion
Write-Host "🌍 Using region $AwsRegion for AgentCore deployment" -ForegroundColor Green

# Check if agentcore is installed
try {
    $null = Get-Command agentcore -ErrorAction Stop
} catch {
    Write-Host "ERROR: agentcore CLI not found. Install: pip install bedrock-agentcore-starter-toolkit" -ForegroundColor Red
    exit 1
}

# Get stack name from environment or use default
$StackName = if ($env:STACK_NAME) { $env:STACK_NAME } else { "bankiq" }

# Check if infrastructure stack exists
try {
    aws cloudformation describe-stacks --stack-name "$StackName-infra" --region $AwsRegion 2>&1 | Out-Null
} catch {
    Write-Host "ERROR: Infrastructure stack not found. Run phase1-infrastructure.ps1 first." -ForegroundColor Red
    exit 1
}

# Get AWS account ID
$AccountId = (aws sts get-caller-identity --query Account --output text)

# Ensure AgentCore execution role exists
$RoleName = "AmazonBedrockAgentCoreSDKRuntime-$AwsRegion-$StackName"
$RoleArn = "arn:aws:iam::${AccountId}:role/$RoleName"

Write-Host "Checking if AgentCore execution role exists: $RoleName" -ForegroundColor Yellow

try {
    aws iam get-role --role-name $RoleName 2>&1 | Out-Null
    Write-Host "✅ AgentCore execution role already exists" -ForegroundColor Green
} catch {
    Write-Host "Creating AgentCore execution role..." -ForegroundColor Yellow
    
    # Create trust policy
    $TrustPolicy = @"
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "bedrock-agentcore.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
"@
    $TrustPolicyFile = "$env:TEMP\agentcore-trust.json"
    $TrustPolicy | Out-File -FilePath $TrustPolicyFile -Encoding utf8
    
    # Create role
    aws iam create-role `
        --role-name $RoleName `
        --assume-role-policy-document "file://$TrustPolicyFile" `
        --description "Execution role for BankIQ AgentCore" | Out-Null
    
    # Attach policies
    aws iam attach-role-policy --role-name $RoleName --policy-arn "arn:aws:iam::aws:policy/AmazonBedrockFullAccess"
    aws iam attach-role-policy --role-name $RoleName --policy-arn "arn:aws:iam::aws:policy/AmazonS3FullAccess"
    
    # Add ECR permissions
    $EcrPolicy = @"
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchGetImage",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchCheckLayerAvailability"
      ],
      "Resource": "*"
    }
  ]
}
"@
    $EcrPolicyFile = "$env:TEMP\ecr-policy.json"
    $EcrPolicy | Out-File -FilePath $EcrPolicyFile -Encoding utf8
    
    aws iam put-role-policy --role-name $RoleName --policy-name ECRAccessPolicy --policy-document "file://$EcrPolicyFile"
    
    Write-Host "✅ AgentCore execution role created: $RoleArn" -ForegroundColor Green
    Write-Host "Waiting for IAM role propagation..." -ForegroundColor Yellow
    Start-Sleep -Seconds 15
}

# Configure AgentCore agent
Write-Host "🔧 Configuring AgentCore agent..." -ForegroundColor Yellow

# Create input file for agentcore configure (Windows-compatible)
$ConfigInputs = @"
bank_iq_agent







"@
$ConfigInputFile = "$env:TEMP\agentcore-config-inputs.txt"
$ConfigInputs | Out-File -FilePath $ConfigInputFile -Encoding utf8 -NoNewline

# Run agentcore configure with input file
Get-Content $ConfigInputFile | agentcore configure --entrypoint bank_iq_agent.py

# Verify and fix config
if (Test-Path ".bedrock_agentcore.yaml") {
    $ConfigContent = Get-Content ".bedrock_agentcore.yaml" -Raw
    
    # Fix execution_role_auto_create if needed
    if ($ConfigContent -match "execution_role_auto_create: false") {
        Write-Host "⚠️  Fixing execution_role_auto_create setting..." -ForegroundColor Yellow
        $ConfigContent = $ConfigContent -replace "execution_role_auto_create: false", "execution_role_auto_create: true"
        $ConfigContent | Out-File -FilePath ".bedrock_agentcore.yaml" -Encoding utf8
    }
    
    # Set specific execution role if needed
    if ($ConfigContent -match "execution_role: arn:aws:iam::") {
        $RuntimeRole = "arn:aws:iam::${AccountId}:role/AmazonBedrockAgentCoreSDKRuntime-$AwsRegion-$StackName"
        Write-Host "🔧 Setting execution role to: $RuntimeRole" -ForegroundColor Yellow
        $ConfigContent = $ConfigContent -replace "execution_role: arn:aws:iam::[^\s]+", "execution_role: $RuntimeRole"
        $ConfigContent = $ConfigContent -replace "execution_role_auto_create: true", "execution_role_auto_create: false"
        $ConfigContent | Out-File -FilePath ".bedrock_agentcore.yaml" -Encoding utf8
    }
}

Write-Host "✅ AgentCore configured" -ForegroundColor Green

# Check agent status
Write-Host "Checking agent status..." -ForegroundColor Yellow
$AgentArn = ""
$EndpointStatus = ""

try {
    $StatusOutput = agentcore status 2>&1 | Out-String
    
    if ($StatusOutput -match "Agent ARN:") {
        # Extract ARN from status output
        if ($StatusOutput -match "arn:aws:bedrock-agentcore:[^\s]+:runtime/bank_iq_agent-[a-zA-Z0-9]+") {
            $AgentArn = $Matches[0]
        }
        
        # Check endpoint status
        if ($StatusOutput -match "Endpoint:\s+(\w+)") {
            $EndpointStatus = $Matches[1]
        }
        
        if ($EndpointStatus -eq "DEFAULT" -and $StatusOutput -notmatch "Unknown") {
            Write-Host "✅ Found existing agent with active endpoint: $AgentArn" -ForegroundColor Green
        } else {
            Write-Host "⚠️  Found agent but endpoint not deployed: $AgentArn" -ForegroundColor Yellow
            Write-Host "Launching endpoint..." -ForegroundColor Yellow
            
            $TempDir = Join-Path $ScriptDir "temp"
            if (-not (Test-Path $TempDir)) {
                New-Item -ItemType Directory -Path $TempDir | Out-Null
            }
            $LogFile = Join-Path $TempDir "agent_deploy.log"
            
            agentcore launch -a bank_iq_agent --auto-update-on-conflict 2>&1 | Tee-Object -FilePath $LogFile
            
            Start-Sleep -Seconds 10
            $LogContent = Get-Content $LogFile -Raw
            if ($LogContent -match "arn:aws:bedrock-agentcore:[^\s]+:runtime/bank_iq_agent-[a-zA-Z0-9]+") {
                $AgentArn = $Matches[0]
            }
            Write-Host "✅ Agent endpoint deployed: $AgentArn" -ForegroundColor Green
        }
    } else {
        throw "No existing agent found"
    }
} catch {
    # Deploy new agent
    Write-Host "Deploying new agent..." -ForegroundColor Yellow
    
    $TempDir = Join-Path $ScriptDir "temp"
    if (-not (Test-Path $TempDir)) {
        New-Item -ItemType Directory -Path $TempDir | Out-Null
    }
    $LogFile = Join-Path $TempDir "agent_deploy.log"
    
    agentcore launch -a bank_iq_agent --auto-update-on-conflict 2>&1 | Tee-Object -FilePath $LogFile
    
    Start-Sleep -Seconds 10
    
    # Extract ARN from log
    $LogContent = Get-Content $LogFile -Raw
    if ($LogContent -match "arn:aws:bedrock-agentcore:[^\s]+:runtime/bank_iq_agent-[a-zA-Z0-9]+") {
        $AgentArn = $Matches[0]
        Write-Host "✅ Agent ARN from deployment log: $AgentArn" -ForegroundColor Green
    }
}

if (-not $AgentArn) {
    Write-Host "ERROR: Failed to extract agent ARN" -ForegroundColor Red
    Write-Host "Try running: agentcore status" -ForegroundColor Yellow
    exit 1
}

# Verify and update YAML file
if (Test-Path ".bedrock_agentcore.yaml") {
    $YamlContent = Get-Content ".bedrock_agentcore.yaml" -Raw
    
    if ($YamlContent -match "agent_arn:\s+(.+)") {
        $YamlArn = $Matches[1].Trim()
        
        if ($YamlArn -ne $AgentArn) {
            Write-Host "⚠️  YAML file has wrong ARN, fixing..." -ForegroundColor Yellow
            $AgentId = Split-Path -Leaf $AgentArn
            $YamlContent = $YamlContent -replace "agent_arn:.*", "agent_arn: $AgentArn"
            $YamlContent = $YamlContent -replace "agent_id:.*", "agent_id: $AgentId"
            $YamlContent | Out-File -FilePath ".bedrock_agentcore.yaml" -Encoding utf8
            Write-Host "✅ YAML file updated with correct ARN" -ForegroundColor Green
        }
    }
}

# Save agent ARN for next phase
$AgentArn | Out-File -FilePath "$env:TEMP\agent_arn.txt" -Encoding utf8

Write-Host ""
Write-Host "✅ PHASE 2 COMPLETE" -ForegroundColor Green
Write-Host "Agent ARN: $AgentArn" -ForegroundColor Cyan
Write-Host "Saved to: $env:TEMP\agent_arn.txt" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next: Run .\phase3-backend-codebuild.ps1" -ForegroundColor Yellow
