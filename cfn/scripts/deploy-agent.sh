#!/bin/bash
set -e

echo "=========================================="
echo "Deploy AgentCore Agent"
echo "=========================================="

# Get script directory and navigate to backend
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "${SCRIPT_DIR}/../../backend"

# Set UTF-8 encoding and use configured AWS region for AgentCore
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8
export AWS_DEFAULT_REGION=${AWS_DEFAULT_REGION:-$(aws configure get region 2>/dev/null || echo "us-east-1")}
echo "🌍 Using region $AWS_DEFAULT_REGION for AgentCore deployment"

# Check if agentcore is installed
if ! command -v agentcore &> /dev/null; then
    echo "ERROR: agentcore CLI not found. Install: pip install bedrock-agentcore-starter-toolkit"
    exit 1
fi

# Check if infrastructure stack exists (Phase 1 dependency)
if ! aws cloudformation describe-stacks --stack-name ${STACK_NAME:-bankiq}-infra --region ${AWS_DEFAULT_REGION:-us-east-1} >/dev/null 2>&1; then
    echo "ERROR: Infrastructure stack not found. Run phase1-infrastructure.sh first."
    exit 1
fi

# Ensure AgentCore execution role exists
ROLE_NAME="AmazonBedrockAgentCoreSDKRuntime-${AWS_DEFAULT_REGION}-${STACK_NAME:-bankiq}"
ROLE_ARN="arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):role/$ROLE_NAME"

echo "Checking if AgentCore execution role exists: $ROLE_NAME"
if ! aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
    echo "Creating AgentCore execution role..."
    
    # Create trust policy
    cat > /tmp/agentcore-trust.json <<EOF
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
EOF
    
    # Create role
    aws iam create-role \
        --role-name "$ROLE_NAME" \
        --assume-role-policy-document file:///tmp/agentcore-trust.json \
        --description "Execution role for BankIQ AgentCore" >/dev/null
    
    # Attach policies
    aws iam attach-role-policy --role-name "$ROLE_NAME" --policy-arn arn:aws:iam::aws:policy/AmazonBedrockFullAccess
    aws iam attach-role-policy --role-name "$ROLE_NAME" --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess
    
    # Add ECR permissions
    cat > /tmp/ecr-policy.json <<EOF
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
EOF
    
    aws iam put-role-policy --role-name "$ROLE_NAME" --policy-name ECRAccessPolicy --policy-document file:///tmp/ecr-policy.json
    
    echo "✅ AgentCore execution role created: $ROLE_ARN"
    echo "Waiting for IAM role propagation..."
    sleep 15
else
    echo "✅ AgentCore execution role already exists"
fi

# Check if config exists, if not create it
# Always configure AgentCore fresh (handles first run and re-runs)
echo "🔧 Configuring AgentCore agent..."

# Detect OS and use appropriate input method
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" || "$OSTYPE" == "cygwin" ]]; then
    # Windows (Git Bash/MSYS/Cygwin) - use echo with explicit newlines
    echo "Detected Windows environment - using Windows-compatible input method"
    (echo "bank_iq_agent"; echo ""; echo ""; echo ""; echo ""; echo ""; echo "") | agentcore configure --entrypoint bank_iq_agent.py
else
    # Mac/Linux - use printf
    printf "bank_iq_agent\n\n\n\n\n\n\n" | agentcore configure --entrypoint bank_iq_agent.py
fi

# Verify the config was created with auto-create enabled
if [ -f .bedrock_agentcore.yaml ]; then
    # If execution_role_auto_create is false, fix it
    if grep -q "execution_role_auto_create: false" .bedrock_agentcore.yaml; then
        echo "⚠️  Fixing execution_role_auto_create setting..."
        sed -i.bak 's/execution_role_auto_create: false/execution_role_auto_create: true/' .bedrock_agentcore.yaml
    fi
    
    # If a specific execution_role is set (not auto-created), use the correct one from CloudFormation
    if grep -q "execution_role: arn:aws:iam::" .bedrock_agentcore.yaml; then
        RUNTIME_ROLE="arn:aws:iam::164543933824:role/AmazonBedrockAgentCoreSDKRuntime-${AWS_DEFAULT_REGION}-${STACK_NAME:-bankiq}"
        echo "🔧 Setting execution role to: $RUNTIME_ROLE"
        sed -i.bak "s|execution_role: arn:aws:iam::[^[:space:]]*|execution_role: $RUNTIME_ROLE|" .bedrock_agentcore.yaml
        sed -i.bak 's/execution_role_auto_create: true/execution_role_auto_create: false/' .bedrock_agentcore.yaml
    fi
fi

echo "✅ AgentCore configured"

# Check if agent already exists AND has endpoint deployed
echo "Checking agent status..."
AGENT_ARN=""
ENDPOINT_STATUS=""

# Try to get ARN and endpoint status from agentcore status
if agentcore status 2>/dev/null | grep -q "Agent ARN:"; then
    AGENT_ARN=$(agentcore status 2>/dev/null | grep "Agent ARN:" -A 1 | tail -1 | sed 's/^[[:space:]]*//' | sed 's/[[:space:]]*$//' | sed 's/│//g')
    ENDPOINT_STATUS=$(agentcore status 2>/dev/null | grep "Endpoint:" | sed 's/.*Endpoint: *//' | sed 's/ .*//')
    
    if [ "$ENDPOINT_STATUS" = "DEFAULT" ] && ! agentcore status 2>/dev/null | grep -q "Unknown"; then
        echo "✅ Found existing agent with active endpoint: $AGENT_ARN"
    else
        echo "⚠️  Found agent but endpoint not deployed: $AGENT_ARN"
        echo "Launching endpoint..."
        TEMP_LOG="${SCRIPT_DIR}/temp/agent_deploy.log"
        mkdir -p "${SCRIPT_DIR}/temp"
        PYTHONIOENCODING=utf-8 agentcore launch -a bank_iq_agent --auto-update-on-conflict 2>&1 | tee "$TEMP_LOG"
        
        # Get new ARN after launch
        sleep 10
        AGENT_ARN=$(grep -oE 'arn:aws:bedrock-agentcore:[^[:space:]]+:runtime/bank_iq_agent-[a-zA-Z0-9]+' "$TEMP_LOG" | head -1)
        echo "✅ Agent endpoint deployed: $AGENT_ARN"
    fi
else
    # Deploy new agent
    echo "Deploying new agent..."
    TEMP_LOG="${SCRIPT_DIR}/temp/agent_deploy.log"
    mkdir -p "${SCRIPT_DIR}/temp"
    PYTHONIOENCODING=utf-8 agentcore launch -a bank_iq_agent --auto-update-on-conflict 2>&1 | tee "$TEMP_LOG"
    
    # Wait for deployment to complete and config to update
    sleep 10
    
    # Get agent ARN from deployment output (most reliable)
    AGENT_ARN=$(grep -oE 'arn:aws:bedrock-agentcore:[^[:space:]]+:runtime/bank_iq_agent-[a-zA-Z0-9]+' "$TEMP_LOG" | head -1)
    if [ -n "$AGENT_ARN" ]; then
        echo "✅ Agent ARN from deployment log: $AGENT_ARN"
    else
        # Fallback: extract from deployment log
        AGENT_ARN=$(grep -oE 'arn:aws:bedrock-agentcore:[^[:space:]]+:runtime/bank_iq_agent-[a-zA-Z0-9]+' "$TEMP_LOG" | head -1)
        echo "✅ Agent ARN from log: $AGENT_ARN"
    fi
fi

if [ -z "$AGENT_ARN" ]; then
    echo "ERROR: Failed to extract agent ARN"
    echo "Try running: agentcore status"
    exit 1
fi

# Verify the YAML file has the correct ARN
if [ -f ".bedrock_agentcore.yaml" ]; then
    YAML_ARN=$(grep "agent_arn:" .bedrock_agentcore.yaml | sed 's/.*agent_arn: *\(.*\)/\1/')
    if [ "$YAML_ARN" != "$AGENT_ARN" ]; then
        echo "⚠️  YAML file has wrong ARN, fixing..."
        sed -i.bak "s|agent_arn: .*|agent_arn: $AGENT_ARN|" .bedrock_agentcore.yaml
        sed -i.bak "s|agent_id: .*|agent_id: $(basename $AGENT_ARN)|" .bedrock_agentcore.yaml
        echo "✅ YAML file updated with correct ARN"
    fi
fi

# Save agent ARN for next phase
echo "$AGENT_ARN" > /tmp/agent_arn.txt

# Note: AgentCore automatically creates its own ECR repository and IAM roles
# Repository name: bedrock-agentcore-bank_iq_agent_v1
# IAM role: AmazonBedrockAgentCoreSDKRuntime-{region}-{random-id}

echo ""
echo "✅ PHASE 2 COMPLETE"
echo "Agent ARN: $AGENT_ARN"
echo "Saved to: /tmp/agent_arn.txt"
echo ""
echo "Next: Run phase3-backend-codebuild.sh"
