import React, { useState, useEffect, useRef } from 'react';
import { usePersistedState } from '../hooks/usePersistedState';
import {
  Box, Typography, Card, CardContent, Grid,
  FormControl, InputLabel, Select, MenuItem, Button,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  CircularProgress, Alert, Divider, Switch, FormControlLabel
} from '@mui/material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { api } from '../services/api';
import ReactMarkdown from 'react-markdown';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

function PeerAnalytics() {
  const [selectedBank, setSelectedBank] = usePersistedState('peer_selectedBank', '');
  const [selectedPeers, setSelectedPeers] = usePersistedState('peer_selectedPeers', []);
  const [selectedMetric, setSelectedMetric] = usePersistedState('peer_selectedMetric', '');
  const [loading, setLoading] = useState(false);
  const [fdicData, setFdicData] = usePersistedState('peer_fdicData', null);
  const [chartData, setChartData] = usePersistedState('peer_chartData', []);
  const [analysis, setAnalysis] = usePersistedState('peer_analysis', '');
  const [error, setError] = useState('');
  const [dataMode, setDataMode] = usePersistedState('peer_dataMode', 'live');
  const [rawApiData, setRawApiData] = usePersistedState('peer_rawApiData', []);
  const [uploadedData, setUploadedData] = usePersistedState('peer_uploadedData', null);
  const [uploadedBanks, setUploadedBanks] = usePersistedState('peer_uploadedBanks', []);
  const [uploadedMetrics, setUploadedMetrics] = usePersistedState('peer_uploadedMetrics', []);
  const [hasQuarterly, setHasQuarterly] = usePersistedState('peer_hasQuarterly', false);
  const [dataLoaded, setDataLoaded] = usePersistedState('peer_dataLoaded', false);
  const [hasMonthly, setHasMonthly] = useState(false);
  const [useStreaming, setUseStreaming] = useState(true); // Streaming enabled
  const abortControllerRef = useRef(null); // For canceling requests
  const isAbortedRef = useRef(false); // Track if request was aborted

  const [bankSearchQuery, setBankSearchQuery] = useState('');
  const [bankSearchResults, setBankSearchResults] = useState([]);
  const [peerSearchQuery, setPeerSearchQuery] = useState('');
  const [peerSearchResults, setPeerSearchResults] = useState([]);

  const searchBanks = async (query, setPeerResults = false) => {
    if (query.length < 2) {
      setPeerResults ? setPeerSearchResults([]) : setBankSearchResults([]);
      return;
    }
    const results = await api.searchBanks(query);
    setPeerResults ? setPeerSearchResults(results) : setBankSearchResults(results);
  };

  const quarterlyMetrics = [
    '[Q] Return on Assets (ROA)',
    '[Q] Return on Equity (ROE)',
    '[Q] Net Interest Margin (NIM)',
    '[Q] Efficiency Ratio',
    '[Q] Loan-to-Deposit Ratio',
    '[Q] Equity Ratio',
    '[Q] CRE Concentration Ratio'
  ];

  const monthlyMetrics = [
    '[M] Loan Growth Rate (%)', '[M] Deposit Growth (%)',
    '[M] Efficiency Ratio (%)', '[M] Charge-off Rate (%)'
  ];

  const [analysisType, setAnalysisType] = useState('Quarterly Metrics');
  const metrics = analysisType === 'Quarterly Metrics' ? quarterlyMetrics : monthlyMetrics;

  useEffect(() => {
    if (dataMode === 'live' && !dataLoaded) {
      loadFDICData();
    }
  }, [dataMode, dataLoaded]);

  const [dataSource, setDataSource] = usePersistedState('peer_dataSource', '');

  const loadFDICData = async () => {
    try {
      setLoading(true);
      setDataLoaded(false);
      setError('🔄 Loading banking data... This may take 10-15 seconds for live FDIC data.');
      const response = await api.getFDICData();
      console.log('API Response:', response);
      if (response.success) {
        setFdicData(response.result);
        setDataSource(response.result.data_source || 'FDIC Call Reports');
      } else {
        throw new Error('API returned success: false');
      }
      setError(''); // Clear loading message
      setDataLoaded(true);
    } catch (err) {
      console.error('FDIC data loading failed:', err);
      setError(`❌ Failed to load banking data: ${err.message || 'Network error'}`);
      setDataSource('Error');
    } finally {
      setLoading(false);
    }
  };

  const handleAnalysis = async () => {
    const missing = [];
    if (!selectedBank) missing.push('base bank');
    if (selectedPeers.length === 0) missing.push('at least one peer bank');
    if (!selectedMetric) missing.push('metric');
    
    if (missing.length > 0) {
      setError(`Please select: ${missing.join(', ')}`);
      return;
    }

    // Reset abort flag FIRST
    isAbortedRef.current = false;

    // Prevent multiple simultaneous requests
    if (loading) {
      console.log('Analysis already in progress');
      return;
    }

    try {
      setLoading(true);
      setError('');

      // Map React bank names to API bank names
      const bankNameMap = {
        'JPMorgan Chase': 'JPMORGAN CHASE BANK',
        'Bank of America': 'BANK OF AMERICA',
        'Wells Fargo': 'WELLS FARGO BANK',
        'Citigroup': 'CITIBANK',
        'U.S. Bancorp': 'U.S. BANK',
        'PNC Financial': 'PNC BANK',
        'Goldman Sachs': 'GOLDMAN SACHS BANK',
        'Truist Financial': 'TRUIST BANK',
        'Capital One': 'CAPITAL ONE',
        'Regions Financial': 'REGIONS FINANCIAL CORP',
        'Fifth Third Bancorp': 'FIFTH THIRD BANCORP'
      };

      // Reverse mapping for chart display
      const reverseMap = {
        'JPMORGAN CHASE BANK': 'JPMorgan',
        'BANK OF AMERICA': 'BofA',
        'WELLS FARGO BANK': 'Wells',
        'CITIBANK': 'Citi',
        'U.S. BANK': 'USB',
        'PNC BANK': 'PNC',
        'GOLDMAN SACHS BANK': 'Goldman',
        'TRUIST BANK': 'Truist',
        'CAPITAL ONE': 'CapOne',
        'REGIONS FINANCIAL CORP': 'Regions',
        'FIFTH THIRD BANCORP': 'Fifth'
      };

      const apiBaseBank = bankNameMap[selectedBank] || selectedBank;
      const apiPeerBanks = selectedPeers.map(bank => bankNameMap[bank] || bank);

      let result;
      if (dataMode === 'local' && uploadedData) {
        // Convert wide format to long format for analysis
        const longFormatData = [];
        const metricName = selectedMetric.replace('[Q] ', '').replace('[M] ', '');

        uploadedData.forEach(row => {
          if ([apiBaseBank, ...apiPeerBanks].includes(row.Bank) && row.Metric === metricName) {
            Object.keys(row).forEach(key => {
              if (key !== 'Bank' && key !== 'Metric' && row[key]) {
                longFormatData.push({
                  Bank: row.Bank,
                  Quarter: key,
                  Metric: metricName,
                  Value: parseFloat(row[key]) || 0
                });
              }
            });
          }
        });

        // Generate AI analysis for local data
        const prompt = `Analyze peer banking performance for ${selectedMetric}:\n\nBase Bank: ${apiBaseBank}\nPeer Banks: ${apiPeerBanks.join(', ')}\n\nData shows ${longFormatData.length} quarterly data points. Provide a concise 2-paragraph analysis comparing ${apiBaseBank}'s performance against peers on ${selectedMetric}, highlighting key trends and competitive positioning.`;

        try {
          let rawResponse = '';     // For data extraction
          let cleanResponse = '';   // For display only
          
          setError('🔄 Analyzing CSV data...');
          abortControllerRef.current = new AbortController();
          await api.streamChat(
            prompt,
            null,
            null,
            false,
            null,
            (chunk) => {
              rawResponse += chunk;  // Keep EVERYTHING for data extraction
              
              // Build clean display independently - same as live mode
              const currentText = rawResponse;
              const lines = currentText.split('\n');
              
              // Find where analysis starts (after JSON line)
              let analysisStartIndex = 0;
              for (let i = 0; i < lines.length; i++) {
                const trimmed = lines[i].trim();
                // Skip first line if it's JSON
                if (i === 0 && trimmed.startsWith('{') && trimmed.includes('"data"')) {
                  analysisStartIndex = 1;
                  break;
                }
              }
              
              // Get analysis lines only (skip JSON and preambles)
              const analysisLines = lines.slice(analysisStartIndex).filter(line => {
                const trimmed = line.trim();
                // Skip empty lines at start
                if (!trimmed) return false;
                // Skip "I'll" preambles
                if (trimmed.startsWith('I\'ll')) return false;
                return true;
              });
              
              cleanResponse = analysisLines.join('\n').trim();
              
              if (cleanResponse.length > 50) {
                setAnalysis(cleanResponse);
              }
            },
            () => {
              console.log('CSV analysis streaming complete');
              setError('');
            },
            (error) => {
              console.log('CSV streaming failed:', error);
              throw new Error(error);
            }
          );

          result = { data: longFormatData, analysis: cleanResponse };
        } catch (err) {
          console.error('CSV analysis error:', err);
          result = { data: longFormatData, analysis: `**${selectedMetric} Analysis**\n\nShowing data visualization for uploaded CSV data comparing ${apiBaseBank} against ${apiPeerBanks.join(', ')}.` };
        }
      } else {
        // Live mode - streaming only
        let rawResponse = '';     // For data extraction only
        let cleanResponse = '';   // For display only
        abortControllerRef.current = new AbortController();
        
        await api.streamPeerAnalysis(
          apiBaseBank,
          apiPeerBanks,
          selectedMetric,
          (chunk) => {
            rawResponse += chunk;  // Keep EVERYTHING for data extraction
            
            // Build clean display independently - only show analysis text
            // Don't filter rawResponse, build cleanResponse from scratch
            const currentText = rawResponse;
            const lines = currentText.split('\n');
            
            // Find where analysis starts (after JSON line)
            let analysisStartIndex = 0;
            for (let i = 0; i < lines.length; i++) {
              const trimmed = lines[i].trim();
              // Skip first line if it's JSON
              if (i === 0 && trimmed.startsWith('{') && trimmed.includes('"data"')) {
                analysisStartIndex = 1;
                break;
              }
            }
            
            // Get analysis lines only (skip JSON and preambles)
            const analysisLines = lines.slice(analysisStartIndex).filter(line => {
              const trimmed = line.trim();
              // Skip empty lines at start
              if (!trimmed) return false;
              // Skip "I'll" preambles
              if (trimmed.startsWith('I\'ll')) return false;
              return true;
            });
            
            cleanResponse = analysisLines.join('\n').trim();
            
            if (cleanResponse.length > 50) {
              setAnalysis(cleanResponse);
            }
          },
          () => {
            if (isAbortedRef.current) return;
            console.log('Streaming complete');
            setError('');
          },
          (error) => {
            console.error('Streaming error:', error);
          },
          abortControllerRef.current?.signal
        );
        
        // Extract data from rawResponse (with HTML decoding)
        let chartData = [];
        const textarea = document.createElement('textarea');
        textarea.innerHTML = rawResponse;
        const decoded = textarea.value;
        
        console.log('Raw response length:', rawResponse.length);
        console.log('First 1000 chars:', decoded.substring(0, 1000));
        
        // Pattern 1: Look for JSON on first line (agent instruction format)
        const lines = decoded.split('\n');
        const firstLine = lines[0]?.trim();
        if (firstLine && firstLine.startsWith('{') && firstLine.includes('"data"')) {
          try {
            const parsed = JSON.parse(firstLine);
            if (parsed.data && Array.isArray(parsed.data) && parsed.data.length > 0) {
              console.log('✓ Found data on first line:', parsed.data.length, 'records');
              chartData = parsed.data;
            }
          } catch (e) {
            console.log('First line parse error:', e.message);
          }
        }
        
        // Pattern 2: Look for JSON anywhere in first 5 lines
        if (chartData.length === 0) {
          for (let i = 0; i < Math.min(5, lines.length); i++) {
            const line = lines[i]?.trim();
            if (line && line.startsWith('{') && line.includes('"data"')) {
              try {
                const parsed = JSON.parse(line);
                if (parsed.data && Array.isArray(parsed.data) && parsed.data.length > 0) {
                  console.log(`✓ Found data on line ${i+1}:`, parsed.data.length, 'records');
                  chartData = parsed.data;
                  break;
                }
              } catch (e) {
                continue;
              }
            }
          }
        }
        
        // Pattern 3: Try regex as last resort
        if (chartData.length === 0) {
          const jsonMatch = decoded.match(/\{"data"\s*:\s*\[[^\]]+\][^}]*\}/);
          if (jsonMatch) {
            try {
              const parsed = JSON.parse(jsonMatch[0]);
              if (parsed.data && Array.isArray(parsed.data) && parsed.data.length > 0) {
                console.log('✓ Found data via regex:', parsed.data.length, 'records');
                chartData = parsed.data;
              }
            } catch (e) {
              console.log('Regex parse error:', e.message);
            }
          }
        }
        
        result = { analysis: cleanResponse, data: chartData };
      }

      // Check if aborted before processing results
      if (isAbortedRef.current) {
        console.log('Request was aborted, stopping processing');
        return;
      }
      
      // Parse analysis text and extract data from agent response
      let analysisText = result.analysis || result || '';
      let chartDataFromResponse = result.data || [];

      // Try to extract JSON data from agent response
      if (chartDataFromResponse.length === 0 && typeof analysisText === 'string') {
        try {
          // Try to find JSON object in the response (first line usually)
          const lines = analysisText.split('\n');
          for (const line of lines) {
            if (line.trim().startsWith('{')) {
              try {
                const parsed = JSON.parse(line.trim());
                if (parsed.data && Array.isArray(parsed.data)) {
                  chartDataFromResponse = parsed.data;
                  // Remove JSON line and DATA: lines from analysis
                  analysisText = lines.filter(l => {
                    const trimmed = l.trim();
                    return l !== line && !trimmed.startsWith('DATA:');
                  }).join('\n').trim();
                  break;
                }
              } catch (e) {
                // Not valid JSON, continue
              }
            }
          }
        } catch (e) {
          console.log('Could not parse agent JSON response');
        }
      }

      // If still no data, show error with helpful message
      if (chartDataFromResponse.length === 0) {
        const errorMsg = useStreaming 
          ? 'No data received. Try toggling streaming off and using polling mode.'
          : 'No data received from agent. Please try again or check if the banks exist in FDIC database.';
        setError(errorMsg);
        setLoading(false);
        return;
      }

      // Validate data structure
      const hasValidData = chartDataFromResponse.every(item => 
        item.Bank && item.Quarter && item.Metric && typeof item.Value === 'number'
      );
      
      if (!hasValidData) {
        setError('Received invalid data format. Please try again.');
        setLoading(false);
        return;
      }

      setAnalysis(analysisText);
      setRawApiData(chartDataFromResponse);
      setChartData(processChartData(chartDataFromResponse));
    } catch (err) {
      console.error('Analysis error:', err);
      setError(`❌ Analysis failed: ${err.message || 'Unknown error'}`);
      setAnalysis('');
      setChartData([]);
    } finally {
      setLoading(false);
    }
  };



  const processChartData = (data) => {
    if (!data || data.length === 0) return [];

    const quarters = [...new Set(data.map(d => d.Quarter))].sort();
    return quarters.map(quarter => {
      const quarterData = { quarter };
      data.filter(d => d.Quarter === quarter).forEach(d => {
        quarterData[d.Bank] = d.Value;
      });
      return quarterData;
    });
  };

  const defaultBanks = [
    'JPMorgan Chase', 'Bank of America', 'Wells Fargo', 'Citigroup',
    'U.S. Bancorp', 'PNC Financial', 'Goldman Sachs', 'Truist Financial',
    'Capital One', 'Regions Financial', 'Fifth Third Bancorp'
  ];

  const availableBanks = dataMode === 'local' && uploadedBanks.length > 0 ? uploadedBanks : defaultBanks;
  const availablePeers = availableBanks.filter(bank => bank !== selectedBank);
  const availableMetrics = dataMode === 'local' && uploadedMetrics.length > 0 ?
    (analysisType === 'Quarterly Metrics' ? uploadedMetrics.map(m => `[Q] ${m}`) : uploadedMetrics.map(m => `[M] ${m}`)) :
    metrics;

  // Removed sample/mock data - all data must come from real sources

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 600 }}>
            Peer Bank Analytics
          </Typography>
          {dataSource && (
            <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5, display: 'block' }}>
              Data Source: {dataSource.includes('FDIC Call Reports') ? '🟢 FDIC Call Reports (2023-2025)' : dataSource || 'No Data'}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, border: '1px solid #ddd', borderRadius: 2, backgroundColor: '#f5f5f5' }}>
          <Button
            variant={dataMode === 'live' ? 'contained' : 'text'}
            size="small"
            onClick={() => {
              setDataMode('live');
              setSelectedBank('');
              setSelectedPeers([]);
              setSelectedMetric('');
              setAnalysis('');
              setChartData([]);
              setRawApiData([]);
              setUploadedData(null);
              setUploadedBanks([]);
              setUploadedMetrics([]);
              setError('');
            }}
            sx={{ minWidth: 80, fontSize: '0.8rem' }}
          >
            Live Data
          </Button>
          <Button
            variant={dataMode === 'local' ? 'contained' : 'text'}
            size="small"
            onClick={() => {
              setDataMode('local');
              setSelectedBank('');
              setSelectedPeers([]);
              setSelectedMetric('');
              setAnalysis('');
              setChartData([]);
              setRawApiData([]);
              setError('');
              setLoading(false);
              setDataSource('');
            }}
            sx={{ minWidth: 80, fontSize: '0.8rem' }}
          >
            Upload CSV
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Local Upload Section */}
      {dataMode === 'local' && (
        <Card sx={{ mb: 4, backgroundColor: '#f8f9fa' }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>📊 Upload Your Metrics Data</Typography>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2 }}>
              <Button
                variant="outlined"
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = '/quarterly_template.csv';
                  link.download = 'quarterly_template.csv';
                  link.click();
                }}
              >
                📥 Quarterly Template
              </Button>

              <input
                type="file"
                accept=".csv"
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                      const csv = event.target.result;
                      const lines = csv.split('\n');
                      const headers = lines[0].split(',');
                      const data = lines.slice(1).filter(line => line.trim()).map(line => {
                        const values = line.split(',');
                        const obj = {};
                        headers.forEach((header, i) => {
                          obj[header.trim()] = values[i]?.trim();
                        });
                        return obj;
                      });
                      setUploadedData(data);

                      // Store CSV data in backend
                      fetch(`${BACKEND_URL}/api/store-csv-data`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ data: data, filename: file.name })
                      }).catch(err => console.log('CSV storage failed:', err));

                      // Auto-populate fields from uploaded data
                      if (data.length > 0) {
                        // Get unique banks
                        const uniqueBanks = [...new Set(data.map(row => row.Bank))];
                        setUploadedBanks(uniqueBanks);

                        // Detect quarterly vs monthly data from column headers
                        const columns = Object.keys(data[0]);
                        const quarterly = columns.some(col => col && col.includes('Q'));
                        const monthly = columns.some(col => col && (col.includes('Jan') || col.includes('Feb') || col.includes('Mar')));
                        setHasQuarterly(quarterly);
                        setHasMonthly(monthly);

                        // Set analysis type
                        if (quarterly && !monthly) {
                          setAnalysisType('Quarterly Metrics');
                        } else if (monthly && !quarterly) {
                          setAnalysisType('Monthly View');
                        } else {
                          setAnalysisType('Quarterly Metrics'); // Default
                        }

                        // Get available metrics
                        const availableMetrics = [...new Set(data.map(row => row.Metric))];
                        setUploadedMetrics(availableMetrics);
                        if (availableMetrics.length > 0) {
                          const prefix = quarterly ? '[Q] ' : '[M] ';
                          setSelectedMetric(prefix + availableMetrics[0]);
                        }
                      }
                    };
                    reader.readAsText(file);
                  }
                }}
                style={{ display: 'none' }}
                id="csv-upload"
              />
              <label htmlFor="csv-upload">
                <Button variant="contained" component="span">
                  📁 Choose CSV File
                </Button>
              </label>
              {uploadedData && (
                <Typography variant="body2" color="success.main">
                  ✅ {uploadedData.length} records loaded
                </Typography>
              )}
            </Box>
            <Typography variant="body2" color="text.secondary">
              Download templates above: Quarterly (Q1-Q4 columns) or Monthly (Jan-Dec columns). Fill with your data and upload.
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* Controls */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={3}>
          <FormControl fullWidth>
            {dataMode === 'live' ? (
              <>
                <InputLabel shrink>Base Bank</InputLabel>
                <input
                  type="text"
                  value={selectedBank || bankSearchQuery}
                  onChange={(e) => {
                    const val = e.target.value;
                    setBankSearchQuery(val);
                    setSelectedBank('');
                    searchBanks(val);
                  }}
                  placeholder="Search bank name..."
                  style={{
                    width: '100%',
                    padding: '16px 14px',
                    fontSize: '16px',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    marginTop: '16px'
                  }}
                />
                {bankSearchResults.length > 0 && (
                  <Paper sx={{ position: 'absolute', zIndex: 1000, width: '100%', maxHeight: 200, overflow: 'auto', mt: 8 }}>
                    {bankSearchResults.map((bank) => (
                      <MenuItem
                        key={bank.cik}
                        onClick={() => {
                          setSelectedBank(bank.name);
                          setBankSearchQuery('');
                          setBankSearchResults([]);
                        }}
                      >
                        {bank.name} ({bank.ticker || 'N/A'})
                      </MenuItem>
                    ))}
                  </Paper>
                )}
              </>
            ) : (
              <>
                <InputLabel>Base Bank</InputLabel>
                <Select
                  value={selectedBank}
                  label="Base Bank"
                  onChange={(e) => setSelectedBank(e.target.value)}
                >
                  {availableBanks.map((bank) => (
                    <MenuItem key={bank} value={bank}>{bank}</MenuItem>
                  ))}
                </Select>
              </>
            )}
          </FormControl>
        </Grid>
        <Grid item xs={12} md={3}>
          <FormControl fullWidth>
            {dataMode === 'live' ? (
              <>
                <InputLabel shrink>Peer Banks (Max 3)</InputLabel>
                <input
                  type="text"
                  value={peerSearchQuery}
                  onChange={(e) => {
                    setPeerSearchQuery(e.target.value);
                    searchBanks(e.target.value, true);
                  }}
                  onFocus={() => peerSearchQuery.length >= 2 && searchBanks(peerSearchQuery, true)}
                  placeholder="Search peer banks..."
                  style={{
                    width: '100%',
                    padding: '16px 14px',
                    fontSize: '16px',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    marginTop: '16px'
                  }}
                />
                {peerSearchResults.length > 0 && (
                  <Paper sx={{ position: 'absolute', zIndex: 1000, width: '100%', maxHeight: 200, overflow: 'auto', mt: 8 }}>
                    {peerSearchResults.filter(bank => bank.name !== selectedBank).map((bank) => (
                      <MenuItem
                        key={bank.cik}
                        onClick={() => {
                          if (selectedPeers.length < 3 && !selectedPeers.includes(bank.name)) {
                            setSelectedPeers([...selectedPeers, bank.name]);
                          }
                          setPeerSearchQuery('');
                          setPeerSearchResults([]);
                        }}
                      >
                        {bank.name} ({bank.ticker || 'N/A'})
                      </MenuItem>
                    ))}
                  </Paper>
                )}
                {selectedPeers.length > 0 && (
                  <Box sx={{ mt: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {selectedPeers.map((peer) => (
                      <Box
                        key={peer}
                        sx={{
                          backgroundColor: '#A020F0',
                          color: 'white',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.5
                        }}
                      >
                        {peer}
                        <span
                          onClick={() => setSelectedPeers(selectedPeers.filter(p => p !== peer))}
                          style={{ cursor: 'pointer', fontWeight: 'bold' }}
                        >
                          ×
                        </span>
                      </Box>
                    ))}
                  </Box>
                )}
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                  Type to search any US bank
                </Typography>
              </>
            ) : (
              <>
                <InputLabel>Peer Banks (Max 3)</InputLabel>
                <Select
                  multiple
                  value={selectedPeers}
                  label="Peer Banks (Max 3)"
                  onChange={(e) => setSelectedPeers(e.target.value.slice(0, 3))}
                >
                  {availableBanks.filter(bank => bank !== selectedBank).map((bank) => (
                    <MenuItem key={bank} value={bank}>{bank}</MenuItem>
                  ))}
                </Select>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                  Select up to 3 banks for comparison
                </Typography>
              </>
            )}
          </FormControl>
        </Grid>
        <Grid item xs={12} md={2}>
          <FormControl fullWidth>
            <InputLabel>Analysis Type</InputLabel>
            <Select
              value={analysisType}
              label="Analysis Type"
              onChange={(e) => {
                setAnalysisType(e.target.value);
                setSelectedMetric(''); // Reset metric when type changes
              }}
            >
              <MenuItem value="Quarterly Metrics">Quarterly</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} md={2}>
          <FormControl fullWidth>
            <InputLabel>Metric</InputLabel>
            <Select
              value={selectedMetric}
              label="Metric"
              onChange={(e) => {
                setSelectedMetric(e.target.value);
                // Reset all results when metric changes
                setAnalysis('');
                setChartData([]);
                setRawApiData([]);
                setError('');
              }}
            >
              {availableMetrics.map((metric) => (
                <MenuItem key={metric} value={metric}>{metric.replace('[Q] ', '').replace('[M] ', '')}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} md={1}>
          <Button
            variant="contained"
            fullWidth
            sx={{ height: 56 }}
            disabled={loading}
            onClick={handleAnalysis}
          >
            {loading ? <CircularProgress size={24} /> : 'Analyze'}
          </Button>
        </Grid>

        <Grid item xs={12} md={1}>
          <Button
            variant="outlined"
            fullWidth
            sx={{ height: 56 }}
            onClick={() => window.location.reload()}
          >
            Reset
          </Button>
        </Grid>
      </Grid>

      {/* AI Analysis - Show first for better UX */}
      {analysis && (
        <Card sx={{ mb: 4 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              🤖 AI Analysis - {selectedMetric.replace('[Q] ', '').replace('[M] ', '')}
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <Box sx={{
              '& h1, & h2, & h3': { mt: 2, mb: 1, fontWeight: 600 },
              '& h2': { fontSize: '1.5rem', color: '#A020F0' },
              '& h3': { fontSize: '1.25rem', color: '#8B1A9B' },
              '& p': { mb: 1.5, lineHeight: 1.7 },
              '& ul, & ol': { pl: 3, mb: 1.5 },
              '& li': { mb: 0.5 },
              '& table': { width: '100%', borderCollapse: 'collapse', mb: 2 },
              '& th, & td': { border: '1px solid #ddd', padding: '8px 12px', textAlign: 'left' },
              '& th': { backgroundColor: '#f5f5f5', fontWeight: 600 },
              '& strong': { fontWeight: 600, color: '#A020F0' },
              '& code': { backgroundColor: '#f5f5f5', padding: '2px 6px', borderRadius: '4px', fontSize: '0.9em' }
            }}>
              <ReactMarkdown>{analysis}</ReactMarkdown>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Chart */}
      {chartData.length > 0 && (
        <Card sx={{ mb: 4 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              {selectedMetric.replace('[Q] ', '').replace('[M] ', '')} Trends
            </Typography>
            <ResponsiveContainer width="100%" height={500}>
              <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="quarter"
                  tick={{ fontSize: 12 }}
                  axisLine={{ stroke: '#ccc' }}
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  axisLine={{ stroke: '#ccc' }}
                  domain={['dataMin - 0.5', 'dataMax + 0.5']}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #ccc',
                    borderRadius: '8px',
                    boxShadow: '0 4px 8px rgba(0,0,0,0.1)'
                  }}
                />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                {Object.keys(chartData[0] || {}).filter(key => key !== 'quarter').map((dataKey, index) => (
                  <Line
                    key={dataKey}
                    type="monotone"
                    dataKey={dataKey}
                    name={dataKey}
                    stroke={['#A020F0', '#FF6B35', '#00B4D8', '#90E0EF'][index % 4]}
                    strokeWidth={4}
                    strokeDasharray={index === 0 ? '0' : index === 1 ? '5,5' : index === 2 ? '10,5' : '15,5,5,5'}
                    dot={{ fill: ['#A020F0', '#FF6B35', '#00B4D8', '#90E0EF'][index % 4], strokeWidth: 2, r: 6 }}
                    activeDot={{ r: 8, stroke: ['#A020F0', '#FF6B35', '#00B4D8', '#90E0EF'][index % 4], strokeWidth: 2 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Raw Data Table */}
      {rawApiData.length > 0 && (
        <Card sx={{ mb: 4 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Input Data - {selectedMetric.replace('[Q] ', '').replace('[M] ', '')}
            </Typography>
            <TableContainer component={Paper} elevation={0}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#A020F0' }}>
                    <TableCell sx={{ color: 'white', fontWeight: 600 }}>Bank</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 600 }}>Quarter</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 600 }}>Metric</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 600 }}>Value</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rawApiData.map((row, index) => (
                    <TableRow key={index} sx={{ backgroundColor: index % 2 === 0 ? '#f8f9fa' : 'white' }}>
                      <TableCell sx={{ fontWeight: 600 }}>{row.Bank}</TableCell>
                      <TableCell>{row.Quarter}</TableCell>
                      <TableCell>{row.Metric}</TableCell>
                      <TableCell>{typeof row.Value === 'number' ? row.Value.toFixed(2) + '%' : row.Value}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}

export default PeerAnalytics;