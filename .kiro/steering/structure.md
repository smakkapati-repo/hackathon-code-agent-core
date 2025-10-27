# Project Structure

## Root Directory

```
amzon-bedrock-agentcore-bank-analytics/
├── arch/                    # Architecture diagrams
├── backend/                 # Express.js server + Python agent
├── cfn/                     # CloudFormation IaC
├── docs/                    # Comprehensive documentation
├── frontend/                # React application
├── test-kb-setup/          # RAG Knowledge Base testing
└── temp/                    # Temporary build artifacts
```

## Backend (`backend/`)

**Core Files**:
- `server.js`: Express.js API server (main entry point)
- `bank_iq_agent.py`: Python agent with 24 tools (Strands framework)
- `auth-middleware.js`: JWT verification middleware
- `Dockerfile`: Multi-stage container build (uv + Python 3.10)
- `.bedrock_agentcore.yaml`: Agent configuration and deployment settings

**Key Patterns**:
- Agent tools use `@tool` decorator from Strands framework
- All tools return JSON strings with `{"success": true/false, ...}` structure
- Server uses async job pattern for long-running queries (no 30s timeout)
- Caching implemented with node-cache (different TTLs per data type)

**Dependencies**:
- `package.json`: Node.js dependencies (Express, AWS SDK, axios)
- `requirements.txt`: Python dependencies (bedrock-agentcore, strands-agents)

## Frontend (`frontend/`)

**Structure**:
```
frontend/
├── public/              # Static assets, CSV templates
├── src/
│   ├── components/      # React components (Home, PeerAnalytics, etc.)
│   ├── services/        # API clients (AgentService, api.js)
│   ├── utils/           # Helpers (mockData, responseValidator)
│   ├── App.js           # Main app with routing and auth
│   ├── config.js        # Cognito configuration
│   └── index.js         # React entry point
├── Dockerfile           # Multi-stage build (Node 18)
└── package.json         # Dependencies (React, MUI, Amplify)
```

**Key Patterns**:
- Material-UI v5 for all UI components
- AWS Amplify v6 for Cognito authentication
- Axios for API calls to backend
- Recharts for data visualization

## Infrastructure (`cfn/`)

**Templates** (`cfn/templates/`):
- `prerequisites.yaml`: VPC, S3, ECR, IAM roles, OpenSearch
- `auth.yaml`: Cognito User Pool and OAuth configuration
- `backend.yaml`: ECS Fargate, ALB, Task Definition
- `frontend.yaml`: S3 bucket, CloudFront distribution

**Scripts** (`cfn/scripts/`):
- `deploy-all.sh`: Master deployment script (calls all others)
- `deploy-auth.sh`: Deploy Cognito authentication
- `deploy-infrastructure.sh`: Deploy VPC, ECS, ALB
- `deploy-agent.sh`: Deploy AgentCore agent
- `deploy-backend.sh`: Build and deploy backend container
- `deploy-frontend.sh`: Build and deploy React app
- `deploy-knowledge-base.py`: Create Bedrock Knowledge Base
- `download-sec-filings.py`: Download SEC filings for RAG
- `cleanup.sh`: Delete all AWS resources

**Key Patterns**:
- All scripts support stack name and region parameters
- Scripts use CloudFormation exports for cross-stack references
- Parallel execution where possible (agent + KB deployment)
- Comprehensive error handling and colored output

## Documentation (`docs/`)

- `README.md`: Documentation index
- `DEPLOYMENT_GUIDE.md`: Step-by-step deployment instructions
- `CLOUDFORMATION_GUIDE.md`: Infrastructure automation details
- `AGENT_DEVELOPMENT.md`: Agent development guidelines
- `RAG_INTEGRATION.md`: Knowledge Base setup and usage

## Naming Conventions

**AWS Resources**:
- Stack names: `{project}-{component}` (e.g., `bankiq-auth`, `bankiq-backend`)
- S3 buckets: `{project}-{purpose}-{env}` (e.g., `bankiq-frontend-prod`)
- IAM roles: `{Project}{Component}Role` (e.g., `BankIQECSTaskRole`)

**Code**:
- Python: snake_case for functions and variables
- JavaScript: camelCase for functions and variables
- React components: PascalCase (e.g., `PeerAnalytics.js`)
- Constants: UPPER_SNAKE_CASE (e.g., `JOB_STATUS`)

**Files**:
- CloudFormation templates: lowercase with hyphens (e.g., `backend.yaml`)
- Shell scripts: lowercase with hyphens (e.g., `deploy-all.sh`)
- Python modules: lowercase with underscores (e.g., `bank_iq_agent.py`)
- React components: PascalCase (e.g., `ComplianceAudit.js`)

## Configuration Files

**Agent Configuration**:
- `.bedrock_agentcore.yaml`: Agent deployment settings (region, IAM role, memory config)

**Docker**:
- `backend/Dockerfile`: Python 3.10 with uv package manager
- `backend/.dockerignore`: Excludes node_modules, __pycache__, temp files
- `frontend/Dockerfile`: Multi-stage Node 18 build

**Git**:
- `.gitignore`: Excludes build artifacts, node_modules, Python cache, AWS credentials

## Key Architectural Patterns

**Separation of Concerns**:
- Backend server (Express.js) handles HTTP, auth, caching
- Python agent (Strands) handles AI logic and tool orchestration
- Frontend (React) handles UI and user interactions

**Data Flow**:
1. User request → CloudFront → ALB → ECS (Express server)
2. Express server → AgentCore agent (via HTTPS API)
3. Agent → Claude Sonnet 4.5 → Tool selection → External APIs (FDIC, SEC)
4. Response → Express server → Frontend

**Security Layers**:
1. CloudFront (DDoS protection)
2. ALB (SSL termination)
3. Cognito (OAuth 2.0 authentication)
4. JWT verification (auth-middleware.js)
5. IAM roles (least privilege)
6. Security Groups (network isolation)

## Important Notes

- Agent code is deployed separately from backend container (uses `agentcore deploy`)
- Backend container must be rebuilt when server.js changes
- Frontend requires rebuild when React code changes
- CloudFormation stacks have dependencies (auth → infra → agent → backend → frontend)
- All deployment scripts must be run from project root directory
