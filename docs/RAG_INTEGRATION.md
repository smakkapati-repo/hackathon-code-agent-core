# RAG Integration Guide

## Overview

BankIQ+ includes **optional RAG (Retrieval-Augmented Generation)** using Amazon Bedrock Knowledge Base with OpenSearch Serverless for fast semantic search on pre-indexed SEC filings.

## Architecture

```
User Query → Agent → chat_with_rag_knowledge_base tool
                ↓
         Bedrock Knowledge Base (vector search)
                ↓
         OpenSearch Serverless (40 pre-indexed filings)
                ↓
         Claude Sonnet 3 (answer generation with citations)
```

## Data Coverage

- **Banks**: Top 10 only (JPMorgan, BofA, Wells, Citi, USB, PNC, Goldman, Truist, CapOne, Morgan Stanley)
- **Timeframe**: October 2024 - October 2025 (1 year)
- **Documents**: 40 filings total (1 × 10-K + 3 × 10-Q per bank)
- **Embedding Model**: Amazon Titan Embed Text v2
- **Generation Model**: Claude Sonnet 3

## Deployment

### Option 1: Deploy with Main Stack (Interactive)

```bash
./cfn/scripts/deploy-all.sh
# When prompted: "Deploy RAG Knowledge Base? (y/n, default: n):"
# Enter: y
```

### Option 2: Deploy RAG Separately

```bash
# 1. Deploy infrastructure
./cfn/scripts/rag-phase1-infrastructure.sh

# 2. Download SEC filings (40 files, ~2-3 minutes)
python3 cfn/scripts/download-sec-filings.py

# 3. Verify downloads
python3 cfn/scripts/verify-rag-downloads.py

# 4. Create Knowledge Base and start ingestion (5-15 minutes)
python3 cfn/scripts/rag-phase3-create-knowledge-base.py

# 5. Redeploy backend with KB ID
# Get KB ID
KB_ID=$(aws bedrock-agent list-knowledge-bases --region us-east-1 \
  --query "knowledgeBaseSummaries[?name=='bankiq-sec-filings-kb'].knowledgeBaseId" \
  --output text)

# Update backend stack
aws cloudformation update-stack \
  --stack-name bankiq-backend \
  --use-previous-template \
  --parameters \
    ParameterKey=KnowledgeBaseId,ParameterValue=$KB_ID \
    ParameterKey=ProjectName,UsePreviousValue=true \
    ParameterKey=Environment,UsePreviousValue=true \
    ParameterKey=PrerequisitesStackName,UsePreviousValue=true \
    ParameterKey=AgentArn,UsePreviousValue=true \
    ParameterKey=VpcId,UsePreviousValue=true \
    ParameterKey=SubnetIds,UsePreviousValue=true \
    ParameterKey=BackendImageTag,UsePreviousValue=true \
  --capabilities CAPABILITY_IAM
```

## Agent Tool Usage

The agent automatically selects the RAG tool when:
- User is in **RAG mode**
- Bank is one of the **top 10**
- Timeframe is **Oct 2024 - Oct 2025**

### RAG-Specific Tools

```python
# Chat/Q&A with RAG
chat_with_rag_knowledge_base(question, bank_name)
# Example: "What are JPMorgan's key risks?"

# Full report from RAG
generate_rag_indexed_report(bank_name)
# Example: "Generate full report for Wells Fargo"
```

### Fallback Behavior

If RAG is unavailable or bank not in top 10:
- Agent automatically falls back to **Live SEC EDGAR** mode
- Uses `chat_with_live_filings` or `generate_live_sec_report`
- No user intervention needed

## Performance Comparison

| Mode | Data Source | Coverage | Speed | Cost |
|------|-------------|----------|-------|------|
| **RAG** | Pre-indexed vectors | Top 10 banks, 1 year | **Instant** | Low |
| **Live** | SEC EDGAR API | All banks, all time | 2-5 seconds | Medium |
| **Local** | User uploads | Custom | Varies | High |

## Cost Estimate

Monthly costs (RAG enabled):
- OpenSearch Serverless: $30-40
- Bedrock Knowledge Base: $5-10
- S3 storage (40 files): <$1
- **Total additional**: ~$35-50/month

## Monitoring

```bash
# Check Knowledge Base status
aws bedrock-agent get-knowledge-base \
  --knowledge-base-id <KB_ID> \
  --region us-east-1

# Check ingestion job status
aws bedrock-agent list-ingestion-jobs \
  --knowledge-base-id <KB_ID> \
  --data-source-id <DS_ID> \
  --region us-east-1

# View OpenSearch collection
aws opensearchserverless list-collections \
  --region us-east-1
```

## Cleanup

RAG resources are automatically deleted by `cleanup.sh`:

```bash
./cfn/scripts/cleanup.sh
```

Manual cleanup:
```bash
# Delete Knowledge Base
aws bedrock-agent delete-knowledge-base \
  --knowledge-base-id <KB_ID> \
  --region us-east-1

# Delete CloudFormation stack
aws cloudformation delete-stack \
  --stack-name bankiq-rag-infrastructure \
  --region us-east-1
```

## Troubleshooting

### Issue: Knowledge Base not found
```bash
# Verify KB exists
aws bedrock-agent list-knowledge-bases --region us-east-1

# Check backend environment variable
aws ecs describe-task-definition \
  --task-definition bankiq-backend \
  --query 'taskDefinition.containerDefinitions[0].environment[?name==`KNOWLEDGE_BASE_ID`]'
```

### Issue: Ingestion job failed
```bash
# Check job status
aws bedrock-agent list-ingestion-jobs \
  --knowledge-base-id <KB_ID> \
  --data-source-id <DS_ID>

# Re-trigger ingestion
aws bedrock-agent start-ingestion-job \
  --knowledge-base-id <KB_ID> \
  --data-source-id <DS_ID>
```

### Issue: No results from RAG
- Verify bank is in top 10 list
- Check timeframe is Oct 2024 - Oct 2025
- Ensure ingestion job completed successfully
- Agent will automatically fall back to Live mode

## Best Practices

1. **Use RAG for**: Frequent queries on top 10 banks, recent data
2. **Use Live for**: Any bank, historical data, latest filings
3. **Use Local for**: Custom documents, proprietary data
4. **Monitor costs**: OpenSearch Serverless is always-on
5. **Update regularly**: Re-run download script quarterly for fresh data

## References

- [Amazon Bedrock Knowledge Base](https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base.html)
- [OpenSearch Serverless](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/serverless.html)
- [Titan Embeddings](https://docs.aws.amazon.com/bedrock/latest/userguide/titan-embedding-models.html)
