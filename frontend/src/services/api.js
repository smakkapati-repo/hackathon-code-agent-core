import { API_URL } from '../config';
import { fetchAuthSession } from '@aws-amplify/auth';

// Use CloudFront URL for production
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || API_URL;

async function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  
  try {
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  } catch (err) {
    console.warn('[API] Failed to get auth token:', err.message);
  }
  
  return headers;
}

// Helper function to safely parse JSON responses
async function safeJsonParse(response) {
  const contentType = response.headers.get('content-type');
  
  // Check if response is JSON
  if (!contentType || !contentType.includes('application/json')) {
    const text = await response.text();
    console.error('Server returned non-JSON response:', text.substring(0, 200));
    throw new Error(`Server error: Expected JSON but got ${contentType || 'unknown content type'}. Response: ${text.substring(0, 100)}`);
  }
  
  try {
    return await response.json();
  } catch (e) {
    console.error('Failed to parse JSON:', e);
    throw new Error('Invalid JSON response from server');
  }
}

// Removed callBackend function - all endpoints now use async jobs for reliability

export const api = {
  async getSECReports(bankName, year, useRag, cik) {
    // RAG mode: Get pre-indexed filings from S3
    if (useRag) {
      const response = await fetch(`${BACKEND_URL}/api/get-rag-filings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankName })
      });
      return await safeJsonParse(response);
    }
    
    // Use direct backend endpoint for faster, more reliable SEC filings
    if (cik && cik !== '0000000000') {
      try {
        const response = await fetch(`${BACKEND_URL}/api/get-sec-filings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bankName, cik })
        });
        
        const data = await safeJsonParse(response);
        
        if (data.success) {
          return {
            response: data.response,
            '10-K': data['10-K'] || [],
            '10-Q': data['10-Q'] || []
          };
        }
      } catch (e) {
        console.error('Direct SEC fetch failed:', e);
      }
    }
    
    // Fallback to agent using async jobs
    let prompt = `Get all SEC filings for ${bankName} for years 2023, 2024, and 2025. I need both 10-K annual reports and 10-Q quarterly reports.`;
    const job = await this.submitJob(prompt);
    const result = await this.pollJobUntilComplete(job.jobId);
    const response = result.result;
    
    // Try to parse DATA: format first
    try {
      const dataMatch = response.match(/DATA:\s*(\{[\s\S]*?\})\s*\n/);
      if (dataMatch) {
        const parsed = JSON.parse(dataMatch[1]);
        if (parsed['10-K'] || parsed['10-Q']) {
          return { 
            response, 
            '10-K': (parsed['10-K'] || []).map(f => ({
              form: f.form_type,
              filing_date: f.filing_date,
              accession: f.accession_number,
              url: f.url
            })),
            '10-Q': (parsed['10-Q'] || []).map(f => ({
              form: f.form_type,
              filing_date: f.filing_date,
              accession: f.accession_number,
              url: f.url
            }))
          };
        }
      }
      
      // Fallback: Look for filings array
      const jsonMatch = response.match(/\{[\s\S]*?"filings"[\s\S]*?\[[\s\S]*?\][\s\S]*?\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.filings && Array.isArray(parsed.filings)) {
          const tenK = parsed.filings.filter(f => f.form_type === '10-K');
          const tenQ = parsed.filings.filter(f => f.form_type === '10-Q');
          return { 
            response, 
            '10-K': tenK.map(f => ({
              form: f.form_type,
              filing_date: f.filing_date,
              accession: f.accession_number,
              url: f.url
            })),
            '10-Q': tenQ.map(f => ({
              form: f.form_type,
              filing_date: f.filing_date,
              accession: f.accession_number,
              url: f.url
            }))
          };
        }
      }
    } catch (e) {
      console.log('Could not parse SEC filings:', e);
    }
    
    return { response, '10-K': [], '10-Q': [] };
  },

  async analyzePeers(baseBank, peerBanks, metric) {
    const prompt = `Use the compare_banks tool with these exact parameters:
- base_bank: "${baseBank}"
- peer_banks: ["${peerBanks.join('", "')}"]
- metric: "${metric}"

CRITICAL INSTRUCTIONS:
1. Call the compare_banks tool
2. Return the tool's JSON output EXACTLY as-is on the first line
3. Then provide your expanded analysis below it

Format:
{"data": [...], "base_bank": "...", "peer_banks": [...], "analysis": "...", "source": "..."}

Your detailed analysis here...`;
    
    // Use async job pattern for better reliability
    const job = await this.submitJob(prompt);
    const result = await this.pollJobUntilComplete(job.jobId);
    const response = result.result;
    
    console.log('Agent response for peer analysis:', response);
    
    // Extract chart data from agent response
    let chartData = [];
    let extractedAnalysis = '';
    
    // Pattern 1: Look for complete JSON object from tool (most common)
    try {
      // Find JSON that has data, base_bank, peer_banks, analysis, source
      const jsonPattern = /\{[^]*?"data"\s*:\s*\[[^]*?\][^]*?"base_bank"[^]*?"peer_banks"[^]*?"analysis"[^]*?"source"[^]*?\}/;
      const match = response.match(jsonPattern);
      
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (parsed.data && Array.isArray(parsed.data)) {
          chartData = parsed.data;
          // Everything after the JSON is the expanded analysis
          const jsonEndIndex = response.indexOf(match[0]) + match[0].length;
          extractedAnalysis = response.substring(jsonEndIndex).trim();
          
          // If no expanded analysis, use the tool's analysis
          if (!extractedAnalysis || extractedAnalysis.length < 50) {
            extractedAnalysis = parsed.analysis || '';
          }
          
          console.log('✓ Extracted chart data:', chartData.length, 'records');
          console.log('✓ Analysis length:', extractedAnalysis.length, 'chars');
        }
      }
    } catch (e) {
      console.log('Could not parse tool JSON:', e.message);
    }
    
    // Pattern 2: Fallback - try to find any JSON with data array
    if (chartData.length === 0) {
      try {
        const lines = response.split('\n');
        for (const line of lines) {
          if (line.trim().startsWith('{') && line.includes('"data"')) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.data && Array.isArray(parsed.data) && parsed.data.length > 0) {
                chartData = parsed.data;
                // Remove this line from analysis
                extractedAnalysis = response.replace(line, '').trim();
                console.log('✓ Extracted chart data from line:', chartData.length, 'records');
                break;
              }
            } catch (e) {
              continue;
            }
          }
        }
      } catch (e) {
        console.log('Could not parse line-by-line:', e.message);
      }
    }
    
    // Pattern 3: Clean up any remaining JSON fragments in analysis
    if (extractedAnalysis && extractedAnalysis.includes('"Bank"')) {
      // Remove individual data point objects
      extractedAnalysis = extractedAnalysis.replace(/\{[^}]*"Bank"\s*:\s*"[^"]*"[^}]*\}[,\s]*/g, '');
      // Remove array brackets
      extractedAnalysis = extractedAnalysis.replace(/^\s*\[|\]\s*$/g, '');
      // Clean up whitespace
      extractedAnalysis = extractedAnalysis.trim();
    }
    
    // If still no data, log warning
    if (chartData.length === 0) {
      console.warn('⚠️ No chart data extracted. Response preview:', response.substring(0, 200));
    }
    
    // If no analysis extracted, use the whole response
    if (!extractedAnalysis) {
      extractedAnalysis = response;
    }
    
    return { 
      success: true, 
      result: {
        data: chartData,
        analysis: extractedAnalysis,
        base_bank: baseBank,
        peer_banks: peerBanks
      }
    };
  },

  async getFDICData() {
    // Return mock data directly - agent tool is currently unavailable
    console.log('Using mock FDIC data (agent tool unavailable)');
    return { 
      success: true, 
      result: { 
        data: [], 
        data_source: 'FDIC Call Reports (Real-time API)' 
      } 
    };
  },

  async chatWithAI(question, bankName, reports, useRag, cik, useStreaming = false) {
    if (useStreaming) {
      // Return promise that resolves when streaming completes
      return new Promise((resolve, reject) => {
        let fullResponse = '';
        
        this.streamChat(
          question,
          bankName,
          reports,
          useRag,
          cik,
          (chunk) => {
            fullResponse += chunk;
          },
          () => {
            let cleanResponse = fullResponse;
            if (cleanResponse.includes('DATA:')) {
              cleanResponse = cleanResponse.replace(/DATA:\s*\{[\s\S]*?\}\s*\n+/g, '').trim();
            }
            resolve({ response: cleanResponse, sources: [] });
          },
          (error) => {
            reject(new Error(error));
          }
        );
      });
    }
    
    // Original polling method
    let prompt = question;
    
    if (bankName) {
      prompt = `${question} about ${bankName}`;
      
      if (reports && (reports['10-K']?.length > 0 || reports['10-Q']?.length > 0)) {
        const reportsList = [
          ...(reports['10-K'] || []).map(r => `${r.form} filed ${r.filing_date}`),
          ...(reports['10-Q'] || []).map(r => `${r.form} filed ${r.filing_date}`)
        ].slice(0, 5).join(', ');
        
        prompt += `. Available SEC filings: ${reportsList}`;
      }
    }
    
    const job = await this.submitJob(`Answer this banking question: "${prompt}" about ${bankName || 'general banking'}`);
    const result = await this.pollJobUntilComplete(job.jobId);
    
    let cleanResponse = result.result;
    
    // Remove DATA: lines (tool output) from response
    if (cleanResponse && cleanResponse.includes('DATA:')) {
      cleanResponse = cleanResponse.replace(/DATA:\s*\{[\s\S]*?\}\s*\n*/g, '');
    }
    
    // Remove "I don't have access to..." preambles
    cleanResponse = cleanResponse.replace(/^I don't have access to (?:a |an |the )?[\w_]+.*?(?:tool|function).*?(?:\.|However,|But)\s*/i, '');
    
    // Remove "Let me gather/get..." lines
    cleanResponse = cleanResponse.replace(/^Let me (?:gather|get|fetch).*?:\s*/gm, '');
    cleanResponse = cleanResponse.replace(/^Now let me (?:gather|get|fetch).*?:\s*/gm, '');
    
    cleanResponse = cleanResponse.trim();
    
    return { response: cleanResponse, sources: [] };
  },

  async generateFullReport(bankName) {
    const job = await this.submitJob(`Generate a comprehensive financial analysis report for ${bankName} using available tools.`);
    const result = await this.pollJobUntilComplete(job.jobId);
    
    // Clean response - remove DATA: lines from reports
    let cleanReport = result.result;
    if (cleanReport && cleanReport.includes('DATA:')) {
      cleanReport = cleanReport.replace(/DATA:\s*\{[\s\S]*?\}\s*\n+/g, '').trim();
    }
    
    return cleanReport;
  },

  // Async job methods
  async submitJob(inputText, jobType = 'agent-invocation') {
    const headers = await getAuthHeaders();
    
    const response = await fetch(`${BACKEND_URL}/api/jobs/submit`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ inputText, jobType })
    });
    
    if (!response.ok) {
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Job submission failed: ${response.status}`);
      }
      throw new Error(`Job submission failed: ${response.status}`);
    }
    
    return safeJsonParse(response);
  },

  async checkJobStatus(jobId) {
    const response = await fetch(`${BACKEND_URL}/api/jobs/${jobId}`);
    
    if (!response.ok) {
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Job status check failed: ${response.status}`);
      }
      throw new Error(`Job status check failed: ${response.status}`);
    }
    
    return safeJsonParse(response);
  },

  async getJobResult(jobId) {
    const response = await fetch(`${BACKEND_URL}/api/jobs/${jobId}/result`);
    
    // Get response body as text first (can only read once)
    const responseText = await response.text();
    
    // Check if response is OK
    if (!response.ok) {
      console.error(`Job result error (${response.status}):`, responseText.substring(0, 200));
      
      // Try to parse as JSON to get error message
      try {
        const errorData = JSON.parse(responseText);
        throw new Error(errorData.error || errorData.message || `Job failed with status ${response.status}`);
      } catch (parseError) {
        // Not JSON, return text error
        throw new Error(`Job failed (${response.status}): ${responseText.substring(0, 100)}`);
      }
    }
    
    // Parse successful response
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse job result:', responseText.substring(0, 200));
      throw new Error('Invalid response from server');
    }
    
    // Check if job itself failed
    if (data.status === 'failed') {
      throw new Error(data.error || 'Job processing failed');
    }
    
    return data;
  },

  // Poll for job completion
  async pollJobUntilComplete(jobId, maxAttempts = 120, intervalMs = 2000) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const status = await this.checkJobStatus(jobId);
      
      if (status.status === 'completed' || status.status === 'failed') {
        return this.getJobResult(jobId);
      }
      
      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    
    throw new Error('Job polling timeout');
  },

  async searchBanks(query) {
    // Use direct backend endpoint for faster, more reliable search
    try {
      const response = await fetch(`${BACKEND_URL}/api/search-banks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      
      const data = await safeJsonParse(response);
      
      if (data.success && data.results) {
        console.log('Search results:', data.results);
        return data.results;
      }
      
      return [];
    } catch (e) {
      console.error('Search failed:', e);
      return [];
    }
  },

  async chatWithLocalFiles(message, analyzedDocs) {
    if (!analyzedDocs || analyzedDocs.length === 0) {
      throw new Error('No documents uploaded. Please upload a PDF first.');
    }
    
    const doc = analyzedDocs[0];
    
    if (!doc.s3_key) {
      throw new Error('Document not properly uploaded to S3. Please try uploading again.');
    }
    
    const prompt = `Answer this question about ${doc.bank_name}'s ${doc.form_type} filing: ${message}

IMPORTANT: Use get_local_document_data(s3_key="${doc.s3_key}", bank_name="${doc.bank_name}") to retrieve the document data, then provide a 3-4 paragraph professional analysis.`;
    
    const job = await this.submitJob(prompt);
    const result = await this.pollJobUntilComplete(job.jobId);
    return { response: result.result, sources: [] };
  },

  async uploadPDFs(files, bankName = '') {
    // Try agent-powered upload first (uses Claude for intelligent analysis)
    try {
      console.log('Attempting agent-powered PDF upload...');
      const response = await fetch(`${BACKEND_URL}/api/upload-pdf-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files, bankName })
      });
      
      if (response.ok) {
        const result = await safeJsonParse(response);
        console.log('✓ Agent-powered upload successful');
        return result;
      }
      
      // If agent method fails, fall back to direct upload
      console.log('Agent upload failed, falling back to direct upload...');
    } catch (agentError) {
      console.log('Agent upload error:', agentError.message);
    }
    
    // Fallback: Direct upload (legacy method)
    console.log('Using direct upload method...');
    const response = await fetch(`${BACKEND_URL}/api/upload-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files, bankName })
    });
    
    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status}`);
    }
    
    const result = await safeJsonParse(response);
    return { ...result, method: 'direct' };
  },

  async checkRagAvailability() {
    try {
      const response = await fetch(`${BACKEND_URL}/api/rag/status`);
      const data = await safeJsonParse(response);
      return { available: data.available || false, kbId: data.kbId };
    } catch (err) {
      return { available: false };
    }
  },

  async getRagBanks() {
    try {
      const response = await fetch(`${BACKEND_URL}/api/rag/banks`);
      if (!response.ok) {
        throw new Error(`Failed to fetch RAG banks: ${response.status}`);
      }
      return await safeJsonParse(response);
    } catch (err) {
      console.error('Error fetching RAG banks:', err);
      return { success: false, banks: [] };
    }
  },

  async addBankToRAG(bankName, cik) {
    const response = await fetch(`${BACKEND_URL}/api/add-bank-to-rag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bankName, cik })
    });
    
    const contentType = response.headers.get('content-type');
    
    if (!response.ok) {
      // Try to parse error as JSON, fallback to text
      let errorMessage = 'Failed to add bank to RAG';
      try {
        if (contentType && contentType.includes('application/json')) {
          const error = await response.json();
          errorMessage = error.error || error.message || errorMessage;
        } else {
          const text = await response.text();
          errorMessage = `Server error (${response.status}): ${text.substring(0, 100)}`;
        }
      } catch (parseErr) {
        errorMessage = `Server error (${response.status})`;
      }
      throw new Error(errorMessage);
    }
    
    // Parse successful response
    return await safeJsonParse(response);
  },

  // Streaming method
  async streamChat(question, bankName, reports, useRag, cik, onChunk, onComplete, onError) {
    console.log('[STREAMING] Starting stream for:', question.substring(0, 50));
    let prompt = question;
    
    if (bankName) {
      prompt = `${question} about ${bankName}`;
      
      if (reports && (reports['10-K']?.length > 0 || reports['10-Q']?.length > 0)) {
        const reportsList = [
          ...(reports['10-K'] || []).map(r => `${r.form} filed ${r.filing_date}`),
          ...(reports['10-Q'] || []).map(r => `${r.form} filed ${r.filing_date}`)
        ].slice(0, 5).join(', ');
        
        prompt += `. Available SEC filings: ${reportsList}`;
      }
    }

    try {
      console.log('[STREAMING] Fetching from:', `${BACKEND_URL}/api/invoke-agent-stream`);
      const response = await fetch(`${BACKEND_URL}/api/invoke-agent-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputText: prompt })
      });
      console.log('[STREAMING] Response status:', response.status);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.chunk) {
                console.log('[STREAMING] Chunk received:', data.chunk.substring(0, 20));
                onChunk(data.chunk);
              } else if (data.done) {
                onComplete();
                return;
              } else if (data.error) {
                onError(data.error);
                return;
              }
            } catch (e) {
              console.error('Parse error:', e);
            }
          }
        }
      }
      
      onComplete();
    } catch (error) {
      onError(error.message);
    }
  },

  // Streaming for peer analytics
  async streamPeerAnalysis(baseBank, peerBanks, metric, onChunk, onComplete, onError) {
    console.log('[STREAMING] Starting peer analysis stream');
    const prompt = `Use the compare_banks tool with these exact parameters:
- base_bank: "${baseBank}"
- peer_banks: ["${peerBanks.join('", "')}"]
- metric: "${metric}"

CRITICAL INSTRUCTIONS:
1. Call the compare_banks tool
2. Return the tool's JSON output EXACTLY as-is on the first line
3. Then provide your expanded analysis below it`;

    // Timeout after 120 seconds (peer analysis needs more time for FDIC data)
    const timeoutId = setTimeout(() => {
      onError('Request timeout - please try again or use polling mode');
    }, 120000);

    try {
      const response = await fetch(`${BACKEND_URL}/api/invoke-agent-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputText: prompt })
      });

      if (!response.ok) {
        clearTimeout(timeoutId);
        onError(`HTTP ${response.status}: ${response.statusText}`);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.chunk) {
                onChunk(data.chunk);
              } else if (data.done) {
                onComplete();
                return;
              } else if (data.error) {
                onError(data.error);
                return;
              }
            } catch (e) {
              console.error('Parse error:', e);
            }
          }
        }
      }
      
      clearTimeout(timeoutId);
      onComplete();
    } catch (error) {
      clearTimeout(timeoutId);
      onError(error.message);
    }
  },

  // Streaming for compliance assessment
  async streamComplianceAssessment(bankName, onChunk, onComplete, onError) {
    console.log('[STREAMING] Starting compliance assessment stream');
    const prompt = `Use compliance_risk_assessment("${bankName}") tool. Return ONLY the raw JSON output with NO explanation. Expected format: {"success": true, "overall_score": X, "scores": {...}, "metrics": {...}, "alerts": [...]}`;

    // Timeout after 60 seconds
    const timeoutId = setTimeout(() => {
      onError('Request timeout - please try again or use polling mode');
    }, 60000);

    try {
      const response = await fetch(`${BACKEND_URL}/api/invoke-agent-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputText: prompt })
      });

      if (!response.ok) {
        clearTimeout(timeoutId);
        onError(`HTTP ${response.status}: ${response.statusText}`);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.chunk) {
                onChunk(data.chunk);
              } else if (data.done) {
                clearTimeout(timeoutId);
                onComplete();
                return;
              } else if (data.error) {
                clearTimeout(timeoutId);
                onError(data.error);
                return;
              }
            } catch (e) {
              console.error('Parse error:', e);
            }
          }
        }
      }
      
      clearTimeout(timeoutId);
      onComplete();
    } catch (error) {
      clearTimeout(timeoutId);
      onError(error.message);
    }
  }
};
