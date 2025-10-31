from diagrams import Diagram, Cluster, Edge
from diagrams.aws.compute import ECS, Fargate, ECR
from diagrams.aws.devtools import Codebuild
from diagrams.aws.network import InternetGateway, ElasticLoadBalancing, VPC, CloudFront
from diagrams.aws.storage import S3
from diagrams.aws.ml import Bedrock
from diagrams.aws.analytics import AmazonOpensearchService
from diagrams.aws.management import Cloudwatch
from diagrams.aws.security import IAM, Cognito, Shield
from diagrams.aws.general import User
from diagrams.onprem.client import Users as ExternalUsers
from diagrams.onprem.compute import Server
from diagrams.custom import Custom

# AWS-style professional configuration
graph_attr = {
    "fontsize": "14",
    "fontname": "Amazon Ember, Arial, sans-serif",
    "bgcolor": "#FFFFFF",
    "pad": "0.5",
    "splines": "ortho",
    "nodesep": "0.8",
    "ranksep": "1.2",
    "compound": "true"
}

node_attr = {
    "fontsize": "11",
    "fontname": "Amazon Ember, Arial, sans-serif",
    "style": "",
    "fillcolor": "none",
    "color": "#232F3E"
}

edge_attr = {
    "fontsize": "9",
    "fontname": "Amazon Ember, Arial, sans-serif",
    "color": "#232F3E"
}

with Diagram(
    "BankIQ+ Production Architecture - CloudFront + ECS + AgentCore + Compliance",
    show=False,
    direction="LR",
    graph_attr=graph_attr,
    node_attr=node_attr,
    edge_attr=edge_attr,
    filename="bankiq_plus_agentcore_architecture"
):
    
    users = ExternalUsers("Banking Analysts\n& Executives")
    

    
    with Cluster("AWS Cloud", graph_attr={"bgcolor": "#F7F9FC", "style": "rounded,dashed", "color": "#FF9900", "penwidth": "2"}):
        
        # Authentication
        with Cluster("Authentication", graph_attr={"bgcolor": "white", "style": "rounded"}):
            cognito = Cognito("Cognito User Pool\nHosted UI + JWT\nSelf-Service Signup")
        
        # CloudFront CDN
        cloudfront = CloudFront("CloudFront CDN\n300s Timeout")
        
        # Frontend Storage
        with Cluster("Frontend", graph_attr={"bgcolor": "white", "style": "rounded"}):
            s3_frontend = S3("S3 Bucket\nReact App (Static)\nAmplify Auth")
        
        # VPC
        with Cluster("VPC - Multi-AZ", graph_attr={"bgcolor": "white", "style": "rounded"}):
            
            # Public Subnets
            with Cluster("Public Subnets", graph_attr={"bgcolor": "white", "style": "rounded"}):
                alb = ElasticLoadBalancing("Application\nLoad Balancer\n300s Timeout")
            
            # Private Subnets
            with Cluster("Private Subnets - ECS Fargate", graph_attr={"bgcolor": "white", "style": "rounded"}):
                ecs_backend = Fargate("Backend Container\nNode.js Express\n16 AI Tools\nJWT Verification")
            
            # Data Services
            with Cluster("Storage", graph_attr={"bgcolor": "white", "style": "rounded"}):
                s3_docs = S3("S3 Bucket\nUploaded Documents")
        
        # AgentCore Runtime
        with Cluster("Bedrock AgentCore + RAG", graph_attr={"bgcolor": "white", "style": "rounded"}):
            guardrails = Shield("Bedrock Guardrails\nContent Filtering\nTopic Blocking\nPII Protection")
            agentcore = Bedrock("AgentCore Runtime\nManaged Agent\nMemory + Orchestration")
            strands_agent = Custom("Strands Agent\n18 Tools (Pydantic)\nFDIC/SEC/RAG/S3", "strands_framework.png")
            claude = Bedrock("Claude Sonnet 4.5\n200K Context\nTool Selection")
            opensearch = AmazonOpensearchService("OpenSearch Serverless\nVector Store\nRAG Knowledge Base")
            
            guardrails >> agentcore
            agentcore >> Edge(label="Orchestrate", color="#E91E63") >> strands_agent
            strands_agent >> Edge(label="LLM Reasoning", color="#E91E63") >> claude
            
        # CI/CD Pipeline
        with Cluster("CI/CD Pipeline", graph_attr={"bgcolor": "white", "style": "rounded"}):
            codebuild = Codebuild("CodeBuild\nDocker Build\nNo Local Docker")
            ecr_repo = ECR("ECR Repository\nBackend Image")
        
        # Management & Security
        with Cluster("Management & Security", graph_attr={"bgcolor": "white", "style": "rounded"}):
            cloudwatch = Cloudwatch("CloudWatch\nLogs & Monitoring")
            iam = IAM("IAM Roles\nMinimal Permissions")
            
            cloudwatch - iam
    
    # Step 1: User Authentication
    users >> Edge(label="1a. Login/Signup", color="#FF9900", style="bold") >> cognito
    cognito >> Edge(taillabel="1b. JWT Token", color="#FF9900", style="dashed", minlen="1") >> users
    
    # Step 2: User to CloudFront
    users >> Edge(headlabel="2. HTTPS Request\n+ JWT Token", color="#FF9900", style="bold") >> cloudfront
    
    # Step 3: CloudFront to S3 (static files)
    cloudfront >> Edge(label="3a. Static Files\n(/, /static/*)", color="#4CAF50") >> s3_frontend
    
    # Step 4: CloudFront to ALB (API calls)
    cloudfront >> Edge(label="3b. API Calls\n(/api/*, HTTP)", color="#2196F3") >> alb
    
    # Step 5: ALB to ECS Backend (with JWT verification)
    alb >> Edge(label="4. Route to Backend\n+ Verify JWT", color="#9C27B0") >> ecs_backend
    ecs_backend >> Edge(label="Verify Token", color="#9C27B0", style="dashed") >> cognito
    
    # Step 5: Backend to AgentCore
    ecs_backend >> Edge(label="5. Invoke Agent", color="#FF5722", style="bold") >> agentcore
    
    # Step 6: Backend to Guardrails
    ecs_backend >> Edge(label="6a. Content Check", color="#FF5722", style="dashed") >> guardrails
    
    # Step 7: Strands Agent to OpenSearch (RAG)
    strands_agent >> Edge(label="RAG Query\nVector Search", color="#E91E63", style="dashed") >> opensearch
    
    # Step 8: Document Storage
    ecs_backend >> Edge(label="7. Upload Docs", color="#FF9800") >> s3_docs
    agentcore >> Edge(label="8. Read Docs", color="#FF9800", style="dashed") >> s3_docs
    
    # CI/CD Pipeline
    s3_frontend >> Edge(label="Source Code", color="#795548") >> codebuild
    codebuild >> Edge(label="Push Image", color="#795548") >> ecr_repo
    ecr_repo >> Edge(label="Deploy Backend", color="#795548") >> ecs_backend
    
    # Infrastructure Services
    ecs_backend >> Edge(label="Logs & Metrics", color="#607D8B") >> cloudwatch
    agentcore >> Edge(label="Logs & Traces", color="#607D8B") >> cloudwatch
    ecs_backend >> Edge(label="IAM Permissions", color="#607D8B", style="dashed") >> iam
    
    # External Data Sources (at bottom)
    with Cluster("External Data Sources", graph_attr={"bgcolor": "white", "style": "rounded"}):
        fdic_api = Server("FDIC Call Reports\n2024-2025 Data")
        sec_api = Server("SEC EDGAR API\nLive Filings")
        
        fdic_api - sec_api
    
    # Step 9: External Data
    agentcore >> Edge(label="9a. FDIC Data", color="#00BCD4") >> fdic_api
    agentcore >> Edge(label="9b. SEC Filings", color="#00BCD4") >> sec_api