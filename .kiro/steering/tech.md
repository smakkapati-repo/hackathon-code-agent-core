# Technology Stack

## Core AI Platform

- **Amazon Bedrock AgentCore**: Managed agent runtime with built-in memory and tool orchestration
- **Strands Framework**: Python agent framework for defining tools and workflows
- **Claude Sonnet 4.5**: Foundation model (anthropic.claude-sonnet-4-20250514-v1:0)

## Application Stack

**Backend**:
- Express.js (Node.js) server on port 3001
- Python agent with 24 custom tools
- AWS SDK v2 for AWS service integration
- node-cache for in-memory caching (SEC: 24h, FDIC: 1h, Bank Search: 7d)

**Frontend**:
- React 18 with Material-UI v5
- AWS Amplify v6 for authentication
- Recharts for data visualization
- Axios for API calls

**Infrastructure**:
- ECS Fargate (containerized workloads)
- Application Load Balancer (300s timeout for long queries)
- CloudFront (global CDN)
- S3 (frontend hosting, document storage)
- Cognito (OAuth 2.0 authentication)

## Build System

**Backend Container**:
```bash
# Uses uv package manager with Python 3.10
docker build -f backend/Dockerfile -t bankiq-backend .
# Installs: bedrock-agentcore, boto3, requests, strands-agents, PyPDF2
```

**Frontend Build**:
```bash
cd frontend
npm install
npm run build  # Creates optimized production build
```

**Agent Deployment**:
```bash
cd backend
agentcore deploy  # Uses .bedrock_agentcore.yaml config
```

## Common Commands

**Development**:
```bash
# Backend local dev
cd backend && npm run dev

# Frontend local dev
cd frontend && npm start

# View logs
aws logs tail /ecs/bankiq-backend --follow
```

**Deployment**:
```bash
# Full deployment (30-40 minutes)
./cfn/scripts/deploy-all.sh

# Individual components
./cfn/scripts/deploy-auth.sh
./cfn/scripts/deploy-infrastructure.sh
./cfn/scripts/deploy-agent.sh
./cfn/scripts/deploy-backend.sh
./cfn/scripts/deploy-frontend.sh
```

**Testing**:
```bash
# Health check
curl https://[cloudfront-url]/api/health

# Agent status
cd backend && agentcore status

# Cache stats
curl http://localhost:3001/api/admin/cache-stats
```

**Cleanup**:
```bash
./cfn/scripts/cleanup.sh  # Removes all AWS resources
```

## Key Dependencies

**Backend** (package.json):
- aws-sdk: ^2.1692.0
- express: ^4.18.2
- axios: ^1.12.2
- node-cache: ^5.1.2
- jsonwebtoken: ^9.0.2

**Frontend** (package.json):
- react: ^18.2.0
- @mui/material: ^5.15.0
- aws-amplify: ^6.15.7
- recharts: ^2.8.0

**Agent** (requirements.txt):
- bedrock-agentcore
- boto3
- requests
- strands-agents
- PyPDF2

## Environment Variables

**Backend Container**:
- `AGENTCORE_AGENT_ARN`: Agent runtime ARN
- `REGION`: AWS region (default: us-east-1)
- `UPLOADED_DOCS_BUCKET`: S3 bucket for documents
- `COGNITO_USER_POOL_ID`: Cognito user pool
- `KNOWLEDGE_BASE_ID`: Optional Bedrock KB ID
- `DEBUG_MODE`: Enable debug logging (true/false)
- `AUTH_ENABLED`: Enable authentication (true/false)

## AWS Services

- **Compute**: ECS Fargate (512 CPU, 1024 MB memory)
- **Networking**: VPC, ALB, Security Groups
- **Storage**: S3 (frontend, uploaded-docs, sec-filings), ECR
- **AI/ML**: Bedrock AgentCore, Bedrock Knowledge Base, OpenSearch Serverless
- **Auth**: Cognito User Pool with OAuth 2.0
- **Monitoring**: CloudWatch Logs, Container Insights
- **IaC**: CloudFormation templates in cfn/templates/
