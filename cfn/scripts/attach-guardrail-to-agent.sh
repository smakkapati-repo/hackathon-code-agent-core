#!/bin/bash
set -e

echo "🛡️ Attaching Bedrock Guardrail to BankIQ+ Agent"
echo "================================================"
echo ""

REGION=${AWS_DEFAULT_REGION:-us-east-1}

# Get guardrail ID from AWS
GUARDRAIL_ID=$(aws bedrock list-guardrails --region $REGION --query "guardrails[?name=='bankiq-guardrail'].id" --output text 2>/dev/null)

if [ -z "$GUARDRAIL_ID" ]; then
  echo "❌ Guardrail not found. Run create-bedrock-guardrail.py first."
  exit 1
fi

# Get latest version
GUARDRAIL_VERSION=$(aws bedrock get-guardrail --guardrail-identifier $GUARDRAIL_ID --region $REGION --query 'version' --output text 2>/dev/null || echo "1")

echo "Guardrail ID: $GUARDRAIL_ID"
echo "Version: $GUARDRAIL_VERSION"
echo ""

# Check if agent config exists
if [ ! -f backend/.bedrock_agentcore.yaml ]; then
  echo "❌ Agent config not found at backend/.bedrock_agentcore.yaml"
  exit 1
fi

# Backup current config
cp backend/.bedrock_agentcore.yaml backend/.bedrock_agentcore.yaml.backup
echo "✅ Backed up agent config"

# Add guardrail to config (if not already present)
if grep -q "guardrail:" backend/.bedrock_agentcore.yaml; then
  echo "⚠️  Guardrail already configured, updating..."
  # Remove old guardrail config
  sed -i.tmp '/guardrail:/,/version:/d' backend/.bedrock_agentcore.yaml
fi

# Add guardrail config after agent_arn line
sed -i.tmp "/agent_arn:/a\\
guardrail:\\
  identifier: $GUARDRAIL_ID\\
  version: '$GUARDRAIL_VERSION'
" backend/.bedrock_agentcore.yaml

# Clean up temp file
rm -f backend/.bedrock_agentcore.yaml.tmp

echo "✅ Guardrail configuration added to agent"
echo ""
echo "📋 Updated configuration:"
cat backend/.bedrock_agentcore.yaml
echo ""
echo "================================================"
echo "🚀 Guardrail attached to agent config"
echo "================================================"
echo ""
echo "Note: Guardrail will be active on next agent deployment"
