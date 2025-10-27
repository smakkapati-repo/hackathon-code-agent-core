# BankIQ+ Documentation

## 📚 Complete Documentation Index

### 🚀 Getting Started

**[Deployment Guide](DEPLOYMENT_GUIDE.md)** - Complete deployment instructions
- Prerequisites and tool installation
- One-command deployment
- Step-by-step manual deployment
- Authentication setup (Cognito)
- Verification and testing
- Cost estimates and cleanup

### 🏗️ Architecture & Infrastructure

**[CloudFormation Guide](CLOUDFORMATION_GUIDE.md)** - Infrastructure automation
- CloudFormation templates overview
- Package creation and distribution
- Deployment options (CLI and Console)
- Resource details and customization
- Troubleshooting infrastructure issues

**Architecture Diagram**: `../arch/bankiq_plus_agentcore_architecture.png`

### 🤖 Agent Development

**[Agent Development Guide](AGENT_DEVELOPMENT.md)** - Building and extending the AI agent
- Agent vs Backend container differences
- Dockerfile requirements
- AgentCore deployment process
- Tool development guidelines
- Testing and debugging

### 🧠 RAG Integration

**[RAG Integration Guide](RAG_INTEGRATION.md)** - Knowledge Base setup
- RAG architecture overview
- Data coverage (top 10 banks)
- Deployment options
- Performance comparison (RAG vs Live vs Local)
- Cost estimates and monitoring
- Troubleshooting RAG issues

## 🎯 Quick Links

### For First-Time Users
1. Start with [Deployment Guide](DEPLOYMENT_GUIDE.md)
2. Review [CloudFormation Guide](CLOUDFORMATION_GUIDE.md) for infrastructure details
3. Optional: Enable RAG with [RAG Integration Guide](RAG_INTEGRATION.md)

### For Developers
1. Read [Agent Development Guide](AGENT_DEVELOPMENT.md)
2. Understand the architecture diagram
3. Review tool implementation in `../backend/bank_iq_agent_v1.py`

### For DevOps/Infrastructure
1. Study [CloudFormation Guide](CLOUDFORMATION_GUIDE.md)
2. Review templates in `../cfn/templates/`
3. Customize deployment scripts in `../cfn/scripts/`

## 📖 Additional Resources

- **Main README**: `../README.md` - Project overview and features
- **Backend README**: `../backend/README.md` - Backend API documentation
- **Frontend README**: `../frontend/README.md` - Frontend development guide
- **Scripts**: `../cfn/scripts/` - Deployment automation scripts

## 🆘 Troubleshooting

Common issues and solutions are documented in:
- [Deployment Guide - Troubleshooting Section](DEPLOYMENT_GUIDE.md#-troubleshooting)
- [CloudFormation Guide - Troubleshooting Section](CLOUDFORMATION_GUIDE.md#-troubleshooting)
- [RAG Integration Guide - Troubleshooting Section](RAG_INTEGRATION.md#troubleshooting)

## 📝 Documentation Standards

All documentation follows these conventions:
- ✅ Step-by-step instructions with code examples
- ✅ Platform-specific commands (Mac/Linux/Windows)
- ✅ Expected outputs and verification steps
- ✅ Troubleshooting sections
- ✅ Cost estimates where applicable
- ✅ Links to AWS documentation

---

**Version**: 1.0  
**Last Updated**: January 2025  
**Status**: ✅ Production Ready
