#!/usr/bin/env python3
"""
Download SEC filings for a single bank
Usage: python3 download-single-bank.py <BANK-FOLDER-NAME> <CIK> <S3-BUCKET>
"""

import sys
import os
import time
import requests
import boto3
import re
from bs4 import BeautifulSoup

HEADERS = {
    "User-Agent": "BankIQ+ bankiq@example.com",
    "Accept-Encoding": "gzip, deflate"
}

MAX_FILE_SIZE = 45 * 1024 * 1024  # 45MB

def clean_text(text):
    """Clean and normalize text"""
    text = re.sub(r'\n\s*\n\s*\n+', '\n\n', text)
    text = '\n'.join(line for line in text.split('\n') if line.strip())
    return text.strip()

def extract_clean_text_from_html(html_content):
    """Extract clean text from HTML filing"""
    try:
        soup = BeautifulSoup(html_content, 'lxml')
        
        for tag in soup(['script', 'style', 'meta', 'link', 'noscript']):
            tag.decompose()
        
        text = soup.get_text(separator='\n', strip=True)
        return clean_text(text)
    except Exception as e:
        print(f"      Error parsing HTML: {e}")
        return None

def download_filing(bank_name, cik, form_type, date, accession, s3_bucket):
    """Download a single filing"""
    try:
        cik_no_leading = cik.lstrip('0')
        accession_no_dash = accession.replace('-', '')
        
        txt_url = f"https://www.sec.gov/Archives/edgar/data/{cik_no_leading}/{accession_no_dash}/{accession}.txt"
        response = requests.get(txt_url, headers=HEADERS, timeout=30)
        
        if response.status_code != 200:
            print(f"      Failed: HTTP {response.status_code}")
            return False
        
        content = response.text
        
        # Extract main document from SGML
        if '<DOCUMENT>' in content:
            start = content.find('<DOCUMENT>')
            end = content.find('</DOCUMENT>', start)
            
            if start != -1 and end != -1:
                doc_section = content[start:end]
                text_start = doc_section.find('<TEXT>')
                text_end = doc_section.find('</TEXT>')
                
                if text_start != -1 and text_end != -1:
                    doc_content = doc_section[text_start + 6:text_end]
                    
                    if '<html' in doc_content.lower():
                        clean_content = extract_clean_text_from_html(doc_content)
                        if clean_content and len(clean_content) > 1000:
                            content = clean_content
                        else:
                            print(f"      Warning: Extracted text too short")
                            return False
                    else:
                        content = clean_text(doc_content)
        
        # Add metadata header
        header = f"""SEC {form_type} Filing
Bank: {bank_name}
Filing Date: {date}
CIK: {cik}
Accession: {accession}

{'='*80}

"""
        final_content = header + content
        
        # Check size
        if len(final_content.encode('utf-8')) > MAX_FILE_SIZE:
            print(f"      Warning: File too large, truncating...")
            final_content = final_content[:MAX_FILE_SIZE]
        
        # Upload to S3
        year = date[:4]
        quarter = f"-Q{(int(date[5:7]) - 1) // 3 + 1}" if form_type == '10-Q' else ''
        s3_key = f"{bank_name}/{form_type}/{year}{quarter}.txt"
        
        s3 = boto3.client('s3')
        s3.put_object(
            Bucket=s3_bucket,
            Key=s3_key,
            Body=final_content.encode('utf-8'),
            ContentType='text/plain; charset=utf-8'
        )
        
        size_mb = len(final_content.encode('utf-8')) / (1024 * 1024)
        print(f"      ✓ Uploaded {size_mb:.1f}MB to s3://{s3_bucket}/{s3_key}")
        return True
        
    except Exception as e:
        print(f"      Error: {e}")
        return False

def main():
    if len(sys.argv) != 4:
        print("Usage: python3 download-single-bank.py <BANK-FOLDER-NAME> <CIK> <S3-BUCKET>")
        sys.exit(1)
    
    bank_folder = sys.argv[1]
    cik = sys.argv[2].zfill(10)  # Pad to 10 digits
    s3_bucket = sys.argv[3]
    
    print(f"\nDownloading SEC filings for {bank_folder} (CIK: {cik})")
    print(f"Target: s3://{s3_bucket}/{bank_folder}/")
    print("="*60)
    
    # Get filings list
    submissions_url = f"https://data.sec.gov/submissions/CIK{cik}.json"
    response = requests.get(submissions_url, headers=HEADERS, timeout=10)
    
    if response.status_code != 200:
        print(f"Failed to fetch submissions: HTTP {response.status_code}")
        sys.exit(1)
    
    data = response.json()
    filings = data['filings']['recent']
    
    # Filter for 10-K and 10-Q from Oct 2024 - Oct 2025
    target_filings = []
    for i in range(len(filings['form'])):
        form = filings['form'][i]
        date = filings['filingDate'][i]
        accession = filings['accessionNumber'][i]
        
        if (form in ['10-K', '10-Q']) and ('2024-10' <= date <= '2025-10-31'):
            target_filings.append({'form': form, 'date': date, 'accession': accession})
    
    print(f"Found {len(target_filings)} filings\n")
    
    # Download each filing
    success_count = 0
    for i, filing in enumerate(target_filings, 1):
        print(f"[{i}/{len(target_filings)}] Downloading {filing['form']} {filing['date']}...")
        if download_filing(bank_folder, cik, filing['form'], filing['date'], filing['accession'], s3_bucket):
            success_count += 1
        time.sleep(0.2)  # Rate limiting
    
    print(f"\n✓ Successfully uploaded {success_count}/{len(target_filings)} filings")

if __name__ == '__main__':
    main()
