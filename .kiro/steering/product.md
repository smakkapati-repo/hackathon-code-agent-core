# Product Overview

BankIQ+ is an AI-powered banking analytics platform that provides comprehensive financial analysis for banks and financial institutions. The platform leverages Amazon Bedrock AgentCore with Claude Sonnet 4.5 to deliver intelligent, conversational insights from regulatory data.

## Core Capabilities

**Peer Bank Analytics**: Compare 500+ banks using live FDIC data, SEC EDGAR filings, or custom CSV uploads. The AI agent automatically selects the appropriate data source and generates detailed comparative analysis with visualizations.

**Financial Reports**: Access and analyze SEC filings (10-K, 10-Q) for any public bank. Upload custom financial PDFs for AI-powered analysis. The system maintains conversational memory for multi-turn Q&A sessions.

**Compliance & Audit**: Real-time regulatory risk assessment using FDIC data. Automated compliance scoring, capital adequacy analysis, and regulatory alerts with visual risk indicators.

**RAG Knowledge Base**: Pre-indexed SEC filings for top 10 banks (Oct 2024-Oct 2025) enabling instant semantic search and analysis. Automatically falls back to live SEC EDGAR for other banks.

## Technology Showcase

This is a reference implementation demonstrating Amazon Bedrock AgentCore (AWS's managed agent runtime) and the Strands framework for production-ready AI agents. The platform showcases tool orchestration (24 custom tools), conversational memory, enterprise security (Cognito OAuth 2.0), and cloud-native architecture (CloudFront + ECS + ALB).

## Target Users

- Bank executives and analysts requiring peer performance analysis
- Compliance officers monitoring regulatory requirements
- Financial analysts researching banking sector trends
- Developers learning AgentCore and Strands framework implementation
