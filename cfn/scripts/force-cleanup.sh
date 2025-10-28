#!/bin/bash
set -e

STACK_NAME=${1:-bankiq}
REGION=${AWS_DEFAULT_REGION:-us-east-1}

echo "🔥 FORCE CLEANUP - Deleting everything without waiting"
echo "Stack: $STACK_NAME"
echo "Region: $REGION"
echo ""

# 1. Delete OpenSearch Serverless collection FIRST (main blocker)
echo "🗑️ Deleting OpenSearch Serverless collections..."
COLLECTIONS=$(aws opensearchserverless list-collections --region $REGION --query "collectionSummaries[?contains(name, 'bankiq')].id" --output text 2>/dev/null || echo "")
for COLL_ID in $COLLECTIONS; do
  echo "Deleting collection: $COLL_ID"
  aws opensearchserverless delete-collection --id $COLL_ID --region $REGION 2>/dev/null || true
done

# 2. Delete all stacks in parallel (don't wait)
echo "🗑️ Triggering stack deletions (parallel)..."
aws cloudformation delete-stack --stack-name ${STACK_NAME}-frontend --region $REGION 2>/dev/null || true
aws cloudformation delete-stack --stack-name ${STACK_NAME}-backend --region $REGION 2>/dev/null || true
aws cloudformation delete-stack --stack-name ${STACK_NAME}-backend-codebuild --region $REGION 2>/dev/null || true
aws cloudformation delete-stack --stack-name ${STACK_NAME}-auth --region $REGION 2>/dev/null || true

# Wait 30 seconds for dependent stacks to start deleting
echo "⏳ Waiting 30s for dependent stacks..."
sleep 30

# 3. Force delete infra stack
echo "🗑️ Force deleting infra stack..."
aws cloudformation delete-stack --stack-name ${STACK_NAME}-infra --region $REGION 2>/dev/null || true

# 4. Empty and delete S3 buckets
echo "🗑️ Deleting S3 buckets..."
for BUCKET in $(aws s3 ls --region $REGION | grep "${STACK_NAME}" | awk '{print $3}'); do
  echo "Deleting bucket: $BUCKET"
  aws s3 rb s3://$BUCKET --force --region $REGION 2>/dev/null || true
done

# 5. Delete ECR repos
echo "🗑️ Deleting ECR repositories..."
for REPO in $(aws ecr describe-repositories --region $REGION --query "repositories[].repositoryName" --output text 2>/dev/null); do
  if [[ "$REPO" == *"bankiq"* ]] || [[ "$REPO" == *"bedrock-agentcore"* ]]; then
    echo "Deleting repo: $REPO"
    aws ecr delete-repository --repository-name $REPO --region $REGION --force 2>/dev/null || true
  fi
done

# 6. Delete Knowledge Base
echo "🗑️ Deleting Knowledge Bases..."
for KB_ID in $(aws bedrock-agent list-knowledge-bases --region $REGION --query "knowledgeBaseSummaries[?contains(name, 'bankiq')].knowledgeBaseId" --output text 2>/dev/null); do
  echo "Deleting KB: $KB_ID"
  aws bedrock-agent delete-knowledge-base --knowledge-base-id $KB_ID --region $REGION 2>/dev/null || true
done

# 7. Delete AgentCore agent
echo "🗑️ Deleting AgentCore agent..."
cd "$(dirname "$0")/../../backend" 2>/dev/null || true
if [ -f .bedrock_agentcore.yaml ]; then
  AGENT_ARN=$(grep 'agent_arn:' .bedrock_agentcore.yaml | awk '{print $2}' | tr -d '"')
  if [ -n "$AGENT_ARN" ]; then
    aws bedrock-agentcore delete-agent-runtime --agent-runtime-arn "$AGENT_ARN" --region $REGION 2>/dev/null || true
  fi
  rm -f .bedrock_agentcore.yaml
fi

echo ""
echo "✅ Force cleanup triggered!"
echo "⏳ Stacks will delete in background (5-10 minutes)"
echo ""
echo "Check status:"
echo "  aws cloudformation list-stacks --region $REGION | grep $STACK_NAME"
