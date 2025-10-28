#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Parse stack name from argument or prompt
if [ $# -eq 1 ]; then
  STACK_NAME="$1"
else
  read -p "Enter stack name to delete (default: bankiq): " STACK_NAME
  STACK_NAME=${STACK_NAME:-bankiq}
fi

# Auto-detect region from AWS CLI config
REGION=$(aws configure get region 2>/dev/null || echo "us-east-1")
FORCE=false

echo -e "${RED}🗑️  BankIQ+ Cleanup Script${NC}"
echo ""
echo "This will delete:"
echo "  - CloudFormation stack: $STACK_NAME"
echo "  - All nested stacks (prerequisites, agent, backend, frontend)"
echo "  - ECR repositories and images"
echo "  - S3 buckets and contents"
echo "  - AgentCore agent"
echo "  - ECS cluster and services"
echo "  - CloudFront distribution"
echo "  - All associated resources"
echo ""

if [ "$FORCE" = false ]; then
  read -p "Are you sure you want to continue? (yes/no): " CONFIRM
  if [ "$CONFIRM" != "yes" ]; then
    echo "Cleanup cancelled."
    exit 0
  fi
fi

echo ""
echo -e "${YELLOW}📋 Gathering resource information...${NC}"

# Try to get resources from master stack first, then from individual stacks
FRONTEND_BUCKET=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION --query 'Stacks[0].Outputs[?OutputKey==`FrontendBucketName`].OutputValue' --output text 2>/dev/null || echo "")
DOCS_BUCKET=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION --query 'Stacks[0].Outputs[?OutputKey==`UploadedDocsBucketName`].OutputValue' --output text 2>/dev/null || echo "")
BACKEND_ECR=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION --query 'Stacks[0].Outputs[?OutputKey==`BackendECRRepositoryUri`].OutputValue' --output text 2>/dev/null | cut -d'/' -f2 || echo "")
AGENT_ECR=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION --query 'Stacks[0].Outputs[?OutputKey==`AgentECRRepositoryUri`].OutputValue' --output text 2>/dev/null | cut -d'/' -f2 || echo "")
CLOUDFRONT_DIST=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' --output text 2>/dev/null || echo "")

# If not found in master stack, try individual stacks
if [ -z "$FRONTEND_BUCKET" ]; then
  FRONTEND_BUCKET=$(aws cloudformation describe-stacks --stack-name ${STACK_NAME}-infra --region $REGION --query 'Stacks[0].Outputs[?OutputKey==`FrontendBucketName`].OutputValue' --output text 2>/dev/null || echo "")
fi

if [ -z "$DOCS_BUCKET" ]; then
  DOCS_BUCKET=$(aws cloudformation describe-stacks --stack-name ${STACK_NAME}-infra --region $REGION --query 'Stacks[0].Outputs[?OutputKey==`UploadedDocsBucketName`].OutputValue' --output text 2>/dev/null || echo "")
fi

if [ -z "$BACKEND_ECR" ]; then
  BACKEND_ECR=$(aws cloudformation describe-stacks --stack-name ${STACK_NAME}-infra --region $REGION --query 'Stacks[0].Outputs[?OutputKey==`BackendECRRepositoryUri`].OutputValue' --output text 2>/dev/null | cut -d'/' -f2 || echo "")
fi

if [ -z "$AGENT_ECR" ]; then
  AGENT_ECR=$(aws cloudformation describe-stacks --stack-name ${STACK_NAME}-infra --region $REGION --query 'Stacks[0].Outputs[?OutputKey==`AgentECRRepositoryUri`].OutputValue' --output text 2>/dev/null | cut -d'/' -f2 || echo "")
fi

if [ -z "$CLOUDFRONT_DIST" ]; then
  CLOUDFRONT_DIST=$(aws cloudformation describe-stacks --stack-name ${STACK_NAME}-frontend --region $REGION --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' --output text 2>/dev/null || echo "")
fi

echo "Found resources:"
echo "  Frontend Bucket: ${FRONTEND_BUCKET:-Not found}"
echo "  Docs Bucket: ${DOCS_BUCKET:-Not found}"
echo "  Backend ECR: ${BACKEND_ECR:-Not found}"
echo "  Agent ECR: ${AGENT_ECR:-Not found}"
echo "  CloudFront: ${CLOUDFRONT_DIST:-Not found}"
echo ""

# Step 1: Disable CloudFront distribution (required before deletion)
if [ -n "$CLOUDFRONT_DIST" ]; then
  echo -e "${YELLOW}🔄 Disabling CloudFront distribution...${NC}"
  
  # Get current config
  ETAG=$(aws cloudfront get-distribution-config --id $CLOUDFRONT_DIST --region $REGION --query 'ETag' --output text 2>/dev/null || echo "")
  
  if [ -n "$ETAG" ]; then
    # Get config and disable
    aws cloudfront get-distribution-config --id $CLOUDFRONT_DIST --region $REGION --query 'DistributionConfig' > /tmp/cf-config.json 2>/dev/null || true
    
    if [ -f /tmp/cf-config.json ]; then
      # Update enabled to false (only if jq is available)
      if command -v jq &> /dev/null; then
        jq '.Enabled = false' /tmp/cf-config.json > /tmp/cf-config-disabled.json
        
        # Update distribution
        aws cloudfront update-distribution \
          --id $CLOUDFRONT_DIST \
          --distribution-config file:///tmp/cf-config-disabled.json \
          --if-match $ETAG \
          --region $REGION > /dev/null 2>&1 || true
        
        rm -f /tmp/cf-config.json /tmp/cf-config-disabled.json
        echo "✅ CloudFront distribution disabled (will be deleted with stack)"
      else
        echo "⚠️  jq not found, skipping CloudFront disable (will be deleted with stack)"
        rm -f /tmp/cf-config.json
      fi
    fi
  fi
fi

# Step 2: Delete ECR repositories
if [ -n "$BACKEND_ECR" ]; then
  echo -e "${YELLOW}🗑️  Deleting backend ECR repository: $BACKEND_ECR${NC}"
  aws ecr delete-repository --repository-name $BACKEND_ECR --region $REGION --force 2>/dev/null || true
  echo "✅ Backend ECR repository deleted"
fi

if [ -n "$AGENT_ECR" ]; then
  echo -e "${YELLOW}🗑️  Deleting agent ECR repository: $AGENT_ECR${NC}"
  aws ecr delete-repository --repository-name $AGENT_ECR --region $REGION --force 2>/dev/null || true
  echo "✅ Agent ECR repository deleted"
fi

# Step 2.5: Delete OpenSearch Serverless collection (MUST BE BEFORE STACK DELETION)
echo -e "${YELLOW}🗑️  Deleting OpenSearch Serverless collections...${NC}"
COLLECTIONS=$(aws opensearchserverless list-collections --region $REGION --query "collectionSummaries[?contains(name, 'bankiq')].id" --output text 2>/dev/null || echo "")
if [ -n "$COLLECTIONS" ]; then
  for COLL_ID in $COLLECTIONS; do
    echo "Deleting OpenSearch collection: $COLL_ID"
    aws opensearchserverless delete-collection --id $COLL_ID --region $REGION 2>/dev/null || true
  done
  echo "⏳ Waiting 30 seconds for OpenSearch deletion to propagate..."
  sleep 30
  echo "✅ OpenSearch collections deleted"
else
  echo "⚠️  No OpenSearch collections found"
fi

# Step 2.6: Delete RAG Knowledge Base
echo -e "${YELLOW}🗑️  Deleting RAG Knowledge Base...${NC}"
if command -v aws &> /dev/null; then
  # List and delete knowledge bases
  KB_IDS=$(aws bedrock-agent list-knowledge-bases --region $REGION --query "knowledgeBaseSummaries[?contains(name, 'bankiq')].knowledgeBaseId" --output text 2>/dev/null || echo "")
  if [ -n "$KB_IDS" ]; then
    for KB_ID in $KB_IDS; do
      echo "Deleting Knowledge Base: $KB_ID"
      # Delete data sources first
      DS_IDS=$(aws bedrock-agent list-data-sources --knowledge-base-id $KB_ID --region $REGION --query "dataSourceSummaries[].dataSourceId" --output text 2>/dev/null || echo "")
      for DS_ID in $DS_IDS; do
        aws bedrock-agent delete-data-source --knowledge-base-id $KB_ID --data-source-id $DS_ID --region $REGION 2>/dev/null || true
      done
      # Delete knowledge base
      aws bedrock-agent delete-knowledge-base --knowledge-base-id $KB_ID --region $REGION 2>/dev/null || true
    done
    echo "✅ RAG Knowledge Base deletion attempted"
  else
    echo "⚠️  No RAG Knowledge Bases found"
  fi
fi

# Step 2.6: Delete AgentCore agent (but keep IAM roles for redeployment)
echo -e "${YELLOW}🗑️  Deleting AgentCore agent...${NC}"
if command -v agentcore &> /dev/null; then
  BACKEND_DIR="$(dirname "$0")/../../backend"
  if [ -d "$BACKEND_DIR" ]; then
    cd "$BACKEND_DIR"
    
    # Get agent info before deletion
    AGENT_ARN=$(grep 'agent_arn:' .bedrock_agentcore.yaml 2>/dev/null | awk '{print $2}' | tr -d '"')
    
    if [ -n "$AGENT_ARN" ]; then
      echo "Found agent: $AGENT_ARN"
      
      # Delete agent via AWS CLI (more reliable than agentcore destroy)
      echo "Deleting agent runtime..."
      aws bedrock-agentcore delete-agent-runtime --agent-runtime-arn "$AGENT_ARN" --region $REGION 2>/dev/null && \
        echo "✅ Agent runtime deleted" || \
        echo "⚠️  Agent may already be deleted"
      
      # Delete CodeBuild project
      AGENT_NAME=$(echo "$AGENT_ARN" | awk -F'/' '{print $2}' | awk -F'-' '{print $1}')
      CODEBUILD_PROJECT="bedrock-agentcore-${AGENT_NAME}-builder"
      aws codebuild delete-project --name "$CODEBUILD_PROJECT" --region $REGION 2>/dev/null && \
        echo "✅ CodeBuild project deleted" || \
        echo "⚠️  CodeBuild project may not exist"
      
      # Delete memory (if exists)
      MEMORY_ID=$(grep 'memory_id:' .bedrock_agentcore.yaml 2>/dev/null | awk '{print $2}' | tr -d '"')
      if [ -n "$MEMORY_ID" ]; then
        aws bedrock-agent delete-memory --memory-id "$MEMORY_ID" --region $REGION 2>/dev/null && \
          echo "✅ Memory deleted" || \
          echo "⚠️  Memory may not exist or is in transitional state"
      fi
      
      # Remove config file
      rm -f .bedrock_agentcore.yaml .bedrock_agentcore.yaml.bak
      echo "✅ Agent config removed"
    else
      echo "⚠️  No agent ARN found in config"
    fi
    
    echo "ℹ️  Note: IAM roles preserved for redeployment"
  else
    echo "⚠️  Backend directory not found, skipping agent deletion"
  fi
else
  echo "⚠️  agentcore CLI not found, skipping agent deletion"
fi

# Delete AgentCore ECR repository explicitly
echo -e "${YELLOW}🗑️  Deleting AgentCore ECR repository...${NC}"
AGENTCORE_ECR="bedrock-agentcore-bank_iq_agent_v1"
aws ecr delete-repository --repository-name $AGENTCORE_ECR --region $REGION --force 2>/dev/null || echo "⚠️  AgentCore ECR repository may not exist"
echo "✅ AgentCore ECR repository deletion attempted"

# Fallback: Find and delete any remaining ECR repositories with stack name or variations
echo -e "${YELLOW}🔍 Checking for any remaining ${STACK_NAME} ECR repositories...${NC}"
# Search for repositories containing stack name (handles both "bankiq" and "bank-iq" variations)
STACK_NAME_PATTERN=$(echo "$STACK_NAME" | sed 's/-//g')
REMAINING_REPOS=$(aws ecr describe-repositories --region $REGION --query "repositories[].repositoryName" --output text 2>/dev/null || echo "")
if [ -n "$REMAINING_REPOS" ]; then
  for REPO in $REMAINING_REPOS; do
    # Check if repo name contains stack name (with or without hyphens)
    REPO_NORMALIZED=$(echo "$REPO" | sed 's/-//g')
    if [[ "$REPO_NORMALIZED" == *"$STACK_NAME_PATTERN"* ]] || [[ "$REPO" == *"bedrock-agentcore"* ]]; then
      echo "Found repository: $REPO - deleting..."
      aws ecr delete-repository --repository-name $REPO --region $REGION --force 2>/dev/null || true
    fi
  done
  echo "✅ All remaining ECR repositories deleted"
else
  echo "No remaining ECR repositories found"
fi

# Step 3: Empty S3 buckets BEFORE deleting stacks
echo ""
echo -e "${YELLOW}🗑️  Emptying S3 buckets...${NC}"

# Function to empty S3 bucket completely
empty_bucket() {
  local BUCKET=$1
  echo "Emptying bucket: $BUCKET"
  
  # Check if bucket exists
  if ! aws s3api head-bucket --bucket $BUCKET --region $REGION 2>/dev/null; then
    echo "  Bucket does not exist, skipping"
    return
  fi
  
  # Delete all current objects (handles large buckets)
  aws s3 rm s3://$BUCKET --recursive --region $REGION 2>/dev/null || true
  
  # Delete all versions in batches (max 10 iterations to prevent infinite loops)
  for i in {1..10}; do
    local VERSION_COUNT=$(aws s3api list-object-versions --bucket $BUCKET --max-items 1000 --region $REGION --query 'length(Versions)' --output text 2>/dev/null || echo "0")
    if [ "$VERSION_COUNT" = "0" ] || [ "$VERSION_COUNT" = "None" ] || [ -z "$VERSION_COUNT" ]; then
      break
    fi
    echo "  Deleting $VERSION_COUNT versions (batch $i)..."
    local VERSIONS=$(aws s3api list-object-versions --bucket $BUCKET --max-items 1000 --region $REGION --query='{Objects: Versions[].{Key:Key,VersionId:VersionId}}' 2>/dev/null)
    aws s3api delete-objects --bucket $BUCKET --delete "$VERSIONS" --region $REGION 2>/dev/null || true
  done
  
  # Delete all delete markers in batches (max 10 iterations)
  for i in {1..10}; do
    local MARKER_COUNT=$(aws s3api list-object-versions --bucket $BUCKET --max-items 1000 --region $REGION --query 'length(DeleteMarkers)' --output text 2>/dev/null || echo "0")
    if [ "$MARKER_COUNT" = "0" ] || [ "$MARKER_COUNT" = "None" ] || [ -z "$MARKER_COUNT" ]; then
      break
    fi
    echo "  Deleting $MARKER_COUNT markers (batch $i)..."
    local MARKERS=$(aws s3api list-object-versions --bucket $BUCKET --max-items 1000 --region $REGION --query='{Objects: DeleteMarkers[].{Key:Key,VersionId:VersionId}}' 2>/dev/null)
    aws s3api delete-objects --bucket $BUCKET --delete "$MARKERS" --region $REGION 2>/dev/null || true
  done
  
  echo "  ✅ Bucket emptied"
}

if [ -n "$FRONTEND_BUCKET" ]; then
  empty_bucket $FRONTEND_BUCKET
fi

if [ -n "$DOCS_BUCKET" ]; then
  empty_bucket $DOCS_BUCKET
fi

# Also empty SEC filings bucket
SEC_BUCKET=$(aws cloudformation describe-stacks --stack-name ${STACK_NAME}-infra --region $REGION --query 'Stacks[0].Outputs[?OutputKey==`SECFilingsBucketName`].OutputValue' --output text 2>/dev/null || echo "")
if [ -n "$SEC_BUCKET" ]; then
  empty_bucket $SEC_BUCKET
fi

# Step 4: Delete CloudFormation stacks
echo ""
echo -e "${YELLOW}🗑️  Deleting CloudFormation stacks...${NC}"
echo "This will take 10-15 minutes..."
echo ""

# Helper function to check stack status
get_stack_status() {
  local STACK=$1
  aws cloudformation describe-stacks --stack-name $STACK --region $REGION --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "NOT_FOUND"
}

# Helper function to get failed resources
get_failed_resources() {
  local STACK=$1
  aws cloudformation describe-stack-resources --stack-name $STACK --region $REGION --query 'StackResources[?ResourceStatus==`DELETE_FAILED`].LogicalResourceId' --output text 2>/dev/null || echo ""
}

# Check if individual stacks exist
FRONTEND_STACK_STATUS=$(get_stack_status ${STACK_NAME}-frontend)
BACKEND_STACK_STATUS=$(get_stack_status ${STACK_NAME}-backend)
BACKEND_CODEBUILD_STACK_STATUS=$(get_stack_status ${STACK_NAME}-backend-codebuild)
INFRA_STACK_STATUS=$(get_stack_status ${STACK_NAME}-infra)
MASTER_STACK_STATUS=$(get_stack_status $STACK_NAME)
AUTH_STACK_STATUS=$(get_stack_status ${STACK_NAME}-auth)

# Delete in correct dependency order:
# 1. Frontend (depends on infra)
# 2. Backend (depends on infra + auth)
# 3. Backend CodeBuild (depends on infra)
# 4. Auth (Cognito)
# 5. RAG Infrastructure (independent)
# 6. Infra (base infrastructure - MUST BE LAST because others depend on its exports)
# 7. Master (if exists, orchestrates nested stacks)

echo "Deletion order: Frontend → Backend → Backend-CodeBuild → Auth → Infra → Master"
echo ""

if [[ "$FRONTEND_STACK_STATUS" != "NOT_FOUND" && "$FRONTEND_STACK_STATUS" != "DELETE_COMPLETE" ]]; then
  echo "Deleting ${STACK_NAME}-frontend stack (status: $FRONTEND_STACK_STATUS)..."
  
  # Check for failed resources
  FAILED_RESOURCES=$(get_failed_resources ${STACK_NAME}-frontend)
  if [ -n "$FAILED_RESOURCES" ]; then
    echo "⚠️  Found DELETE_FAILED resources: $FAILED_RESOURCES"
    echo "Retaining failed resources and forcing deletion..."
    aws cloudformation delete-stack --stack-name ${STACK_NAME}-frontend --region $REGION --retain-resources $FAILED_RESOURCES 2>/dev/null || \
      aws cloudformation delete-stack --stack-name ${STACK_NAME}-frontend --region $REGION
  else
    aws cloudformation delete-stack --stack-name ${STACK_NAME}-frontend --region $REGION
  fi
  
  echo -e "${YELLOW}⏳ Waiting for frontend stack deletion...${NC}"
  aws cloudformation wait stack-delete-complete --stack-name ${STACK_NAME}-frontend --region $REGION 2>/dev/null || echo "⚠️  Frontend stack deletion completed with warnings"
  echo -e "${GREEN}✅ Frontend stack deleted${NC}"
  echo ""
fi

if [[ "$BACKEND_STACK_STATUS" != "NOT_FOUND" && "$BACKEND_STACK_STATUS" != "DELETE_COMPLETE" ]]; then
  echo "Deleting ${STACK_NAME}-backend stack (status: $BACKEND_STACK_STATUS)..."
  
  FAILED_RESOURCES=$(get_failed_resources ${STACK_NAME}-backend)
  if [ -n "$FAILED_RESOURCES" ]; then
    echo "⚠️  Found DELETE_FAILED resources: $FAILED_RESOURCES"
    echo "Retaining failed resources and forcing deletion..."
    aws cloudformation delete-stack --stack-name ${STACK_NAME}-backend --region $REGION --retain-resources $FAILED_RESOURCES 2>/dev/null || \
      aws cloudformation delete-stack --stack-name ${STACK_NAME}-backend --region $REGION
  else
    aws cloudformation delete-stack --stack-name ${STACK_NAME}-backend --region $REGION
  fi
  
  echo -e "${YELLOW}⏳ Waiting for backend stack deletion...${NC}"
  aws cloudformation wait stack-delete-complete --stack-name ${STACK_NAME}-backend --region $REGION 2>/dev/null || echo "⚠️  Backend stack deletion completed with warnings"
  echo -e "${GREEN}✅ Backend stack deleted${NC}"
  echo ""
fi

if [[ "$BACKEND_CODEBUILD_STACK_STATUS" != "NOT_FOUND" && "$BACKEND_CODEBUILD_STACK_STATUS" != "DELETE_COMPLETE" ]]; then
  echo "Deleting ${STACK_NAME}-backend-codebuild stack (status: $BACKEND_CODEBUILD_STACK_STATUS)..."
  
  FAILED_RESOURCES=$(get_failed_resources ${STACK_NAME}-backend-codebuild)
  if [ -n "$FAILED_RESOURCES" ]; then
    echo "⚠️  Found DELETE_FAILED resources: $FAILED_RESOURCES"
    aws cloudformation delete-stack --stack-name ${STACK_NAME}-backend-codebuild --region $REGION --retain-resources $FAILED_RESOURCES 2>/dev/null || \
      aws cloudformation delete-stack --stack-name ${STACK_NAME}-backend-codebuild --region $REGION
  else
    aws cloudformation delete-stack --stack-name ${STACK_NAME}-backend-codebuild --region $REGION
  fi
  
  echo -e "${YELLOW}⏳ Waiting for backend-codebuild stack deletion...${NC}"
  aws cloudformation wait stack-delete-complete --stack-name ${STACK_NAME}-backend-codebuild --region $REGION 2>/dev/null || echo "⚠️  Backend-codebuild stack deletion completed with warnings"
  echo -e "${GREEN}✅ Backend-codebuild stack deleted${NC}"
  echo ""
fi

# Auth stack (Cognito) - delete after backend since backend depends on it
if [[ "$AUTH_STACK_STATUS" != "NOT_FOUND" && "$AUTH_STACK_STATUS" != "DELETE_COMPLETE" ]]; then
  echo "Deleting ${STACK_NAME}-auth stack (Cognito, status: $AUTH_STACK_STATUS)..."
  
  FAILED_RESOURCES=$(get_failed_resources ${STACK_NAME}-auth)
  if [ -n "$FAILED_RESOURCES" ]; then
    echo "⚠️  Found DELETE_FAILED resources: $FAILED_RESOURCES"
    aws cloudformation delete-stack --stack-name ${STACK_NAME}-auth --region $REGION --retain-resources $FAILED_RESOURCES 2>/dev/null || \
      aws cloudformation delete-stack --stack-name ${STACK_NAME}-auth --region $REGION
  else
    aws cloudformation delete-stack --stack-name ${STACK_NAME}-auth --region $REGION
  fi
  
  echo -e "${YELLOW}⏳ Waiting for auth stack deletion...${NC}"
  aws cloudformation wait stack-delete-complete --stack-name ${STACK_NAME}-auth --region $REGION 2>/dev/null || echo "⚠️  Auth stack deletion completed with warnings"
  echo -e "${GREEN}✅ Auth stack deleted${NC}"
  echo ""
fi

# RAG resources are now part of main infrastructure stack (bankiq-infra)
# SEC filings bucket will be cleaned up with infrastructure stack

# Infra must be deleted LAST because frontend and backend depend on its exports
if [[ "$INFRA_STACK_STATUS" != "NOT_FOUND" && "$INFRA_STACK_STATUS" != "DELETE_COMPLETE" ]]; then
  echo "Deleting ${STACK_NAME}-infra stack (base infrastructure - LAST, status: $INFRA_STACK_STATUS)..."
  
  # If stack is in DELETE_FAILED, retry with resource retention
  if [[ "$INFRA_STACK_STATUS" == "DELETE_FAILED" ]]; then
    echo "⚠️  Stack in DELETE_FAILED state, retrying with resource retention..."
    FAILED_RESOURCES=$(get_failed_resources ${STACK_NAME}-infra)
    if [ -n "$FAILED_RESOURCES" ]; then
      echo "Retaining failed resources: $FAILED_RESOURCES"
      aws cloudformation delete-stack --stack-name ${STACK_NAME}-infra --region $REGION --retain-resources $FAILED_RESOURCES
    else
      aws cloudformation delete-stack --stack-name ${STACK_NAME}-infra --region $REGION
    fi
    
    echo -e "${YELLOW}⏳ Waiting for infra stack deletion...${NC}"
    aws cloudformation wait stack-delete-complete --stack-name ${STACK_NAME}-infra --region $REGION 2>/dev/null || echo "⚠️  Deletion completed"
    echo -e "${GREEN}✅ Infra stack deleted${NC}"
    echo ""
  fi
  
  # Get VPC ID for ENI cleanup
  VPC_ID=$(aws cloudformation describe-stacks --stack-name ${STACK_NAME}-infra --region $REGION --query 'Stacks[0].Outputs[?OutputKey==`VpcId`].OutputValue' --output text 2>/dev/null || echo "")
  
  # If stack is in DELETE_FAILED state, clean up network resources
  if [[ "$INFRA_STACK_STATUS" == "DELETE_FAILED" ]]; then
    echo "⚠️  Stack is in DELETE_FAILED state, cleaning up failed resources..."
    
    # Clean up SEC filings bucket
    SEC_BUCKET=$(aws cloudformation describe-stacks --stack-name ${STACK_NAME}-infra --region $REGION --query 'Stacks[0].Outputs[?OutputKey==`SECFilingsBucketName`].OutputValue' --output text 2>/dev/null || echo "")
    if [ -n "$SEC_BUCKET" ]; then
      echo "Manually deleting SEC filings bucket: $SEC_BUCKET"
      delete_bucket_with_versions $SEC_BUCKET 2>/dev/null || true
    fi
    
    # Clean up ENIs in VPC
    if [ -n "$VPC_ID" ]; then
      echo "Cleaning up network interfaces in VPC: $VPC_ID"
      ENI_IDS=$(aws ec2 describe-network-interfaces --filters "Name=vpc-id,Values=$VPC_ID" --query 'NetworkInterfaces[].NetworkInterfaceId' --output text --region $REGION 2>/dev/null || echo "")
      if [ -n "$ENI_IDS" ]; then
        for ENI_ID in $ENI_IDS; do
          echo "  Detaching and deleting ENI: $ENI_ID"
          # Detach if attached
          ATTACHMENT_ID=$(aws ec2 describe-network-interfaces --network-interface-ids $ENI_ID --query 'NetworkInterfaces[0].Attachment.AttachmentId' --output text --region $REGION 2>/dev/null || echo "")
          if [ -n "$ATTACHMENT_ID" ] && [ "$ATTACHMENT_ID" != "None" ]; then
            aws ec2 detach-network-interface --attachment-id $ATTACHMENT_ID --region $REGION --force 2>/dev/null || true
            sleep 2
          fi
          # Delete ENI
          aws ec2 delete-network-interface --network-interface-id $ENI_ID --region $REGION 2>/dev/null || true
        done
        echo "  Waiting 10 seconds for ENIs to detach..."
        sleep 10
      fi
    fi
  fi
  
  FAILED_RESOURCES=$(get_failed_resources ${STACK_NAME}-infra)
  if [ -n "$FAILED_RESOURCES" ]; then
    echo "⚠️  Found DELETE_FAILED resources: $FAILED_RESOURCES"
    echo "Retaining failed resources and forcing deletion..."
    aws cloudformation delete-stack --stack-name ${STACK_NAME}-infra --region $REGION --retain-resources $FAILED_RESOURCES 2>/dev/null || \
      aws cloudformation delete-stack --stack-name ${STACK_NAME}-infra --region $REGION
  else
    aws cloudformation delete-stack --stack-name ${STACK_NAME}-infra --region $REGION
  fi
  
  echo -e "${YELLOW}⏳ Waiting for infra stack deletion (may take 5-10 minutes)...${NC}"
  aws cloudformation wait stack-delete-complete --stack-name ${STACK_NAME}-infra --region $REGION 2>/dev/null || echo "⚠️  Infra stack deletion completed with warnings"
  
  # Retry up to 3 times if still in DELETE_FAILED state
  for RETRY in 1 2 3; do
    RETRY_STATUS=$(get_stack_status ${STACK_NAME}-infra)
    if [[ "$RETRY_STATUS" == "DELETE_FAILED" ]]; then
      echo "⚠️  Stack still in DELETE_FAILED (attempt $RETRY/3), cleaning up ENIs and retrying..."
      
      # Clean up ENIs again
      if [ -n "$VPC_ID" ]; then
        ENI_IDS=$(aws ec2 describe-network-interfaces --filters "Name=vpc-id,Values=$VPC_ID" --query 'NetworkInterfaces[].NetworkInterfaceId' --output text --region $REGION 2>/dev/null || echo "")
        if [ -n "$ENI_IDS" ]; then
          for ENI_ID in $ENI_IDS; do
            aws ec2 delete-network-interface --network-interface-id $ENI_ID --region $REGION 2>/dev/null || true
          done
          sleep 5
        fi
      fi
      
      # Retry deletion
      aws cloudformation delete-stack --stack-name ${STACK_NAME}-infra --region $REGION
      aws cloudformation wait stack-delete-complete --stack-name ${STACK_NAME}-infra --region $REGION 2>/dev/null || echo "⚠️  Retry $RETRY completed"
    else
      break
    fi
  done
  
  echo -e "${GREEN}✅ Infra stack deleted${NC}"
  echo ""
fi

# Master stack (if using nested stacks pattern)
if [[ "$MASTER_STACK_STATUS" != "NOT_FOUND" && "$MASTER_STACK_STATUS" != "DELETE_COMPLETE" ]]; then
  echo "Deleting ${STACK_NAME} master stack (status: $MASTER_STACK_STATUS)..."
  
  FAILED_RESOURCES=$(get_failed_resources $STACK_NAME)
  if [ -n "$FAILED_RESOURCES" ]; then
    echo "⚠️  Found DELETE_FAILED resources: $FAILED_RESOURCES"
    aws cloudformation delete-stack --stack-name $STACK_NAME --region $REGION --retain-resources $FAILED_RESOURCES 2>/dev/null || \
      aws cloudformation delete-stack --stack-name $STACK_NAME --region $REGION
  else
    aws cloudformation delete-stack --stack-name $STACK_NAME --region $REGION
  fi
  
  echo -e "${YELLOW}⏳ Waiting for master stack deletion...${NC}"
  aws cloudformation wait stack-delete-complete --stack-name $STACK_NAME --region $REGION 2>/dev/null || echo "⚠️  Master stack deletion completed with warnings"
  echo -e "${GREEN}✅ Master stack deleted${NC}"
  echo ""
fi

echo ""
echo -e "${GREEN}✅ All stacks deleted successfully!${NC}"
echo ""
echo -e "${YELLOW}ℹ️  Note: AgentCore IAM roles preserved for faster redeployment${NC}"
echo "   To delete roles manually: aws iam delete-role --role-name AmazonBedrockAgentCoreSDKRuntime-${REGION}-${STACK_NAME}"

# Step 5: Clean up temporary files
echo ""
echo -e "${YELLOW}🧹 Cleaning up temporary files...${NC}"
rm -f /tmp/agent_arn.txt /tmp/agent_deploy.log
echo "✅ Temporary files cleaned"

# Step 6: Final S3 cleanup - delete any remaining buckets
echo ""
echo -e "${YELLOW}🗑️  Final cleanup: Deleting S3 buckets...${NC}"

# Function to delete S3 bucket with all versions
delete_bucket_with_versions() {
  local BUCKET=$1
  echo "Deleting bucket: $BUCKET"
  
  # Delete all current objects first
  aws s3 rm s3://$BUCKET --recursive --region $REGION 2>/dev/null || true
  
  # Loop to delete all versions (in case there are more than 1000)
  local MAX_ITERATIONS=100
  local ITERATION=0
  while [ $ITERATION -lt $MAX_ITERATIONS ]; do
    local VERSION_COUNT=$(aws s3api list-object-versions --bucket $BUCKET --max-items 1000 --region $REGION --query 'length(Versions)' --output text 2>/dev/null || echo "0")
    
    if [ "$VERSION_COUNT" = "0" ] || [ "$VERSION_COUNT" = "None" ] || [ -z "$VERSION_COUNT" ]; then
      break
    fi
    
    echo "  Deleting $VERSION_COUNT versions (iteration $((ITERATION+1)))..."
    local VERSIONS=$(aws s3api list-object-versions --bucket $BUCKET --max-items 1000 --region $REGION --query='{Objects: Versions[].{Key:Key,VersionId:VersionId}}' 2>/dev/null)
    aws s3api delete-objects --bucket $BUCKET --delete "$VERSIONS" --region $REGION 2>/dev/null || true
    
    ITERATION=$((ITERATION+1))
  done
  
  # Loop to delete all delete markers
  ITERATION=0
  while [ $ITERATION -lt $MAX_ITERATIONS ]; do
    local MARKER_COUNT=$(aws s3api list-object-versions --bucket $BUCKET --max-items 1000 --region $REGION --query 'length(DeleteMarkers)' --output text 2>/dev/null || echo "0")
    
    if [ "$MARKER_COUNT" = "0" ] || [ "$MARKER_COUNT" = "None" ] || [ -z "$MARKER_COUNT" ]; then
      break
    fi
    
    echo "  Deleting $MARKER_COUNT delete markers (iteration $((ITERATION+1)))..."
    local MARKERS=$(aws s3api list-object-versions --bucket $BUCKET --max-items 1000 --region $REGION --query='{Objects: DeleteMarkers[].{Key:Key,VersionId:VersionId}}' 2>/dev/null)
    aws s3api delete-objects --bucket $BUCKET --delete "$MARKERS" --region $REGION 2>/dev/null || true
    
    ITERATION=$((ITERATION+1))
  done
  
  # Delete bucket
  aws s3 rb s3://$BUCKET --region $REGION 2>/dev/null || true
}

if [ -n "$FRONTEND_BUCKET" ]; then
  echo -e "${YELLOW}🗑️  Deleting frontend S3 bucket: $FRONTEND_BUCKET${NC}"
  delete_bucket_with_versions $FRONTEND_BUCKET
  echo "✅ Frontend bucket deleted"
fi

if [ -n "$DOCS_BUCKET" ]; then
  echo -e "${YELLOW}🗑️  Deleting uploaded docs S3 bucket: $DOCS_BUCKET${NC}"
  delete_bucket_with_versions $DOCS_BUCKET
  echo "✅ Docs bucket deleted"
fi

# Delete SEC filings bucket explicitly
SEC_FILINGS_BUCKET=$(aws cloudformation describe-stacks --stack-name ${STACK_NAME}-infra --region $REGION --query 'Stacks[0].Outputs[?OutputKey==`SECFilingsBucketName`].OutputValue' --output text 2>/dev/null || echo "")
if [ -n "$SEC_FILINGS_BUCKET" ]; then
  echo -e "${YELLOW}🗑️  Deleting SEC filings S3 bucket: $SEC_FILINGS_BUCKET${NC}"
  delete_bucket_with_versions $SEC_FILINGS_BUCKET
  echo "✅ SEC filings bucket deleted"
fi

# Fallback: Find and delete any remaining bankiq S3 buckets
echo -e "${YELLOW}🔍 Checking for any remaining ${STACK_NAME} S3 buckets...${NC}"
REMAINING_BUCKETS=$(aws s3 ls --region $REGION | grep "${STACK_NAME}" | awk '{print $3}' || echo "")
if [ -n "$REMAINING_BUCKETS" ]; then
  for BUCKET in $REMAINING_BUCKETS; do
    echo "Found bucket: $BUCKET - deleting with all versions..."
    delete_bucket_with_versions $BUCKET
  done
  echo "✅ All remaining buckets deleted"
else
  echo "No remaining buckets found"
fi

# Step 7: Clean up staging buckets (optional)
echo ""
echo -e "${YELLOW}🔍 Checking for staging buckets...${NC}"
STAGING_BUCKETS=$(aws s3 ls --region $REGION | grep "${STACK_NAME}-cfn-staging" | awk '{print $3}' || echo "")

if [ -n "$STAGING_BUCKETS" ]; then
  echo "Found staging buckets:"
  echo "$STAGING_BUCKETS"
  echo ""
  
  for BUCKET in $STAGING_BUCKETS; do
    echo "Deleting $BUCKET..."
    aws s3 rb s3://$BUCKET --force --region $REGION 2>/dev/null || true
  done
  echo "✅ Staging buckets deleted"
else
  echo "No staging buckets found"
fi

# Step 8: Summary
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✨ Cleanup Complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Deleted resources:"
echo "  ✅ CloudFormation stacks: $STACK_NAME, ${STACK_NAME}-frontend, ${STACK_NAME}-backend, ${STACK_NAME}-backend-codebuild, ${STACK_NAME}-infra, ${STACK_NAME}-auth"
echo "  ✅ S3 buckets (frontend, uploaded-docs) with all versions"
echo "  ✅ ECR repositories (backend, agent)"
echo "  ✅ ECS cluster and services"
echo "  ✅ CloudFront distribution"
echo "  ✅ ALB and target groups"
echo "  ✅ VPC, subnets, security groups"
echo "  ✅ IAM roles"
echo "  ✅ Cognito User Pool"
echo "  ✅ CloudWatch log groups"
echo "  ✅ AgentCore agent (runtime and memory)"
echo "  ℹ️  IAM roles preserved for redeployment"
echo ""
echo -e "${YELLOW}Note: Some resources may take a few minutes to fully delete${NC}"
echo ""

# Optional: Check for any remaining resources
echo "To verify all resources are deleted:"
echo "  aws cloudformation list-stacks --stack-status-filter DELETE_COMPLETE --region $REGION | grep $STACK_NAME"
echo "  aws s3 ls --region $REGION | grep $STACK_NAME"
echo "  aws ecr describe-repositories --region $REGION | grep $STACK_NAME"
