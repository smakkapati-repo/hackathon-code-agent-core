#!/bin/bash
set -e

# Get script directory at the very beginning (Windows Git Bash compatible)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
if [ -z "$SCRIPT_DIR" ]; then
  SCRIPT_DIR="$(dirname "$(readlink -f "$0")")"
fi

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

STACK_NAME=${1:-bankiq}
REGION=${AWS_DEFAULT_REGION:-${2:-$(aws configure get region 2>/dev/null || echo "us-east-1")}}

echo -e "${PURPLE}"
echo "═══════════════════════════════════════════════════════════════"
echo "  🚀 BankIQ+ FULL DEPLOYMENT WITH COGNITO"
echo "═══════════════════════════════════════════════════════════════"
echo -e "${CYAN}  Stack: ${YELLOW}$STACK_NAME${NC}"
echo -e "${CYAN}  Region: ${YELLOW}$REGION${NC}"
echo -e "${CYAN}  Estimated Time: ${YELLOW}20-25 minutes${NC}"
echo -e "${PURPLE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Phase 0: Auth
echo -e "${BLUE}┌─────────────────────────────────────────────────────────────┐${NC}"
echo -e "${BLUE}│${NC} ${GREEN}[0/4]${NC} ${CYAN}Deploying Cognito Authentication...${NC}                ${BLUE}│${NC}"
echo -e "${BLUE}└─────────────────────────────────────────────────────────────┘${NC}"
${SCRIPT_DIR}/deploy-auth.sh $STACK_NAME $REGION
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Phase 0 failed${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Phase 0 Complete!${NC}\n"

# Phase 1: Infrastructure (MUST BE FIRST - creates ECR repos)
echo -e "${BLUE}┌─────────────────────────────────────────────────────────────┐${NC}"
echo -e "${BLUE}│${NC} ${GREEN}[1/4]${NC} ${CYAN}Deploying Infrastructure (VPC, ALB, ECS, ECR)...${NC}    ${BLUE}│${NC}"
echo -e "${BLUE}└─────────────────────────────────────────────────────────────┘${NC}"

INFRA_EXISTS=$(aws cloudformation describe-stacks --stack-name ${STACK_NAME}-infra --region $REGION >/dev/null 2>&1 && echo "yes" || echo "no")
if [ "$INFRA_EXISTS" = "yes" ]; then
  echo "✅ Infrastructure stack already exists - skipping"
else
  ${SCRIPT_DIR}/deploy-infrastructure.sh $STACK_NAME $REGION
  if [ $? -ne 0 ]; then
      echo -e "${RED}❌ Phase 1 failed${NC}"
      exit 1
  fi
fi
echo -e "${GREEN}✅ Phase 1 Complete!${NC}\n"

# Phase 2: Agent + RAG Setup (parallel)
echo -e "${BLUE}┌─────────────────────────────────────────────────────────────┐${NC}"
echo -e "${BLUE}│${NC} ${GREEN}[2/4]${NC} ${CYAN}Deploying Agent + RAG Knowledge Base...${NC}             ${BLUE}│${NC}"
echo -e "${BLUE}└─────────────────────────────────────────────────────────────┘${NC}"

echo -e "${YELLOW}Downloading SEC filings (40 files)...${NC}"
# Detect Python command (python3 on Mac/Linux, python on Windows)
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo -e "${RED}ERROR: Python not found. Please install Python 3.10+${NC}"
    exit 1
fi
$PYTHON_CMD ${SCRIPT_DIR}/download-sec-filings.py

# Run KB creation first, then agent deployment (sequential for reliability)
echo -e "${YELLOW}Creating Knowledge Base...${NC}"
$PYTHON_CMD ${SCRIPT_DIR}/deploy-knowledge-base.py
KB_ID=$(aws bedrock-agent list-knowledge-bases --region $REGION --query "knowledgeBaseSummaries[?name=='bankiq-sec-filings-kb'].knowledgeBaseId" --output text)
echo "$KB_ID" > /tmp/knowledge_base_id.txt
echo -e "${GREEN}✅ KB created: $KB_ID${NC}"

echo -e "${YELLOW}Deploying AgentCore Agent...${NC}"
${SCRIPT_DIR}/deploy-agent.sh
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Agent deployment failed${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Agent deployed${NC}"

# Create and attach Bedrock Guardrails (non-blocking)
echo -e "${YELLOW}Creating Bedrock Guardrails...${NC}"
GUARDRAIL_EXISTS=$(aws bedrock list-guardrails --region $REGION --query "guardrails[?name=='bankiq-guardrail'].id" --output text 2>/dev/null)
if [ -z "$GUARDRAIL_EXISTS" ]; then
  $PYTHON_CMD ${SCRIPT_DIR}/create-bedrock-guardrail.py 2>/dev/null || echo -e "${YELLOW}⚠️  Guardrail creation failed (non-critical)${NC}"
  echo -e "${GREEN}✅ Guardrail setup attempted${NC}"
else
  echo -e "${GREEN}✅ Guardrail already exists - skipping${NC}"
fi

KB_ID=$(cat /tmp/knowledge_base_id.txt 2>/dev/null || echo "pending")
echo -e "${GREEN}✅ Phase 2 Complete! KB ID: $KB_ID${NC}\n"

# Phase 3: Backend
echo -e "${BLUE}┌─────────────────────────────────────────────────────────────┐${NC}"
echo -e "${BLUE}│${NC} ${GREEN}[3/4]${NC} ${CYAN}Building & Deploying Backend Container...${NC}           ${BLUE}│${NC}"
echo -e "${BLUE}└─────────────────────────────────────────────────────────────┘${NC}"

# Backend will read agent ARN directly from .bedrock_agentcore.yaml

${SCRIPT_DIR}/deploy-backend.sh $STACK_NAME $REGION
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Phase 4 failed${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Phase 4 Complete!${NC}\n"

# Phase 4: Frontend
echo -e "${BLUE}┌─────────────────────────────────────────────────────────────┐${NC}"
echo -e "${BLUE}│${NC} ${GREEN}[4/4]${NC} ${CYAN}Building & Deploying Frontend (React + S3)...${NC}       ${BLUE}│${NC}"
echo -e "${BLUE}└─────────────────────────────────────────────────────────────┘${NC}"
${SCRIPT_DIR}/deploy-frontend.sh $STACK_NAME $REGION
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Phase 5 failed${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Phase 5 Complete!${NC}\n"

# Update Cognito Callback URLs
echo -e "${BLUE}┌─────────────────────────────────────────────────────────────┐${NC}"
echo -e "${BLUE}│${NC} ${CYAN}Updating Cognito Callback URLs...${NC}                       ${BLUE}│${NC}"
echo -e "${BLUE}└─────────────────────────────────────────────────────────────┘${NC}"

CLOUDFRONT_URL=$(aws cloudformation describe-stacks --stack-name ${STACK_NAME}-frontend --region $REGION --query 'Stacks[0].Outputs[?OutputKey==`ApplicationUrl`].OutputValue' --output text)

if [ -n "$CLOUDFRONT_URL" ]; then
  echo "Updating Cognito callback URLs with: $CLOUDFRONT_URL"
  
  USER_POOL_ID=$(aws cloudformation describe-stacks --stack-name ${STACK_NAME}-auth --region $REGION --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' --output text)
  CLIENT_ID=$(aws cloudformation describe-stacks --stack-name ${STACK_NAME}-auth --region $REGION --query 'Stacks[0].Outputs[?OutputKey==`UserPoolClientId`].OutputValue' --output text)
  
  aws cognito-idp update-user-pool-client \
    --user-pool-id $USER_POOL_ID \
    --client-id $CLIENT_ID \
    --callback-urls "$CLOUDFRONT_URL" "${CLOUDFRONT_URL}/" "http://localhost:3000" \
    --logout-urls "$CLOUDFRONT_URL" "${CLOUDFRONT_URL}/" "http://localhost:3000" \
    --supported-identity-providers "COGNITO" \
    --allowed-o-auth-flows "code" \
    --allowed-o-auth-scopes "email" "openid" "profile" \
    --allowed-o-auth-flows-user-pool-client \
    --region $REGION > /dev/null
  
  echo "✅ Cognito callback URLs updated"
else
  echo "⚠️  Could not get CloudFront URL - skipping callback URL update"
fi
echo ""

echo -e "${GREEN}"
echo "═══════════════════════════════════════════════════════════════"
echo "  ✅ DEPLOYMENT COMPLETE WITH COGNITO!"
echo "═══════════════════════════════════════════════════════════════"
echo -e "${NC}"
echo -e "${CYAN}🌐 Application URL: ${YELLOW}$CLOUDFRONT_URL${NC}"
COGNITO_DOMAIN=$(aws cloudformation describe-stacks --stack-name ${STACK_NAME}-auth --region $REGION --query 'Stacks[0].Outputs[?OutputKey==`CognitoDomain`].OutputValue' --output text 2>/dev/null || echo "bankiq-auth-$(aws sts get-caller-identity --query Account --output text)")
echo -e "${CYAN}🔐 Login URL: ${YELLOW}https://$COGNITO_DOMAIN.auth.$REGION.amazoncognito.com${NC}"
echo -e "${CYAN}📊 View logs: ${YELLOW}aws logs tail /ecs/bankiq-backend --follow${NC}"
echo -e "${CYAN}🔍 Monitor: ${YELLOW}agentcore status${NC}"

# Show RAG status
if [ -f /tmp/knowledge_base_id.txt ] && [ -s /tmp/knowledge_base_id.txt ]; then
  KB_ID=$(cat /tmp/knowledge_base_id.txt)
  echo -e "${CYAN}🧠 RAG Knowledge Base: ${YELLOW}$KB_ID${NC}"
  echo -e "${CYAN}📁 RAG Mode: ${GREEN}Enabled${NC} (Top 10 banks, Oct 2024-Oct 2025)"
fi

echo ""
echo -e "${YELLOW}📝 Next Steps:${NC}"
echo "  1. Visit: $CLOUDFRONT_URL"
echo "  2. Click 'Sign In with AWS Cognito'"
echo "  3. Click 'Sign up' to create your account"
echo "  4. Verify your email and log in"
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
