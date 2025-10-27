#!/bin/bash
set -e

echo "🛡️ Attaching Bedrock Guardrail to BankIQ+ Agent"
echo "================================================"
echo ""

# Check if guardrail config exists
if [ ! -f /tmp/guardrail_config.json ]; then
  echo "❌ Guardrail config not found. Run create-bedrock-guardrail.py first."
  exit 1
fi

# Read guardrail config
GUARDRAIL_ID=$(cat /tmp/guardrail_config.json | grep -o '"guardrailId": "[^"]*' | cut -d'"' -f4)
GUARDRAIL_VERSION=$(cat /tmp/guardrail_config.json | grep -o '"version": "[^"]*' | cut -d'"' -f4)

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
echo "🚀 NEXT STEP: Redeploy agent"
echo "================================================"
echo ""
echo "Run: cd backend && agentcore launch -auc"
echo ""
echo "This will update your agent with guardrail protection."
