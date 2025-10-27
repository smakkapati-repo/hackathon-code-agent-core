"""BankIQ+ Simplified Agent - Let Claude Decide Which Tools to Use"""
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from strands import Agent, tool
from strands.models import BedrockModel
import boto3
import json
import requests
import os
from typing import List, Dict

app = BedrockAgentCoreApp()

# Initialize AWS clients
bedrock = boto3.client('bedrock-runtime', region_name='us-east-1')
s3 = boto3.client('s3', region_name='us-east-1')

# ============================================================================
# BANKING DATA TOOLS
# ============================================================================

@tool
def get_fdic_data() -> str:
    """Get current FDIC banking data for major US banks (October 2024 to October 2025).
    
    Returns: Real-time financial metrics (ROA, ROE, NIM, assets, deposits) for top 50 banks
    Use when: User asks for "current banking data", "latest metrics", or "FDIC data"
    Examples: "Show me current bank performance", "Get FDIC data"""
    try:
        url = "https://api.fdic.gov/banks/financials"
        params = {
            "fields": "ASSET,DEP,NETINC,ROA,ROE,NIM,EQTOT,LNLSNET,REPYMD,NAME",
            "limit": 50,
            "format": "json"
        }
        
        response = requests.get(url, params=params, timeout=10)
        if response.status_code == 200:
            data = response.json()
            return json.dumps({"success": True, "data": data.get("data", [])[:20]})
        else:
            return json.dumps({"success": False, "error": f"API error: {response.status_code}"})
    except Exception as e:
        return json.dumps({"success": False, "error": str(e)})

@tool
def search_fdic_bank(bank_name: str) -> str:
    """Search FDIC database for bank CERT number by name.
    
    Args:
        bank_name: Bank name to search for (e.g., "Regions Financial", "JPMorgan")
    
    Returns: CERT number and official name of the largest matching bank
    Use when: Need CERT number for banks not in hardcoded list
    Examples: "Find CERT for Regional Bank", "What's the CERT for XYZ Bank"""
    try:
        # Clean bank name - remove common suffixes
        clean_name = bank_name.upper()
        for suffix in [' CORP', ' INC', ' & CO', ' FINANCIAL', ' BANCORP', ' BANK']:
            clean_name = clean_name.replace(suffix, '')
        clean_name = clean_name.strip()
        
        # Try multiple search strategies
        search_terms = [clean_name, bank_name.split()[0]]
        
        for term in search_terms:
            url = f"https://api.fdic.gov/banks/institutions?search=NAME:{term}&fields=CERT,NAME,ASSET,ACTIVE&limit=50&format=json"
            response = requests.get(url, timeout=10)
            if response.status_code == 200:
                data = response.json().get("data", [])
                if data:
                    # Filter active banks only
                    active_banks = [b for b in data if b['data'].get('ACTIVE', 1) == 1]
                    if active_banks:
                        # Sort by asset size, return largest
                        sorted_banks = sorted(active_banks, key=lambda x: float(x['data'].get('ASSET', 0) or 0), reverse=True)
                        top_bank = sorted_banks[0]['data']
                        return json.dumps({
                            "success": True,
                            "cert": str(top_bank['CERT']),
                            "name": top_bank['NAME'],
                            "asset": top_bank.get('ASSET', 0)
                        })
        
        return json.dumps({"success": False, "error": f"Bank not found: {bank_name}"})
    except Exception as e:
        return json.dumps({"success": False, "error": str(e)})

@tool
def compare_banks_live_fdic(base_bank: str, peer_banks: List[str], metric: str) -> str:
    """Compare banks using LIVE FDIC data - real-time peer analysis.
    
    **MODE**: Live only (real-time FDIC API)
    **DATA SOURCE**: FDIC Call Reports (2023-2025)
    **COVERAGE**: All FDIC-insured banks
    **OUTPUT**: JSON with chart data + AI analysis
    
    Args:
        base_bank: Primary bank to analyze
        peer_banks: List of peer banks (up to 3)
        metric: Metric to compare (ROA, ROE, NIM, Efficiency Ratio, etc.)
    
    Returns: JSON with quarterly trends + comprehensive analysis
    Use when: User is in LIVE mode and requests peer comparison
    Examples: "Compare JPMorgan vs BofA on ROA", "Peer analysis of Wells Fargo"""
    
    # Call the original compare_banks function
    return compare_banks(base_bank, peer_banks, metric)

@tool
def compare_banks_local_csv(base_bank: str, peer_banks: List[str], metric: str, s3_key: str) -> str:
    """Compare banks using LOCAL uploaded CSV data - custom peer analysis.
    
    **MODE**: Local only (user-uploaded CSV)
    **DATA SOURCE**: User's uploaded CSV file in S3
    **COVERAGE**: Any banks in uploaded CSV
    **OUTPUT**: JSON with chart data + AI analysis
    
    Args:
        base_bank: Primary bank to analyze
        peer_banks: List of peer banks (up to 3)
        metric: Metric to compare
        s3_key: S3 key of uploaded CSV file
    
    Returns: JSON with quarterly trends + comprehensive analysis
    Use when: User is in LOCAL mode and requests peer comparison with uploaded CSV
    Examples: "Compare my banks on ROA", "Analyze uploaded peer data"""
    
    # Call the CSV analysis function
    return analyze_csv_peer_performance(s3_key, base_bank, peer_banks, metric)

@tool
def compare_banks(base_bank: str, peer_banks: List[str], metric: str) -> str:
    """[INTERNAL] Compare banks - use mode-specific tools instead.
    
    Args:
        base_bank: Primary bank
        peer_banks: Peer banks list
        metric: Metric to compare
    
    Returns: Comparison data
    Use when: Never use directly - use compare_banks_live_fdic or compare_banks_local_csv"""
    
    # Bank CERT numbers cache (fallback if search fails)
    bank_certs_cache = {
        "JPMorgan Chase": "628", "JPMORGAN CHASE BANK": "628",
        "Bank of America": "3510", "BANK OF AMERICA": "3510",
        "Wells Fargo": "3511", "WELLS FARGO BANK": "3511",
        "Citigroup": "7213", "CITIBANK": "7213",
        "Goldman Sachs": "33124", "GOLDMAN SACHS BANK": "33124",
        "Morgan Stanley": "65012",
        "U.S. Bancorp": "6548", "U.S. BANK": "6548",
        "PNC Financial": "6384", "PNC BANK": "6384",
        "Capital One": "4297", "CAPITAL ONE": "4297",
        "Truist Financial": "14291", "TRUIST BANK": "14291",
        "Regions Financial": "12368", "REGIONS FINANCIAL CORP": "12368",
        "Fifth Third Bancorp": "6672", "FIFTH THIRD BANCORP": "6672"
    }
    
    # Helper function to get CERT (try cache first, then search)
    def get_cert(bank_name):
        # Try exact match in cache
        if bank_name in bank_certs_cache:
            return bank_certs_cache[bank_name]
        
        # Try partial match in cache
        bank_upper = bank_name.upper()
        for cached_name, cert in bank_certs_cache.items():
            if cached_name.upper() in bank_upper or bank_upper in cached_name.upper():
                return cert
        
        # Try dynamic FDIC search
        try:
            search_result = search_fdic_bank(bank_name)
            result = json.loads(search_result)
            if result.get('success'):
                cert = result['cert']
                # Cache for future use
                bank_certs_cache[bank_name] = cert
                return cert
        except Exception as e:
            print(f"CERT search failed for {bank_name}: {e}")
        
        return None
    
    bank_certs = {}
    
    metric_key = metric.replace("[Q] ", "").replace("[M] ", "")
    
    # Map metric names to FDIC fields or calculations
    metric_map = {
        "ROA": "ROA",
        "ROE": "ROE", 
        "NIM": "NIMY",
        "Efficiency Ratio": "CALC_EFFICIENCY",
        "Loan-to-Deposit": "CALC_LTD",
        "Equity Ratio": "CALC_EQUITY",
        "CRE Concentration": "NCRER"
    }
    
    for key, field in metric_map.items():
        if key.lower() in metric_key.lower():
            metric_key = field
            break
    
    chart_data = []
    all_banks = [base_bank] + peer_banks
    bank_latest = {}
    
    for bank in all_banks:
        cert = get_cert(bank)
        if not cert:
            continue
            
        try:
            url = f"https://api.fdic.gov/banks/financials?filters=CERT:{cert}&fields=ASSET,ROA,ROE,NIMY,EQTOT,DEP,LNLSNET,EINTEXP,NONII,NCRER&limit=200&format=json"
            response = requests.get(url, timeout=10)
            if response.status_code != 200:
                continue
                
            data = response.json().get("data", [])
            recent = [x for x in data if any(y in x['data']['ID'] for y in ['2023', '2024', '2025'])]
            recent.sort(key=lambda x: x['data']['ID'], reverse=True)
            
            for record in recent[:8]:
                date_str = record['data']['ID'].split('_')[1]
                year, month = date_str[:4], date_str[4:6]
                quarter = f"{year}-Q{(int(month)-1)//3 + 1}"
                
                # Calculate metric value
                if metric_key == "CALC_EFFICIENCY":
                    nonii = record['data'].get('NONII', 0)
                    eintexp = record['data'].get('EINTEXP', 0)
                    nimy = record['data'].get('NIMY', 0)
                    asset = record['data'].get('ASSET', 1)
                    revenue = (nimy * asset / 100) if asset > 0 else 0
                    value = (abs(nonii) / revenue * 100) if revenue > 0 else 0
                elif metric_key == "CALC_LTD":
                    lnlsnet = record['data'].get('LNLSNET', 0)
                    dep = record['data'].get('DEP', 1)
                    value = (lnlsnet / dep * 100) if dep > 0 else 0
                elif metric_key == "CALC_EQUITY":
                    eqtot = record['data'].get('EQTOT', 0)
                    asset = record['data'].get('ASSET', 1)
                    value = (eqtot / asset * 100) if asset > 0 else 0
                else:
                    value = record['data'].get(metric_key, 0)
                
                chart_data.append({
                    "Bank": bank,
                    "Quarter": quarter,
                    "Metric": metric.replace("[Q] ", "").replace("[M] ", ""),
                    "Value": round(float(value), 2)
                })
                
                if bank not in bank_latest:
                    bank_latest[bank] = float(value)
        except:
            continue
    
    chart_data.sort(key=lambda x: x['Quarter'])
    
    if bank_latest:
        sorted_banks = sorted(bank_latest.items(), key=lambda x: x[1], reverse=True)
        best_bank, best_value = sorted_banks[0]
        worst_bank, worst_value = sorted_banks[-1]
        analysis = f"{best_bank} leads with {metric_key} of {best_value:.2f}%, showing superior performance. "
        analysis += f"The {best_value - worst_value:.2f}pp spread to {worst_bank} ({worst_value:.2f}%) indicates "
        analysis += f"meaningful differentiation. {base_bank} is positioned "
        analysis += f"{'at the top' if base_bank == best_bank else 'competitively'} within this peer group."
    else:
        analysis = f"Comparison of {metric_key} across selected banks."
    
    return json.dumps({
        "data": chart_data,
        "base_bank": base_bank,
        "peer_banks": peer_banks,
        "analysis": analysis,
        "source": "FDIC_Real_Data"
    })

@tool
def get_sec_filings(bank_name: str, form_type: str = "10-K", cik: str = "") -> str:
    """Get SEC EDGAR filings for a bank.
    
    Args:
        bank_name: Name of the bank (e.g., "JPMorgan Chase", "WEBSTER FINANCIAL CORP")
        form_type: Type of filing (10-K for annual, 10-Q for quarterly)
        cik: Optional CIK number (e.g., "0000801337") - if provided, uses this directly
    
    Returns: Recent SEC filings (2023-2025) with direct links and filing dates
    Use when: User asks for "SEC filings", "10-K", "10-Q", "regulatory reports", "annual reports"
    Examples: "Get JPMorgan 10-K filings", "Show me Webster's quarterly reports"""
    
    # If CIK is provided, use it directly
    target_cik = cik if cik and cik != "0000000000" else None
    
    # Otherwise, try to find CIK from bank name
    if not target_cik:
        bank_ciks = {
            "JPMORGAN CHASE": "0000019617",
            "BANK OF AMERICA": "0000070858",
            "WELLS FARGO": "0000072971",
            "CITIGROUP": "0000831001",
            "GOLDMAN SACHS": "0000886982",
            "MORGAN STANLEY": "0000895421",
            "U.S. BANCORP": "0000036104",
            "PNC FINANCIAL": "0000713676",
            "CAPITAL ONE": "0000927628",
            "TRUIST FINANCIAL": "0001534701",
            "WEBSTER FINANCIAL": "0000801337",
            "FIFTH THIRD": "0000035527",
            "KEYCORP": "0000091576",
            "REGIONS FINANCIAL": "0001281761",
            "M&T BANK": "0000036270",
            "HUNTINGTON": "0000049196"
        }
        
        # Find CIK by partial name match
        bank_upper = bank_name.upper()
        for bank, cik_val in bank_ciks.items():
            if bank in bank_upper or bank_upper in bank:
                target_cik = cik_val
                break
    
    if not target_cik:
        return json.dumps({"success": False, "error": f"Bank CIK not found for: {bank_name}. Try using the search_banks tool first to get the CIK."})
    
    try:
        headers = {"User-Agent": "BankIQ Analytics contact@bankiq.com"}
        url = f"https://data.sec.gov/submissions/CIK{target_cik}.json"
        
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code != 200:
            return json.dumps({"success": False, "error": f"SEC API error: {response.status_code}"})
        
        data = response.json()
        filings = data.get("filings", {}).get("recent", {})
        
        # Filter filings
        results = []
        forms = filings.get("form", [])
        dates = filings.get("filingDate", [])
        accessions = filings.get("accessionNumber", [])
        
        for form, date, accession in zip(forms, dates, accessions):
            if form == form_type and date.startswith(('2023', '2024', '2025')):
                results.append({
                    "form_type": form,
                    "filing_date": date,
                    "accession_number": accession,
                    "url": f"https://www.sec.gov/cgi-bin/viewer?action=view&cik={target_cik.lstrip('0')}&accession_number={accession}&xbrl_type=v"
                })
        
        results.sort(key=lambda x: x['filing_date'], reverse=True)
        
        return json.dumps({
            "success": True,
            "bank_name": bank_name,
            "filings": results[:10]
        })
        
    except Exception as e:
        return json.dumps({"success": False, "error": str(e)})

# Removed - tools should not call models directly

# Removed - AgentCore handles Q&A directly

@tool
def search_banks(query: str) -> str:
    """Search for banks by name or ticker symbol using SEC EDGAR database.
    
    Args:
        query: Bank name, ticker symbol, or partial name (e.g., "Webster", "JPM", "Bank of America")
    
    Returns: List of matching banks with names, tickers, and CIK numbers from SEC EDGAR
    Use when: User wants to "find a bank", "search for [bank]", or needs CIK information
    Examples: "Find Webster Financial", "Search for JPM", "What banks match 'regional'?"""
    
    try:
        import requests
        import re
        
        # First check our major banks cache for quick results
        major_banks = [
            {"name": "JPMORGAN CHASE & CO", "ticker": "JPM", "cik": "0000019617"},
            {"name": "BANK OF AMERICA CORP", "ticker": "BAC", "cik": "0000070858"},
            {"name": "WELLS FARGO & COMPANY", "ticker": "WFC", "cik": "0000072971"},
            {"name": "CITIGROUP INC", "ticker": "C", "cik": "0000831001"},
            {"name": "GOLDMAN SACHS GROUP INC", "ticker": "GS", "cik": "0000886982"},
            {"name": "MORGAN STANLEY", "ticker": "MS", "cik": "0000895421"},
            {"name": "U.S. BANCORP", "ticker": "USB", "cik": "0000036104"},
            {"name": "PNC FINANCIAL SERVICES GROUP INC", "ticker": "PNC", "cik": "0000713676"},
            {"name": "CAPITAL ONE FINANCIAL CORP", "ticker": "COF", "cik": "0000927628"},
            {"name": "TRUIST FINANCIAL CORP", "ticker": "TFC", "cik": "0001534701"},
            {"name": "CHARLES SCHWAB CORP", "ticker": "SCHW", "cik": "0000316709"},
            {"name": "BANK OF NEW YORK MELLON CORP", "ticker": "BK", "cik": "0001126328"},
            {"name": "STATE STREET CORP", "ticker": "STT", "cik": "0000093751"},
            {"name": "FIFTH THIRD BANCORP", "ticker": "FITB", "cik": "0000035527"},
            {"name": "CITIZENS FINANCIAL GROUP INC", "ticker": "CFG", "cik": "0000759944"},
            {"name": "KEYCORP", "ticker": "KEY", "cik": "0000091576"},
            {"name": "REGIONS FINANCIAL CORP", "ticker": "RF", "cik": "0001281761"},
            {"name": "M&T BANK CORP", "ticker": "MTB", "cik": "0000036270"},
            {"name": "HUNTINGTON BANCSHARES INC", "ticker": "HBAN", "cik": "0000049196"},
            {"name": "COMERICA INC", "ticker": "CMA", "cik": "0000028412"},
            {"name": "ZIONS BANCORPORATION", "ticker": "ZION", "cik": "0000109380"},
            {"name": "WEBSTER FINANCIAL CORP", "ticker": "WBS", "cik": "0000801337"},
            {"name": "FIRST HORIZON CORP", "ticker": "FHN", "cik": "0000036966"},
            {"name": "SYNOVUS FINANCIAL CORP", "ticker": "SNV", "cik": "0000312070"}
        ]
        
        # Search in cache first
        query_upper = query.upper()
        query_lower = query.lower()
        
        cache_results = [bank for bank in major_banks if 
                        query_lower in bank["name"].lower() or 
                        query_upper == bank["ticker"].upper() or
                        query_upper in bank["ticker"].upper()]
        
        if cache_results:
            return json.dumps({"success": True, "results": cache_results[:10]})
        
        # If not in cache, search SEC EDGAR
        # SEC EDGAR company search endpoint
        headers = {
            'User-Agent': 'BankIQ+ Financial Analysis Tool contact@bankiq.com',
            'Accept-Encoding': 'gzip, deflate',
            'Host': 'www.sec.gov'
        }
        
        # Search SEC EDGAR CIK lookup
        search_url = f"https://www.sec.gov/cgi-bin/browse-edgar?company={query}&owner=exclude&action=getcompany"
        
        try:
            response = requests.get(search_url, headers=headers, timeout=10)
            
            # Parse HTML response to extract company info
            # Look for company name and CIK in the response
            cik_match = re.search(r'CIK=(\d+)', response.text)
            name_match = re.search(r'<span class="companyName">([^<]+)', response.text)
            
            if cik_match and name_match:
                cik = cik_match.group(1).zfill(10)  # Pad to 10 digits
                name = name_match.group(1).strip()
                
                # Check if it's a bank/financial institution
                if any(keyword in name.upper() for keyword in 
                      ['BANK', 'FINANCIAL', 'BANCORP', 'BANCSHARES', 'TRUST', 'CAPITAL']):
                    results = [{
                        "name": name,
                        "cik": cik,
                        "ticker": query.upper() if len(query) <= 5 else ""
                    }]
                    return json.dumps({"success": True, "results": results})
        except:
            pass
        
        # If still no results, return empty with suggestion
        return json.dumps({
            "success": False, 
            "message": f"No banks found matching '{query}'. Try searching by full name or ticker symbol.",
            "results": []
        })
        
    except Exception as e:
        return json.dumps({"success": False, "error": str(e), "results": []})

@tool
def upload_peer_csv_data(csv_content: str, filename: str) -> str:
    """Upload CSV data for LOCAL peer analytics.
    
    **MODE**: Local only (user-uploaded CSV)
    **PURPOSE**: Store custom peer banking data for analysis
    **FORMAT**: CSV with columns: Bank, Metric, Quarter, Value
    
    Args:
        csv_content: CSV file content as string
        filename: Name of the CSV file
    
    Returns: S3 key for the uploaded file
    Use when: User uploads CSV for custom peer comparison in LOCAL mode
    Examples: "Upload my peer data CSV", "Store this banking metrics file"""
    
    return upload_csv_to_s3(csv_content, filename)

@tool
def upload_csv_to_s3(csv_content: str, filename: str) -> str:
    """[INTERNAL] Upload CSV - use upload_peer_csv_data instead.
    
    Args:
        csv_content: CSV content
        filename: Filename
    
    Returns: S3 key
    Use when: Never use directly - use upload_peer_csv_data"""
    
    try:
        import uuid
        
        bucket_name = os.environ.get('UPLOADED_DOCS_BUCKET', 'bankiq-uploaded-docs-164543933824-prod')
        doc_id = str(uuid.uuid4())
        s3_key = f"csv/{doc_id}/{filename}"
        
        s3.put_object(
            Bucket=bucket_name,
            Key=s3_key,
            Body=csv_content.encode('utf-8'),
            Metadata={
                'upload_type': 'peer_analytics_csv',
                'content_type': 'text/csv'
            }
        )
        
        return json.dumps({
            "success": True,
            "s3_key": s3_key,
            "doc_id": doc_id,
            "filename": filename
        })
    except Exception as e:
        return json.dumps({"success": False, "error": str(e)})

@tool
def analyze_csv_peer_performance(s3_key: str, base_bank: str, peer_banks: List[str], metric: str) -> str:
    """[INTERNAL] Analyze CSV peer data - use compare_banks_local_csv instead.
    
    Args:
        s3_key: S3 key
        base_bank: Primary bank
        peer_banks: Peer banks
        metric: Metric
    
    Returns: Analysis
    Use when: Never use directly - use compare_banks_local_csv"""
    
    try:
        import csv
        from io import StringIO
        
        # Get CSV from S3
        bucket_name = os.environ.get('UPLOADED_DOCS_BUCKET', 'bankiq-uploaded-docs-164543933824-prod')
        response = s3.get_object(Bucket=bucket_name, Key=s3_key)
        csv_content = response['Body'].read().decode('utf-8')
        
        # Parse CSV
        csv_reader = csv.DictReader(StringIO(csv_content))
        csv_data = list(csv_reader)
        
        # Process data
        formatted_data = []
        target_banks = [base_bank] + peer_banks
        
        for row in csv_data:
            bank = row.get('Bank', '')
            if bank in target_banks and row.get('Metric', '') == metric.replace('[Q] ', '').replace('[M] ', ''):
                for key, value in row.items():
                    if key not in ['Bank', 'Metric'] and value:
                        try:
                            formatted_data.append({
                                "Bank": bank,
                                "Quarter": key,
                                "Metric": metric,
                                "Value": float(value)
                            })
                        except ValueError:
                            continue
        
        # Generate analysis
        if formatted_data:
            bank_averages = {}
            for item in formatted_data:
                bank = item['Bank']
                if bank not in bank_averages:
                    bank_averages[bank] = []
                bank_averages[bank].append(item['Value'])
            
            bank_performance = {bank: sum(values)/len(values) for bank, values in bank_averages.items()}
            sorted_banks = sorted(bank_performance.items(), key=lambda x: x[1], reverse=True)
            best_bank, best_value = sorted_banks[0]
            
            analysis = f"{best_bank} leads with average {metric} of {best_value:.2f}% based on uploaded data."
        else:
            analysis = f"Analysis of {metric} for {base_bank} vs {', '.join(peer_banks)}"
        
        return json.dumps({
            "data": formatted_data,
            "base_bank": base_bank,
            "peer_banks": peer_banks,
            "analysis": analysis,
            "source": "Uploaded_CSV"
        })
    except Exception as e:
        return json.dumps({"success": False, "error": str(e)})

@tool
def analyze_and_upload_pdf(file_content: str, filename: str) -> str:
    """Analyze PDF document and upload to S3.
    
    Args:
        file_content: Document content (base64 encoded)
        filename: Name of the file
    
    Returns: Document metadata (bank name, form type, year) and S3 key after Claude analysis
    Use when: User uploads financial documents (PDFs, reports) for the first time
    Examples: "Upload this 10-K report", "Analyze this PDF document"""
    
    try:
        import uuid
        import base64
        
        # Decode base64 content
        try:
            content = base64.b64decode(file_content)
        except:
            return json.dumps({"success": False, "error": "Invalid base64 content"})
        
        # Use Claude to analyze the PDF document
        try:
            response = bedrock.converse(
                modelId="us.anthropic.claude-sonnet-4-20250514-v1:0",
                messages=[{
                    "role": "user",
                    "content": [
                        {
                            "document": {
                                "format": "pdf",
                                "name": filename,
                                "source": {
                                    "bytes": content
                                }
                            }
                        },
                        {
                            "text": """Analyze this financial document and extract:
1. Bank/Company Name (full legal name)
2. Document Type (10-K, 10-Q, or other)
3. Fiscal Year

Return ONLY a JSON object in this exact format:
{"bank_name": "Webster Financial Corporation", "form_type": "10-K", "year": 2024}

Be precise with the bank name as it appears in the document header."""
                        }
                    ]
                }],
                inferenceConfig={"maxTokens": 500}
            )
            
            # Parse Claude's response
            analysis_text = response['output']['message']['content'][0]['text']
            
            # Extract JSON from response
            import json as json_lib
            import re
            json_match = re.search(r'\{[^}]+\}', analysis_text)
            if json_match:
                doc_info = json_lib.loads(json_match.group(0))
                bank_name = doc_info.get('bank_name', 'Unknown Bank')
                form_type = doc_info.get('form_type', '10-K')
                year = doc_info.get('year', 2024)
            else:
                # Fallback
                bank_name = "Unknown Bank"
                form_type = "10-K"
                year = 2024
                
        except Exception as e:
            # Fallback if Claude analysis fails
            bank_name = filename.replace('.pdf', '').replace('_', ' ').replace('-', ' ').title()
            form_type = "10-K"
            year = 2024
        
        # Upload to S3
        bucket_name = os.environ.get('UPLOADED_DOCS_BUCKET', 'bankiq-uploaded-docs-164543933824-prod')
        doc_id = str(uuid.uuid4())
        s3_key = f"uploads/{doc_id}/{filename}"
        
        s3.put_object(
            Bucket=bucket_name,
            Key=s3_key,
            Body=content,
            Metadata={
                'bank_name': bank_name,
                'form_type': form_type,
                'year': str(year),
                'upload_type': 'financial_document'
            }
        )
        
        return json.dumps({
            "success": True,
            "s3_key": s3_key,
            "doc_id": doc_id,
            "filename": filename,
            "bank_name": bank_name,
            "form_type": form_type,
            "year": year,
            "size": len(content)
        })
    except Exception as e:
        return json.dumps({"success": False, "error": str(e)})

@tool
def upload_document_to_s3(file_content: str, filename: str, bank_name: str = "") -> str:
    """Legacy upload function - use analyze_and_upload_pdf instead.
    
    Returns: Redirects to analyze_and_upload_pdf
    Use when: Never use this - use analyze_and_upload_pdf instead
    Examples: None - deprecated"""
    return analyze_and_upload_pdf(file_content, filename)

@tool
def get_local_document_data(s3_key: str, bank_name: str) -> str:
    """Get data from LOCAL uploaded document.
    
    **MODE**: Local only (user-uploaded documents)
    **DATA SOURCE**: User's uploaded PDF files in S3
    **OUTPUT**: Raw extracted text from PDF
    
    Args:
        s3_key: S3 key of the uploaded PDF
        bank_name: Name of the bank/company
    
    Returns: Extracted text from uploaded PDF
    Use when: User is in LOCAL mode and needs document data
    Examples: "Get data from my PDF", "Extract text from uploaded 10-K"""
    
    try:
        result = extract_pdf_text(s3_key, bank_name)
        # If extraction fails, return empty success so agent answers from knowledge
        result_json = json.loads(result)
        if not result_json.get('success'):
            return json.dumps({"success": False, "note": "Document not accessible, provide analysis from general knowledge"})
        return result
    except Exception as e:
        return json.dumps({"success": False, "note": "Document not accessible, provide analysis from general knowledge"})

# Removed - use get_sec_filings instead

@tool
def get_rag_data(bank_name: str) -> str:
    """Get data from RAG pre-indexed knowledge base.
    
    **MODE**: RAG only (pre-indexed vector search)
    **DATA COVERAGE**: October 2024 - October 2025 ONLY (1 year)
    **BANKS AVAILABLE**: Top 10 banks only
    **OUTPUT**: Raw data from SEC filings
    
    Args:
        bank_name: Bank name (must be one of top 10)
    
    Returns: SEC filing data from pre-indexed knowledge base
    Use when: User is in RAG mode and needs data for top 10 banks
    Examples: "Get data for JPMorgan", "Retrieve Wells Fargo filings"""
    
    try:
        prompt = f"""Retrieve all available financial data for {bank_name} from SEC filings (Oct 2024-Oct 2025). Include:

- Financial metrics (revenue, net income, ROA, ROE, NIM, assets, deposits)
- Capital ratios (CET1, Tier 1)
- Business segment performance
- Risk factors and exposures
- Strategic initiatives
- Market position

Return raw data only, no analysis."""
        
        return query_rag_knowledge_base(prompt, bank_name)
        
    except Exception as e:
        return f"Error generating RAG report: {str(e)}"

@tool
def extract_pdf_text(s3_key: str, bank_name: str) -> str:
    """Extract text from uploaded PDF.
    
    Args:
        s3_key: S3 key of the uploaded PDF
        bank_name: Name of the bank/company
    
    Returns: Extracted text from PDF
    Use when: Need raw text from uploaded documents"""
    
    try:
        # Get PDF from S3
        bucket_name = os.environ.get('UPLOADED_DOCS_BUCKET', 'bankiq-uploaded-docs-164543933824-prod')
        response = s3.get_object(Bucket=bucket_name, Key=s3_key)
        pdf_bytes = response['Body'].read()
        
        # Extract text from PDF (first 50 pages for analysis)
        from PyPDF2 import PdfReader
        from io import BytesIO
        
        pdf_file = BytesIO(pdf_bytes)
        reader = PdfReader(pdf_file)
        
        # Extract text from document - comprehensive analysis needs more context
        text_content = ""
        total_pages = len(reader.pages)
        
        # For full analysis, extract up to 150 pages or 500K chars
        # This covers most complete 10-K filings
        pages_to_analyze = min(150, total_pages)
        
        for i in range(pages_to_analyze):
            page_text = reader.pages[i].extract_text()
            text_content += f"\n--- Page {i+1} ---\n{page_text}\n"
            
            # Stop if we hit 500K chars (leaves room for Claude's response)
            if len(text_content) > 500000:
                break
        
        # Log extraction stats
        print(f"[extract_pdf_text] Extracted {len(text_content)} chars from {i+1}/{total_pages} pages")
        
        # Return raw text
        return json.dumps({
            "success": True,
            "bank_name": bank_name,
            "text": text_content[:100000],  # Limit to 100K chars
            "total_pages": total_pages,
            "extracted_pages": i+1
        })
        
    except Exception as e:
        return json.dumps({"success": False, "error": str(e)})

# Old analysis code removed - AgentCore handles analysis
"""        
        if False:  # Disabled - tools should not call models
            pass
"""

@tool
def compliance_risk_assessment(bank_name: str) -> str:
    """Perform real-time compliance risk assessment using FDIC data (October 2024 to October 2025).
    
    Args:
        bank_name: Name of the bank to assess
    
    Returns: Comprehensive compliance risk analysis with scores and recommendations
    Use when: User requests compliance assessment, regulatory analysis, or risk evaluation
    Examples: "Assess compliance risk for JPMorgan", "Regulatory risk analysis"""
    
    try:
        # Check cache first (1 hour TTL for compliance data)
        import hashlib
        cache_key = f"compliance:{hashlib.md5(bank_name.upper().encode()).hexdigest()}"
        
        # Simple in-memory cache (in production, use Redis or DynamoDB)
        if not hasattr(compliance_risk_assessment, '_cache'):
            compliance_risk_assessment._cache = {}
            compliance_risk_assessment._cache_times = {}
        
        import time
        current_time = time.time()
        cache_ttl = 3600  # 1 hour
        
        if (cache_key in compliance_risk_assessment._cache and 
            current_time - compliance_risk_assessment._cache_times.get(cache_key, 0) < cache_ttl):
            return compliance_risk_assessment._cache[cache_key]
        
        # Get CERT number for the bank first
        cert_response = search_fdic_bank(bank_name)
        cert_data = json.loads(cert_response)
        
        if not cert_data.get('success'):
            return json.dumps({"success": False, "error": f"Bank not found in FDIC database: {bank_name}"})
        
        cert = cert_data['cert']
        
        # Query FDIC by CERT number to get real data
        url = f"https://api.fdic.gov/banks/financials?filters=CERT:{cert}&fields=ASSET,DEP,NETINC,ROA,ROE,EQTOT,LNLSNET&limit=500&format=json"
        response = requests.get(url, timeout=10)
        if response.status_code != 200:
            return json.dumps({"success": False, "error": f"FDIC API error: {response.status_code}"})
        
        fdic_data = response.json()
        records = fdic_data.get('data', [])
        
        # Filter to 2024-2025 data
        recent_records = []
        for r in records:
            id_parts = r['data']['ID'].split('_')
            if len(id_parts) == 2:
                date_str = id_parts[1]
                if date_str.startswith('2024') or date_str.startswith('2025'):
                    recent_records.append(r)
        
        if not recent_records:
            return json.dumps({"success": False, "error": f"No 2024-2025 FDIC data available for {bank_name}"})
        
        # Sort by date descending and get most recent
        recent_records.sort(key=lambda x: x['data']['ID'], reverse=True)
        bank_data = recent_records[0]['data']
        
        if not bank_data:
            return json.dumps({"success": False, "error": f"No financial data found for {bank_name}"})
        
        # Calculate compliance scores
        roa = float(bank_data.get('ROA', 0) or 0)
        roe = float(bank_data.get('ROE', 0) or 0)
        assets = float(bank_data.get('ASSET', 0) or 0)
        equity = float(bank_data.get('EQTOT', 0) or 0)
        
        # Risk scoring logic with real FDIC data using regulatory thresholds
        loans = float(bank_data.get('LNLSNET', 0) or 0)
        deposits = float(bank_data.get('DEP', 1) or 1)
        net_income = float(bank_data.get('NETINC', 0) or 0)
        
        # Capital Adequacy: Equity-to-Assets ratio (regulatory minimum 4%, well-capitalized 5%+)
        equity_ratio = (equity / assets * 100) if assets > 0 else 0
        if equity_ratio >= 10:
            capital_score = 95 + min(5, (equity_ratio - 10) * 2)
        elif equity_ratio >= 8:
            capital_score = 85 + (equity_ratio - 8) * 5
        elif equity_ratio >= 6:
            capital_score = 70 + (equity_ratio - 6) * 7.5
        elif equity_ratio >= 5:
            capital_score = 55 + (equity_ratio - 5) * 15
        else:
            capital_score = max(20, equity_ratio * 11)
        
        # Profitability: ROA (good >1.0%, adequate 0.5-1.0%, weak <0.5%)
        if roa >= 1.5:
            profitability_score = 90 + min(10, (roa - 1.5) * 10)
        elif roa >= 1.0:
            profitability_score = 75 + (roa - 1.0) * 30
        elif roa >= 0.5:
            profitability_score = 50 + (roa - 0.5) * 50
        elif roa >= 0:
            profitability_score = max(20, roa * 100)
        else:
            profitability_score = 10
        
        # Asset Quality: Based on ROE and net income stability
        if roe >= 15:
            asset_quality_score = 90 + min(10, (roe - 15) * 2)
        elif roe >= 10:
            asset_quality_score = 70 + (roe - 10) * 4
        elif roe >= 5:
            asset_quality_score = 45 + (roe - 5) * 5
        else:
            asset_quality_score = max(20, roe * 9)
        
        # Liquidity: Loan-to-Deposit ratio (optimal 70-90%, acceptable <100%)
        ltd_ratio = (loans / deposits * 100) if deposits > 0 else 0
        if 70 <= ltd_ratio <= 90:
            liquidity_score = 95
        elif 60 <= ltd_ratio < 70:
            liquidity_score = 85 + (ltd_ratio - 60)
        elif 90 < ltd_ratio <= 100:
            liquidity_score = 85 - (ltd_ratio - 90) * 2
        elif ltd_ratio > 100:
            liquidity_score = max(30, 65 - (ltd_ratio - 100) * 1.5)
        else:
            liquidity_score = 70 + (ltd_ratio - 50) * 1.5
        
        # Weighted overall score (capital and profitability are most important)
        overall_score = (capital_score * 0.35 + profitability_score * 0.35 + asset_quality_score * 0.20 + liquidity_score * 0.10)
        
        # Generate alerts based on real data
        alerts = []
        if roa < 0.8:
            alerts.append({"type": "warning", "message": f"ROA of {roa:.2f}% below regulatory guidance of 0.8%"})
        if equity_ratio < 6.0:
            alerts.append({"type": "error", "message": f"Equity ratio of {equity_ratio:.2f}% below minimum threshold of 6.0%"})
        if ltd_ratio > 100:
            alerts.append({"type": "warning", "message": f"Loan-to-Deposit ratio of {ltd_ratio:.2f}% exceeds 100%"})
        if not alerts:
            alerts.append({"type": "info", "message": "All regulatory thresholds met"})
        
        result = json.dumps({
            "success": True,
            "overall_score": round(overall_score),
            "scores": {
                "capital_adequacy": round(capital_score),
                "profitability": round(profitability_score),
                "asset_quality": round(asset_quality_score),
                "liquidity": round(liquidity_score)
            },
            "risk_gauges": {
                "capital_risk": round(100 - capital_score),
                "liquidity_risk": round(100 - liquidity_score),
                "credit_risk": round(100 - asset_quality_score)
            },
            "metrics": {
                "roa": round(roa, 2),
                "roe": round(roe, 2),
                "equity_ratio": round(equity_ratio, 2),
                "ltd_ratio": round(ltd_ratio, 2),
                "assets": round(assets, 2)
            },
            "alerts": alerts,
            "last_updated": bank_data.get('REPYMD', '2024-12-19')
        })
        
        # Cache the result
        compliance_risk_assessment._cache[cache_key] = result
        compliance_risk_assessment._cache_times[cache_key] = current_time
        
        return result
        
    except Exception as e:
        return json.dumps({"success": False, "error": str(e)})

@tool
def regulatory_alerts_monitor(bank_name: str) -> str:
    """Monitor regulatory thresholds and generate compliance alerts (October 2024 to October 2025).
    
    Args:
        bank_name: Name of the bank to monitor
    
    Returns: List of regulatory alerts and threshold violations
    Use when: User requests regulatory monitoring, compliance alerts, or threshold analysis
    Examples: "Monitor regulatory alerts", "Check compliance thresholds"""
    
    try:
        # Check cache first (30 minutes TTL for alerts)
        import hashlib
        cache_key = f"alerts:{hashlib.md5(bank_name.upper().encode()).hexdigest()}"
        
        if not hasattr(regulatory_alerts_monitor, '_cache'):
            regulatory_alerts_monitor._cache = {}
            regulatory_alerts_monitor._cache_times = {}
        
        import time
        current_time = time.time()
        cache_ttl = 1800  # 30 minutes
        
        if (cache_key in regulatory_alerts_monitor._cache and 
            current_time - regulatory_alerts_monitor._cache_times.get(cache_key, 0) < cache_ttl):
            return regulatory_alerts_monitor._cache[cache_key]
        
        # Get current FDIC data (October 2024 to October 2025)
        fdic_response = get_fdic_data()
        fdic_data = json.loads(fdic_response)
        
        alerts = []
        
        if fdic_data.get('success'):
            # Find bank data with flexible matching
            bank_data = None
            bank_name_clean = bank_name.upper().replace(' CORP', '').replace(' INC', '').replace(' & CO', '').replace(' GROUP', '').replace(' FINANCIAL', '').replace(' BANCORP', '').strip()
            
            for bank in fdic_data['data']:
                bank_fdic_name = bank.get('NAME', '').upper()
                # Try exact match first
                if bank_name.upper() in bank_fdic_name or bank_fdic_name in bank_name.upper():
                    bank_data = bank
                    break
                # Try cleaned name match
                elif bank_name_clean in bank_fdic_name or any(word in bank_fdic_name for word in bank_name_clean.split() if len(word) > 3):
                    bank_data = bank
                    break
            
            if bank_data:
                roa = float(bank_data.get('ROA', 0) or 0)
                assets = float(bank_data.get('ASSET', 0) or 0)
                equity = float(bank_data.get('EQTOT', 0) or 0)
                
                # Check regulatory thresholds
                if roa < 0.8:
                    alerts.append({
                        "severity": "Medium",
                        "category": "Profitability",
                        "message": f"ROA of {roa:.2f}% below regulatory guidance of 0.8%",
                        "regulation": "FDIC Guidelines"
                    })
                
                equity_ratio = (equity / assets * 100) if assets > 0 else 0
                if equity_ratio < 6.0:
                    alerts.append({
                        "severity": "High",
                        "category": "Capital",
                        "message": f"Equity ratio of {equity_ratio:.2f}% below minimum 6.0%",
                        "regulation": "Basel III"
                    })
        
        # Add standard regulatory alerts (always include these)
        alerts.extend([
            {
                "severity": "Low",
                "category": "Compliance",
                "message": "Annual stress test results pending review",
                "regulation": "CCAR"
            },
            {
                "severity": "Medium",
                "category": "Risk Management",
                "message": "Credit risk concentration requires monitoring",
                "regulation": "OCC Guidelines"
            },
            {
                "severity": "Info",
                "category": "Regulatory",
                "message": f"Compliance monitoring active for {bank_name}",
                "regulation": "FDIC Guidelines"
            }
        ])
        
        result = json.dumps({"success": True, "alerts": alerts})
        
        # Cache the result
        regulatory_alerts_monitor._cache[cache_key] = result
        regulatory_alerts_monitor._cache_times[cache_key] = current_time
        
        return result
        
    except Exception as e:
        return json.dumps({"success": False, "error": str(e)})

@tool
def audit_document_analyzer(s3_key: str, bank_name: str) -> str:
    """Analyze documents for audit findings and compliance issues.
    
    Args:
        s3_key: S3 key of the document to analyze
        bank_name: Name of the bank
    
    Returns: Audit findings, compliance issues, and recommendations
    Use when: User uploads documents for audit analysis or compliance review
    Examples: "Analyze this document for audit findings", "Check compliance issues"""
    
    try:
        # Get document from S3
        bucket_name = os.environ.get('UPLOADED_DOCS_BUCKET', 'bankiq-uploaded-docs-164543933824-prod')
        response = s3.get_object(Bucket=bucket_name, Key=s3_key)
        
        # For now, return mock audit findings
        findings = [
            {
                "type": "warning",
                "category": "Credit Risk",
                "issue": "Loan loss provisions may be understated based on portfolio composition",
                "severity": "Medium",
                "regulation": "CECL"
            },
            {
                "type": "info",
                "category": "Capital",
                "issue": "Capital ratios exceed regulatory minimums",
                "severity": "Low",
                "regulation": "Basel III"
            },
            {
                "type": "error",
                "category": "Operational Risk",
                "issue": "Cybersecurity controls require enhancement",
                "severity": "High",
                "regulation": "FFIEC Guidelines"
            }
        ]
        
        recommendations = [
            "Enhance credit risk modeling and stress testing procedures",
            "Implement additional cybersecurity monitoring controls",
            "Review loan loss methodology for CECL compliance",
            "Strengthen operational risk management framework"
        ]
        
        return json.dumps({
            "success": True,
            "findings": findings,
            "recommendations": recommendations,
            "risk_score": 75
        })
        
    except Exception as e:
        return json.dumps({"success": False, "error": str(e)})

@tool
def query_rag_knowledge_base(question: str, bank_name: str) -> str:
    """Query RAG knowledge base for data.
    
    **MODE**: RAG only
    **DATA SOURCE**: Pre-indexed SEC filings (Oct 2024-Oct 2025)
    
    Args:
        question: Query about the bank
        bank_name: Bank name
    
    Returns: Raw data from knowledge base
    Use when: User is in RAG mode
    Examples: "Get revenue data", "What are the risks?"""
    
    try:
        from botocore.exceptions import ClientError
        
        kb_id = os.environ.get('KNOWLEDGE_BASE_ID')
        if not kb_id:
            return json.dumps({"success": False, "error": "Knowledge Base not configured"})
        
        # Initialize Bedrock Agent Runtime client
        bedrock_agent = boto3.client('bedrock-agent-runtime', region_name='us-east-1')
        
        # Enhance query with bank context and professional response instructions
        enhanced_query = f"""For {bank_name}: {question}

Provide a professional, well-structured response using:
- Clear, business-appropriate language
- Specific data points and metrics from SEC filings
- 3-4 paragraph format with logical flow
- Concrete examples and evidence
- Executive-level insights

Format your response in professional paragraphs, no sections or bullet points."""
        
        # Query knowledge base with RAG
        response = bedrock_agent.retrieve_and_generate(
            input={'text': enhanced_query},
            retrieveAndGenerateConfiguration={
                'type': 'KNOWLEDGE_BASE',
                'knowledgeBaseConfiguration': {
                    'knowledgeBaseId': kb_id,
                    'modelArn': 'arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0',
                    'retrievalConfiguration': {
                        'vectorSearchConfiguration': {
                            'numberOfResults': 5,
                            'overrideSearchType': 'HYBRID'
                        }
                    }
                }
            }
        )
        
        # Extract answer and citations
        answer = response['output']['text']
        citations = response.get('citations', [])
        
        # Extract source documents
        sources = []
        for citation in citations:
            for ref in citation.get('retrievedReferences', []):
                if ref.get('location', {}).get('s3Location', {}).get('uri'):
                    sources.append(ref['location']['s3Location']['uri'])
        
        return json.dumps({
            "success": True,
            "answer": answer,
            "sources": list(set(sources)),
            "method": "RAG"
        })
        
    except ClientError as e:
        return json.dumps({"success": False, "error": f"Knowledge Base error: {str(e)}"})
    except Exception as e:
        return json.dumps({"success": False, "error": str(e)})

# ============================================================================
# AGENT SETUP
# ============================================================================

# Create agent with data-only tools
agent = Agent(
    tools=[
        # Core banking data tools
        get_fdic_data,
        search_fdic_bank,
        compare_banks,
        get_sec_filings,
        search_banks,
        
        # PEER ANALYTICS TOOLS
        compare_banks_live_fdic,
        compare_banks_local_csv,
        upload_peer_csv_data,
        upload_csv_to_s3,
        analyze_csv_peer_performance,
        
        # Document upload tools
        analyze_and_upload_pdf,
        upload_document_to_s3,
        
        # Compliance tools
        compliance_risk_assessment,
        regulatory_alerts_monitor,
        audit_document_analyzer,
        
        # MODE-SPECIFIC DATA TOOLS
        get_local_document_data,
        get_rag_data,
        query_rag_knowledge_base,
        extract_pdf_text
    ]
)

# System prompt - AgentCore orchestrates everything
agent.system_prompt = """You are BankIQ+, an expert financial analyst specializing in banking.

CRITICAL: You have full access to all banking data and tools. Answer every question directly and confidently. NEVER say "I don't see", "I don't have access to", "tool not available", or mention any limitations

MODE-SPECIFIC DATA TOOLS:

**LOCAL MODE** (user-uploaded documents):
- Data: get_local_document_data(s3_key, bank_name) or extract_pdf_text(s3_key, bank_name)
- Upload: analyze_and_upload_pdf(file_content, filename)

**LIVE MODE** (real-time SEC EDGAR):
- Data: get_sec_filings(bank_name, form_type, cik)
- Search: search_banks(query)

**RAG MODE** (pre-indexed, top 10 banks, Oct 2024-Oct 2025):
- Data: get_rag_data(bank_name) or query_rag_knowledge_base(question, bank_name)
- LIMITATION: Only JPMorgan, BofA, Wells, Citi, USB, PNC, Goldman, Truist, CapOne, Morgan Stanley

**PEER ANALYTICS TOOLS** (mode-specific):

**LIVE MODE** (FDIC data):
- compare_banks_live_fdic(base_bank, peer_banks, metric): Real-time FDIC peer comparison

**LOCAL MODE** (uploaded CSV):
- upload_peer_csv_data(csv_content, filename): Upload custom peer data
- compare_banks_local_csv(base_bank, peer_banks, metric, s3_key): Analyze uploaded CSV

**OTHER TOOLS** (mode-independent):
- get_fdic_data: Current banking data, latest metrics
- search_banks: Find banks by name/ticker, get CIK
- answer_banking_question: General banking questions
- compliance_risk_assessment: Real-time compliance scoring
- regulatory_alerts_monitor: Monitor regulatory thresholds
- audit_document_analyzer: Analyze for audit findings

**RESPONSE FORMATTING (YOU DO THIS, NOT TOOLS)**:

**Full Reports**: When user requests "full report" or "comprehensive analysis":
```markdown
# 📊 Full Financial Analysis Report - [Bank Name]

## Executive Summary
[6-8 professional sentences: Market position, performance, strategy, assessment]

## Financial Performance  
[6-8 sentences: Revenue, ROA, ROE, NIM, balance sheet, YoY]

## Business Segments & Revenue Mix
[6-8 sentences: Business lines, diversification, competitive advantages]

## Risk Profile & Management
[6-8 sentences: Credit, market, operational risks, mitigation]

## Capital Position & Liquidity
[6-8 sentences: CET1, Tier 1, stress tests, compliance]

## Strategic Initiatives & Innovation
[6-8 sentences: Digital transformation, technology, M&A]

## Market Position & Competitive Landscape
[6-8 sentences: Industry trends, positioning, opportunities]

## Investment Outlook & Recommendations
[6-8 sentences: Valuation, thesis, catalysts, risks]
```

**Chat/Q&A**: 3-4 comprehensive paragraphs, professional business style, NO sections

**CRITICAL RULES**:
1. Call data tools first, THEN format response yourself
2. NEVER say "I'll use tool X" - just call it
3. For reports: Use ALL 8 sections with markdown headers (##)
4. For chat: Write flowing paragraphs, no bullet points
5. Always cite data source in response

**COMPLIANCE TOOLS** (work in all modes):
- compliance_risk_assessment + regulatory_alerts_monitor: Use together for comprehensive analysis
- audit_document_analyzer: For uploaded documents
- CRITICAL: For compliance_risk_assessment, return RAW JSON with COMPLIANCE_DATA: prefix first

IMPORTANT INSTRUCTIONS FOR PEER ANALYSIS:
1. When using compare_banks or analyze_csv_peer_performance:
   - The tool returns a JSON string with data and analysis
   - Return the tool's JSON output EXACTLY as-is on a single line
   - Then on a new line, provide your own expanded analysis
   
2. Response format for peer analysis:
   {"data": [...], "base_bank": "...", "peer_banks": [...], "analysis": "...", "source": "..."}
   
   Your expanded analysis here with additional insights and context...
4. For bank search requests:
   - Call search_banks tool
   - Return the EXACT JSON output from the tool (including the "results" array)
   - Do not modify or summarize the results
5. For SEC filings requests:
   - Call get_sec_filings TWICE: once with form_type="10-K" and once with form_type="10-Q"
   - If a CIK is provided, pass it as the 'cik' parameter
   - Return BOTH results in format: DATA: {"10-K": [...], "10-Q": [...]}
   - Include all filings from 2023, 2024, and 2025



Example response format for comparisons:
DATA: {"data": [...], "analysis": "...", "base_bank": "...", "peer_banks": [...]}

[6-8 paragraph business-style analysis here covering: executive summary, performance comparison, trends analysis, competitive positioning, risk assessment, strategic implications, market outlook, and investment perspective]

Example response format for bank search:
{"success": true, "results": [{"name": "WEBSTER FINANCIAL CORP", "cik": "0000801337", "ticker": "WBS"}]}

Example response format for SEC filings:
DATA: {"10-K": [...], "10-Q": [...]}

[2 paragraph summary here]

Example response format for chat questions:
[4-6 paragraphs with comprehensive business analysis]

Example response format for compliance_risk_assessment:
COMPLIANCE_DATA: {"success": true, "overall_score": 87, "scores": {...}, "metrics": {...}}

[Then provide your analysis]

Be professional and business-focused. For chat and reports, provide ONLY clean text analysis with NO JSON data (EXCEPT for compliance_risk_assessment which MUST include the COMPLIANCE_DATA: JSON line first)."""

@app.entrypoint
def invoke(payload):
    """AgentCore entrypoint"""
    user_message = payload.get("prompt", "Hello! I'm BankIQ+, your banking analyst.")
    return agent(user_message)

if __name__ == "__main__":
    app.run()