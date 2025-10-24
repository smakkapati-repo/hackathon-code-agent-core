# 🚀 Pre-Deployment Checklist

## ✅ Frontend Checks

### Dependencies
- [ ] Chart.js installed: `npm list chart.js react-chartjs-2`
- [ ] No missing Material-UI components
- [ ] All imports resolve correctly

### Component Tests
- [ ] ComplianceAudit component renders without errors
- [ ] Charts display with mock data
- [ ] Tables show properly formatted data
- [ ] Responsive design works on mobile

### Build Test
```bash
cd frontend
npm install
npm run build
# Should complete without errors
```

## ✅ Backend Checks

### Python Dependencies
- [ ] All imports work: `python -c "import requests, json, boto3"`
- [ ] PyPDF2 available for document analysis
- [ ] No missing packages in requirements.txt

### FDIC API Test
```bash
curl -s "https://api.fdic.gov/banks/financials?filters=CERT:628&limit=1&format=json" | python -m json.tool
# Should return JPMorgan data
```

### Agent Tools Test
- [ ] compliance_risk_assessment returns valid JSON
- [ ] regulatory_alerts_monitor works with real data
- [ ] audit_document_analyzer handles missing documents

## ✅ AWS Infrastructure

### Resource Limits
- [ ] ECS task definition has sufficient memory (2GB+)
- [ ] ALB health checks configured properly
- [ ] S3 bucket exists and has correct permissions

### AgentCore
- [ ] Agent deploys without timeout
- [ ] All 16 tools registered correctly
- [ ] Agent ARN saved properly

### Networking
- [ ] Security groups allow HTTPS traffic
- [ ] VPC subnets have internet access
- [ ] CloudFront distribution active

## ✅ Integration Tests

### End-to-End Flow
1. [ ] User can enter bank name
2. [ ] "Assess Compliance" button works
3. [ ] Real FDIC data loads
4. [ ] Charts render with data
5. [ ] "Run Audit" generates findings
6. [ ] No JavaScript console errors

### Error Handling
- [ ] Invalid bank names show proper errors
- [ ] API timeouts handled gracefully
- [ ] Loading states work correctly
- [ ] Fallback mock data displays

## ✅ Demo Preparation

### Test Banks
- [ ] JPMorgan Chase (CERT: 628) - $3.8T assets
- [ ] Bank of America (CERT: 3510) - Works with compliance tools
- [ ] Wells Fargo (CERT: 3511) - Backup option

### Demo Script
- [ ] 30-second elevator pitch ready
- [ ] Key features highlighted
- [ ] Backup plan if APIs fail

## 🚨 Common Issues & Fixes

### Frontend Issues
```bash
# Chart.js not rendering
npm install --save chart.js react-chartjs-2

# Build fails
rm -rf node_modules package-lock.json
npm install
```

### Backend Issues
```bash
# Agent deployment fails
cd backend
agentcore status
agentcore launch -a bank_iq_agent_v1 --auto-update-on-conflict

# FDIC API timeout
# Use fallback mock data in tools
```

### AWS Issues
```bash
# ECS task fails
aws logs tail /ecs/bankiq-backend --follow

# CloudFront cache
aws cloudfront create-invalidation --distribution-id [ID] --paths "/*"
```

## 🎯 Success Criteria

- [ ] Application loads in under 5 seconds
- [ ] Compliance tab shows professional charts
- [ ] Real bank data displays correctly
- [ ] No console errors or warnings
- [ ] Mobile responsive design works
- [ ] Demo flows smoothly

## 🆘 Emergency Backup Plan

If deployment fails:
1. **Use existing tabs** - Peer Analytics and SEC Reports work
2. **Mock data demo** - Show compliance UI with sample data
3. **Local development** - Run locally if AWS issues
4. **Presentation mode** - Focus on architecture and innovation

---

**Run this checklist before deploying to avoid last-minute issues!**