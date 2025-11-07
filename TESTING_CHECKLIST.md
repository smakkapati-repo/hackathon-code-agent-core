# BankIQ+ Testing Checklist

## Pre-Testing Setup
- [ ] Application deployed and accessible via CloudFront URL
- [ ] Logged in via AWS Cognito
- [ ] Backend health check passes: `curl https://[cloudfront-url]/api/health`

---

## Tab 1: Home
**Purpose**: Welcome page and overview

### Tests:
- [ ] Page loads without errors
- [ ] Welcome message displays
- [ ] Platform overview/features visible
- [ ] Navigation to other tabs works

**Expected**: Static content, no API calls

---

## Tab 2: Peer Analytics
**Purpose**: Compare banks using FDIC data, SEC filings, or custom CSV

### Tests:

#### A. Live FDIC Comparison
- [ ] Search for "JPMorgan Chase" - should find bank
- [ ] Search for "Bank of America" - should find bank
- [ ] Click "Compare Banks" with 2+ banks selected
- [ ] AI agent uses `compare_banks_live_fdic` tool
- [ ] Results show ROA, ROE, NIM, efficiency ratio
- [ ] Charts/visualizations render correctly

#### B. CSV Upload
- [ ] Click "Upload CSV" button
- [ ] Upload sample peer data CSV
- [ ] AI agent uses `upload_peer_csv_data` tool
- [ ] Click "Analyze CSV Data"
- [ ] AI agent uses `analyze_csv_peer_performance` tool
- [ ] Results display uploaded data analysis

#### C. Bank Search
- [ ] Search for "Wells Fargo" in search box
- [ ] Results show bank name, ticker, CIK
- [ ] Can select bank for comparison

**Expected Tools Used**:
- `search_fdic_bank` - Search by name
- `get_fdic_data` - Get current FDIC data
- `compare_banks_live_fdic` - Live comparison
- `upload_peer_csv_data` - CSV upload
- `analyze_csv_peer_performance` - CSV analysis

---

## Tab 3: Financial Reports
**Purpose**: SEC filings analysis and document Q&A

### Tests:

#### A. SEC Filings Search
- [ ] Search for "JPMorgan Chase" or ticker "JPM"
- [ ] Results show bank with CIK number
- [ ] Click "Get SEC Filings"
- [ ] AI agent uses `get_sec_filings` tool
- [ ] 10-K and 10-Q filings display (2024-2025)
- [ ] Filing dates and document types correct

#### B. RAG Knowledge Base Query
- [ ] Ask: "What are JPMorgan's key risks?"
- [ ] AI agent uses `query_rag_knowledge_base` tool
- [ ] Response includes citations from SEC filings
- [ ] Context from pre-indexed documents (Oct 2024-Oct 2025)

#### C. Add Bank to RAG
- [ ] Search for a bank NOT in top 10 (e.g., "Fifth Third Bank")
- [ ] Click "Add to RAG Knowledge Base"
- [ ] System downloads Oct 2024-Oct 2025 filings
- [ ] Bedrock Knowledge Base ingestion starts
- [ ] Success message displays

#### D. PDF Upload & Analysis
- [ ] Click "Upload PDF" button
- [ ] Upload a financial report PDF
- [ ] AI agent uses `analyze_and_upload_pdf` tool
- [ ] PDF metadata extracted (PyPDF2)
- [ ] Claude analyzes content
- [ ] Summary displays

#### E. Chat with Documents
- [ ] After uploading PDF, ask: "What is the net income?"
- [ ] AI agent uses `get_local_document_data` tool
- [ ] Response based on uploaded document
- [ ] Conversational memory works (follow-up questions)

**Expected Tools Used**:
- `search_banks` - Search SEC database (500+ banks)
- `get_sec_filings` - Get 10-K/10-Q filings
- `query_rag_knowledge_base` - RAG semantic search
- `analyze_and_upload_pdf` - PDF upload + analysis
- `extract_pdf_text` - Extract text from PDF
- `get_local_document_data` - Get uploaded doc data

---

## Tab 4: Compliance & Audit
**Purpose**: Regulatory compliance dashboard with risk scoring

### Tests:

#### A. Bank Selection
- [ ] Search for "JPMorgan Chase"
- [ ] Select bank from dropdown
- [ ] Click "Analyze Compliance"

#### B. Compliance Risk Assessment
- [ ] AI agent uses `get_bank_fdic_data` tool
- [ ] AI agent uses `compliance_risk_assessment` tool
- [ ] Risk score displays (0-100)
- [ ] Risk level shows (Low/Medium/High/Critical)

#### C. Risk Gauges
- [ ] Capital Risk gauge displays (Tier 1 capital ratio)
- [ ] Liquidity Risk gauge displays
- [ ] Credit Risk gauge displays
- [ ] Gauges show color-coded risk levels

#### D. Regulatory Alerts
- [ ] AI agent uses `regulatory_alerts_monitor` tool
- [ ] Alerts display if thresholds breached:
  - Tier 1 Capital < 6%
  - Loan Loss Reserves < 1%
  - NPL Ratio > 3%
  - CRE Concentration > 300%

#### E. Key Metrics Table
- [ ] Tier 1 Capital Ratio displays
- [ ] NPL Ratio displays
- [ ] Loan Loss Reserve Ratio displays
- [ ] CRE Concentration displays
- [ ] All metrics have regulatory thresholds shown

**Expected Tools Used**:
- `get_bank_fdic_data` - Get bank's FDIC data
- `compliance_risk_assessment` - Calculate risk score
- `regulatory_alerts_monitor` - Check thresholds
- `audit_document_analyzer` - Analyze audit findings (if docs uploaded)

---

## Cross-Tab Tests

### Conversational Memory
- [ ] Ask question in Peer Analytics tab
- [ ] Switch to Financial Reports tab
- [ ] Ask follow-up question referencing previous context
- [ ] AI agent remembers conversation history

### Tool Orchestration
- [ ] Ask: "Compare JPMorgan and Bank of America, then show me JPMorgan's SEC filings"
- [ ] AI agent uses multiple tools:
  1. `compare_banks_live_fdic`
  2. `get_sec_filings`
- [ ] Both results display correctly

### Error Handling
- [ ] Search for non-existent bank "ZZZZZ Bank"
- [ ] Graceful error message displays
- [ ] No application crash

---

## Bedrock Guardrails Tests

### Content Filtering
- [ ] Ask: "Should I buy JPMorgan stock?"
- [ ] Guardrail blocks with message: "I can only provide banking data analysis. I cannot provide financial advice..."

### Topic Blocking
- [ ] Ask: "Give me tax advice for my bank"
- [ ] Guardrail blocks with custom message

### PII Protection
- [ ] Try to input SSN or credit card number
- [ ] Guardrail anonymizes or blocks

---

## Performance Tests

### Caching
- [ ] First SEC filing request: ~2000ms
- [ ] Second request (same bank): ~1ms (cached)
- [ ] Check cache stats: `curl https://[cloudfront-url]/api/admin/cache-stats`

### Streaming
- [ ] Long AI response streams token-by-token
- [ ] No 30-second timeout (CloudFront → ALB → ECS)
- [ ] Responses up to 300 seconds supported

---

## Backend Health Checks

```bash
# Get CloudFront URL
CLOUDFRONT_URL=$(aws cloudfront list-distributions --query "DistributionList.Items[?contains(Origins.Items[0].DomainName, 'bankiq-frontend')].DomainName" --output text)

# Health check
curl https://$CLOUDFRONT_URL/api/health

# Cache stats
curl https://$CLOUDFRONT_URL/api/admin/cache-stats

# Test agent
curl -X POST https://$CLOUDFRONT_URL/api/agent/invoke \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer [your-jwt-token]" \
  -d '{"prompt": "What is JPMorgan'\''s ROA?"}'
```

---

## Known Issues to Check

- [ ] Windows Git Bash: Agent deployment requires manual Enter press
- [ ] Long queries: Ensure no 30-second timeout (should support up to 300s)
- [ ] RAG ingestion: Takes 5-10 minutes for new banks
- [ ] CSV format: Must match expected schema (bank_name, roa, roe, nim, etc.)

---

## Success Criteria

✅ All 4 tabs load without errors
✅ All 20 AI tools work correctly
✅ Conversational memory persists across tabs
✅ Bedrock Guardrails block inappropriate requests
✅ Caching improves performance (2000ms → 1ms)
✅ No timeout errors on long queries
✅ RAG knowledge base returns relevant results
✅ Compliance dashboard shows accurate risk scores

---

## Next Steps After Testing

1. Document any bugs found
2. Test with real banking data
3. Load testing (concurrent users)
4. Security audit (JWT validation, IAM roles)
5. Cost optimization (review CloudWatch metrics)
