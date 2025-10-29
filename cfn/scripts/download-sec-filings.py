#!/usr/bin/env python3
"""
Download SEC 10-K and 10-Q filings for top 10 banks (Oct 2024 - Oct 2025)
Downloads CLEAN TEXT ONLY - optimized for Bedrock Knowledge Base ingestion
"""

import os
import sys
import time
import requests
import boto3
import re
from bs4 import BeautifulSoup
from concurrent.futures import ThreadPoolExecutor, as_completed

# Install dependencies if needed
try:
    from bs4 import BeautifulSoup
except ImportError:
    print("Installing beautifulsoup4...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "beautifulsoup4", "lxml"])
    from bs4 import BeautifulSoup

# Top 10 banks with their CIK numbers
BANKS = {
    "JPMORGAN-CHASE": "0000019617",
    "BANK-OF-AMERICA": "0000070858",
    "WELLS-FARGO": "0000072971",
    "CITIGROUP": "0000831001",
    "US-BANCORP": "0000036104",
    "PNC-FINANCIAL": "0000713676",
    "GOLDMAN-SACHS": "0000886982",
    "TRUIST-FINANCIAL": "0001534701",
    "CAPITAL-ONE": "0000927628",
    "MORGAN-STANLEY": "0000895421"
}

HEADERS = {
    "User-Agent": "BankIQ+ bankiq@example.com",
    "Accept-Encoding": "gzip, deflate"
}

# Bedrock KB limits
MAX_FILE_SIZE = 45 * 1024 * 1024  # 45MB (leave buffer under 50MB limit)

def clean_text(text):
    """Clean and normalize text"""
    # Remove excessive whitespace
    text = re.sub(r'\n\s*\n\s*\n+', '\n\n', text)
    # Remove lines with only whitespace
    lines = [line.rstrip() for line in text.split('\n')]
    text = '\n'.join(line for line in lines if line)
    return text.strip()

def extract_clean_text_from_html(html_content):
    """Extract clean text from HTML, removing all markup"""
    try:
        soup = BeautifulSoup(html_content, 'lxml')
        
        # Remove script, style, and other non-content elements
        for element in soup(['script', 'style', 'meta', 'link', 'noscript', 'iframe']):
            element.decompose()
        
        # Get text
        text = soup.get_text(separator='\n', strip=True)
        
        # Clean up
        text = clean_text(text)
        
        return text
    except Exception as e:
        print(f"      Warning: HTML parsing error: {e}")
        return None

def download_filing_clean_text(cik, accession, bank_name, form_type, date):
    """Download SEC filing and extract CLEAN TEXT ONLY"""
    try:
        accession_no_dash = accession.replace('-', '')
        cik_no_leading = cik.lstrip('0')
        
        # Download the complete submission file
        txt_url = f"https://www.sec.gov/Archives/edgar/data/{cik_no_leading}/{accession_no_dash}/{accession}.txt"
        response = requests.get(txt_url, headers=HEADERS, timeout=30)
        
        if response.status_code != 200:
            print(f"      Failed to download: HTTP {response.status_code}")
            return None
        
        content = response.text
        
        # Extract the main document from SGML structure
        if '<DOCUMENT>' in content:
            # Find first document (main filing)
            start = content.find('<DOCUMENT>')
            end = content.find('</DOCUMENT>', start)
            
            if start != -1 and end != -1:
                doc_section = content[start:end]
                
                # Extract TEXT section
                text_start = doc_section.find('<TEXT>')
                text_end = doc_section.find('</TEXT>')
                
                if text_start != -1 and text_end != -1:
                    doc_content = doc_section[text_start + 6:text_end]
                    
                    # Check if it's HTML
                    if '<html' in doc_content.lower() or '<HTML' in doc_content:
                        # Extract clean text from HTML
                        clean_content = extract_clean_text_from_html(doc_content)
                        if clean_content and len(clean_content) > 1000:
                            content = clean_content
                        else:
                            print(f"      Warning: Extracted text too short")
                            return None
                    else:
                        # Already plain text, just clean it
                        content = clean_text(doc_content)
        
        # Add metadata header
        header = f"""SEC {form_type} Filing
Bank: {bank_name}
Filing Date: {date}
CIK: {cik}
Accession: {accession}

{'='*80}

"""
        
        full_content = header + content
        
        # Check size and truncate if needed
        content_bytes = full_content.encode('utf-8')
        if len(content_bytes) > MAX_FILE_SIZE:
            print(f"      Warning: File too large ({len(content_bytes)/1024/1024:.1f}MB), truncating...")
            # Truncate to fit
            full_content = full_content[:MAX_FILE_SIZE - 1000]  # Leave buffer
            full_content += "\n\n[Content truncated to fit 50MB limit]"
            content_bytes = full_content.encode('utf-8')
        
        size_mb = len(content_bytes) / 1024 / 1024
        print(f"      Extracted {size_mb:.1f}MB of clean text")
        
        return full_content
        
    except Exception as e:
        print(f"      Error: {e}")
        return None

def get_region():
    """Get AWS region from environment or default"""
    region = os.environ.get('AWS_REGION') or os.environ.get('AWS_DEFAULT_REGION')
    if not region:
        try:
            session = boto3.session.Session()
            region = session.region_name
        except:
            region = 'us-east-1'
    return region

def get_s3_client():
    region = get_region()
    return boto3.client('s3', region_name=region)

def get_bucket_name():
    region = get_region()
    cfn = boto3.client('cloudformation', region_name=region)
    try:
        response = cfn.describe_stacks(StackName='bankiq-infra')
        outputs = response['Stacks'][0]['Outputs']
        for output in outputs:
            if output['OutputKey'] == 'SECFilingsBucketName':
                return output['OutputValue']
    except:
        region = get_region()
        account_id = boto3.client('sts', region_name=region).get_caller_identity()['Account']
        return f"bankiq-sec-filings-{account_id}-prod"

def download_bank_filings(bank_name, cik, bucket_name):
    print(f"\n{'='*60}")
    print(f"Processing {bank_name} (CIK: {cik})")
    print(f"{'='*60}")
    
    s3 = get_s3_client()
    downloaded = 0
    
    # Get recent filings from SEC EDGAR
    try:
        url = f"https://data.sec.gov/submissions/CIK{cik}.json"
        response = requests.get(url, headers=HEADERS, timeout=30)
        response.raise_for_status()
        
        data = response.json()
        filings = data.get('filings', {}).get('recent', {})
        
        forms = filings.get('form', [])
        dates = filings.get('filingDate', [])
        accessions = filings.get('accessionNumber', [])
        
        # Find 1 10-K and 3 10-Qs from 2024-2025
        tenk_found = 0
        tenq_found = 0
        
        for i, (form, date, accession) in enumerate(zip(forms, dates, accessions)):
            if not (date.startswith('2024') or date.startswith('2025')):
                continue
            
            if form == '10-K' and tenk_found < 1:
                s3_key = f"{bank_name}/10-K/{date[:4]}.txt"
                
                print(f"  [1/4] Downloading 10-K {date[:4]}...")
                content = download_filing_clean_text(cik, accession, bank_name, '10-K', date)
                
                if not content:
                    print(f"      Skipping - download failed")
                    continue
                
                # Upload to S3
                s3.put_object(
                    Bucket=bucket_name,
                    Key=s3_key,
                    Body=content.encode('utf-8'),
                    ContentType='text/plain',
                    Metadata={
                        'bank': bank_name,
                        'form_type': '10-K',
                        'filing_date': date,
                        'accession': accession
                    }
                )
                
                print(f"      ✓ Uploaded to s3://{bucket_name}/{s3_key}")
                tenk_found += 1
                downloaded += 1
                time.sleep(0.5)
                
            elif form == '10-Q' and tenq_found < 3:
                quarter = ((int(date[5:7]) - 1) // 3) + 1
                s3_key = f"{bank_name}/10-Q/{date[:4]}-Q{quarter}.txt"
                
                print(f"  [{tenq_found+2}/4] Downloading 10-Q {date[:4]}-Q{quarter}...")
                content = download_filing_clean_text(cik, accession, bank_name, f'10-Q Q{quarter}', date)
                
                if not content:
                    print(f"      Skipping - download failed")
                    continue
                
                # Upload to S3
                s3.put_object(
                    Bucket=bucket_name,
                    Key=s3_key,
                    Body=content.encode('utf-8'),
                    ContentType='text/plain',
                    Metadata={
                        'bank': bank_name,
                        'form_type': '10-Q',
                        'filing_date': date,
                        'quarter': f'Q{quarter}',
                        'accession': accession
                    }
                )
                
                print(f"      ✓ Uploaded to s3://{bucket_name}/{s3_key}")
                tenq_found += 1
                downloaded += 1
                time.sleep(0.5)
            
            if tenk_found >= 1 and tenq_found >= 3:
                break
        
        if downloaded < 4:
            print(f"  ⚠️  Only found {downloaded}/4 filings for {bank_name}")
        
        return downloaded
        
    except Exception as e:
        print(f"  ❌ Error: {e}")
        return 0

def main():
    print("="*60)
    print("BankIQ+ SEC Filings Download (CLEAN TEXT)")
    print("="*60)
    
    bucket_name = get_bucket_name()
    print(f"S3 Bucket: {bucket_name}")
    
    s3 = get_s3_client()
    region = get_region()
    try:
        s3.head_bucket(Bucket=bucket_name)
        print("✓ S3 bucket verified\n")
    except:
        print(f"⚠️  Bucket doesn't exist, creating: {bucket_name}")
        try:
            if region == 'us-east-1':
                s3.create_bucket(Bucket=bucket_name)
            else:
                s3.create_bucket(
                    Bucket=bucket_name,
                    CreateBucketConfiguration={'LocationConstraint': region}
                )
            print("✓ S3 bucket created\n")
        except Exception as e:
            print(f"✗ Error creating bucket: {e}")
            sys.exit(1)
    
    # Parallel download with 5 workers (balanced speed + SEC rate limits)
    total = 0
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {executor.submit(download_bank_filings, bank_name, cik, bucket_name): bank_name 
                   for bank_name, cik in BANKS.items()}
        
        for future in as_completed(futures):
            bank_name = futures[future]
            try:
                count = future.result()
                total += count
            except Exception as e:
                print(f"\n❌ {bank_name} failed: {e}")
    
    print(f"\n{'='*60}")
    print(f"COMPLETE: {total} filings downloaded")
    print(f"{'='*60}")
    print(f"\nAll files are clean text, optimized for Bedrock KB")
    print(f"Next: Re-run ingestion job")

if __name__ == "__main__":
    main()
