import React, { useState, useEffect } from 'react';
import { usePersistedState } from '../hooks/usePersistedState';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  TextField,
  Alert,
  CircularProgress,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Avatar,
  Stack,
  Tooltip,
  Switch,
  FormControlLabel
} from '@mui/material';
import {
  Warning,
  CheckCircle,
  Error,
  Assessment,
  Security,
  TrendingUp,
  Timeline,
  BarChart,
  PieChart,
  Refresh,
  Speed
} from '@mui/icons-material';
import AgentService from '../services/AgentService';
import { api } from '../services/api';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip as ChartJSTooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  ChartJSTooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement
);

const ComplianceAudit = () => {
  const [loading, setLoading] = useState(false);
  const [selectedBank, setSelectedBank] = usePersistedState('compliance_selectedBank', '');
  const [selectedBankCik, setSelectedBankCik] = usePersistedState('compliance_selectedBankCik', null);
  const [searchBank, setSearchBank] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [complianceData, setComplianceData] = usePersistedState('compliance_complianceData', null);
  const [auditResults, setAuditResults] = useState(null);
  const [alerts, setAlerts] = usePersistedState('compliance_alerts', []);
  const [dataSource, setDataSource] = usePersistedState('compliance_dataSource', '');
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [useStreaming, setUseStreaming] = useState(true); // Streaming toggle

  const popularBanks = {
    "JPMORGAN CHASE & CO": "0000019617",
    "BANK OF AMERICA CORP": "0000070858",
    "WELLS FARGO & COMPANY": "0000072971",
    "CITIGROUP INC": "0000831001",
    "GOLDMAN SACHS GROUP INC": "0000886982",
    "MORGAN STANLEY": "0000895421",
    "U.S. BANCORP": "0000036104",
    "PNC FINANCIAL SERVICES GROUP INC": "0000713676",
    "CAPITAL ONE FINANCIAL CORP": "0000927628",
    "TRUIST FINANCIAL CORP": "0001534701"
  };

  const handleBankSearch = async () => {
    if (!searchBank.trim()) return;
    
    try {
      setSearching(true);
      setSearchResults([]);
      setSelectedBank('');
      setSelectedBankCik(null);
      
      const baseURL = process.env.REACT_APP_API_GATEWAY_URL || window.location.origin;
      const response = await fetch(`${baseURL}/api/search-banks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchBank })
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.results) {
          setSearchResults(result.results);
        }
      }
    } catch (error) {
      console.error('Bank search error:', error);
    } finally {
      setSearching(false);
    }
  };

  // Reset function
  const handleReset = () => {
    setSelectedBank('');
    setSelectedBankCik(null);
    setSearchBank('');
    setSearchResults([]);
    setComplianceData(null);
    setAuditResults(null);
    setDataSource('');
    setAiAnalysis('');
    setAlerts([
      { type: 'info', message: 'Ready for new compliance assessment', timestamp: 'Just now' }
    ]);
  };

  // Handle AI Analysis with async job pattern
  const handleAIAnalysis = async () => {
    if (!selectedBank) return;
    
    setAnalysisLoading(true);
    setAiAnalysis('');
    
    try {
      const prompt = `Provide a comprehensive AI-powered compliance analysis for ${selectedBank}. Use the compliance_risk_assessment and regulatory_alerts_monitor tools to analyze regulatory risks, capital adequacy, liquidity coverage, and audit findings. Include specific recommendations and risk mitigation strategies.`;
      
      if (useStreaming) {
        // Streaming mode for AI Analysis
        setAlerts([{
          type: 'info',
          message: `Generating AI analysis for ${selectedBank}... ⚡`,
          timestamp: 'Just now'
        }]);
        
        let analysisText = '';
        await api.streamChat(
          prompt,
          selectedBank,
          null,
          false,
          selectedBankCik,
          (chunk) => {
            analysisText += chunk;
            // Remove COMPLIANCE_DATA and JSON lines from display
            let displayText = analysisText;
            const lines = displayText.split('\n');
            const cleanLines = lines.filter(line => {
              const trimmed = line.trim();
              // Remove lines with COMPLIANCE_DATA or JSON structures
              return !trimmed.startsWith('COMPLIANCE_DATA:') && 
                     !trimmed.startsWith('{') && 
                     !trimmed.startsWith('}') &&
                     !trimmed.includes('"risk_gauges"') &&
                     !trimmed.includes('"metrics"');
            });
            displayText = cleanLines.join('\n').trim();
            setAiAnalysis(displayText || 'Analyzing...');
          },
          () => {
            console.log('AI Analysis streaming complete');
            setAlerts(prev => [{
              type: 'success',
              message: 'AI compliance analysis completed',
              timestamp: 'Just now'
            }, ...prev.slice(0, 2)]);
          },
          (error) => {
            throw new Error(error);
          }
        );
      } else {
        // Polling mode (existing)
        const baseURL = process.env.REACT_APP_API_GATEWAY_URL || window.location.origin;
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
        
        const jobResponse = await fetch(`${baseURL}/api/jobs/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            inputText: prompt,
            sessionId: `compliance-${timestamp}-${randomId}`,
            jobType: 'chat'
          })
        });
      
      if (!jobResponse.ok) {
        const errorText = await jobResponse.text();
        console.error('AI Analysis job submission failed:', jobResponse.status, errorText);
        throw { message: `HTTP ${jobResponse.status}: ${errorText}` };
      }
      
      const jobData = await jobResponse.json();
      console.log('AI Analysis job submitted:', jobData);
      const jobId = jobData.jobId;
      
      if (!jobId) {
        console.error('No job ID in response:', jobData);
        throw { message: `No job ID returned: ${JSON.stringify(jobData)}` };
      }
      
      // Poll for completion
      let attempts = 0;
      const maxAttempts = 60;
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const statusResponse = await fetch(`${baseURL}/api/jobs/${jobId}`);
        const statusData = await statusResponse.json();
        console.log(`AI Analysis poll ${attempts + 1}:`, statusData.status);
        
        if (statusData.status === 'completed') {
          const resultResponse = await fetch(`${baseURL}/api/jobs/${jobId}/result`);
          const resultData = await resultResponse.json();
          const analysisText = resultData.result || resultData.response || resultData.output;
          
          if (analysisText && analysisText.trim()) {
            setAiAnalysis(analysisText);
            setAlerts(prev => [{
              type: 'success',
              message: 'AI compliance analysis completed',
              timestamp: 'Just now'
            }, ...prev.slice(0, 2)]);
          }
          break;
        } else if (statusData.status === 'failed') {
          console.error('AI Analysis job failed:', statusData);
          throw { message: `Job failed: ${statusData.error || 'Unknown error'}` };
        }
        
        attempts++;
      }
      
        if (attempts >= maxAttempts) {
          throw { message: 'Analysis timeout' };
        }
      }
      
    } catch (error) {
      console.error('AI analysis error:', error);
      setAlerts(prev => [{
        type: 'error',
        message: `AI analysis failed: ${error.message}`,
        timestamp: 'Just now'
      }, ...prev.slice(0, 2)]);
    }
    setAnalysisLoading(false);
  };

  // Handle compliance risk assessment
  const handleComplianceAssessment = async () => {
    if (!selectedBank) {
      console.log('No bank selected');
      return;
    }

    // Prevent multiple simultaneous requests
    if (loading) {
      console.log('Assessment already in progress');
      return;
    }
    
    console.log('Starting compliance assessment for:', selectedBank);
    setLoading(true);
    setAlerts([{
      type: 'info',
      message: `Running compliance assessment for ${selectedBank}...`,
      timestamp: 'Just now'
    }]);
    
    try {
      const baseURL = process.env.REACT_APP_API_GATEWAY_URL || window.location.origin;
      let responseText = '';

      if (useStreaming) {
        // Streaming mode
        setAlerts([{
          type: 'info',
          message: `Streaming compliance assessment for ${selectedBank}... ⚡`,
          timestamp: 'Just now'
        }]);
        
        await api.streamComplianceAssessment(
          selectedBank,
          (chunk) => {
            responseText += chunk;
            // Show progress
            setAlerts([{
              type: 'info',
              message: `Receiving data... (${responseText.length} chars)`,
              timestamp: 'Just now'
            }]);
          },
          () => {
            // Complete
            console.log('Streaming complete');
            setAlerts([{
              type: 'success',
              message: `Assessment data received for ${selectedBank}`,
              timestamp: 'Just now'
            }]);
          },
          (error) => {
            setAlerts([{
              type: 'error',
              message: `Streaming failed: ${error}`,
              timestamp: 'Just now'
            }]);
            throw new Error(error);
          }
        );
      } else {
        // Polling mode (existing)
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
        
        const jobResponse = await fetch(`${baseURL}/api/jobs/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            inputText: `Use compliance_risk_assessment("${selectedBank}") tool. Return ONLY the raw JSON output with NO explanation. Expected format: {"success": true, "overall_score": X, "scores": {...}, "metrics": {...}, "alerts": [...]}`,
            sessionId: `compliance-${timestamp}-${randomId}`,
            jobType: 'chat'
          })
        });
        
        if (!jobResponse.ok) {
          throw { message: `HTTP ${jobResponse.status}` };
        }
        
        const jobData = await jobResponse.json();
        const jobId = jobData.jobId;
        
        if (!jobId) {
          throw { message: 'No job ID returned' };
        }
        
        console.log('Compliance job submitted:', jobId);
        
        // Poll for completion
        let attempts = 0;
        const maxAttempts = 30;
        
        while (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const statusResponse = await fetch(`${baseURL}/api/jobs/${jobId}`);
          const statusData = await statusResponse.json();
          
          console.log(`Poll attempt ${attempts + 1}:`, statusData.status);
          
          if (statusData.status === 'completed') {
            const resultResponse = await fetch(`${baseURL}/api/jobs/${jobId}/result`);
            const resultData = await resultResponse.json();
            responseText = resultData.result || resultData.response || resultData.output || '';
            console.log('Compliance response:', responseText);
            break;
          } else if (statusData.status === 'failed') {
            throw { message: 'Job failed' };
          }
          
          attempts++;
        }
        
        if (attempts >= maxAttempts) {
          throw { message: 'Request timeout' };
        }
      }
      
      if (!responseText) {
        throw { message: 'No response data' };
      }
      
      // Parse compliance assessment from agent
      let complianceResult = null;
      
      try {
        // Extract JSON from response (may have text before/after)
        const jsonMatch = responseText.match(/\{[\s\S]*"success"[\s\S]*\}/);        
        if (jsonMatch) {
          complianceResult = JSON.parse(jsonMatch[0]);
        } else {
          complianceResult = JSON.parse(responseText);
        }
        
        console.log('Parsed compliance result:', complianceResult);
        
        if (!complianceResult.success) {
          throw { message: complianceResult.error || 'Compliance assessment failed' };
        }
      } catch (e) {
        console.error('Could not parse compliance data:', e);
        console.error('Response text:', responseText);
        throw { message: `Unable to assess ${selectedBank}. ${e.message || 'Please try again.'}` };
      }
      
      if (complianceResult && complianceResult.success) {
        setDataSource('🟢 FDIC Data (2024-2025)');
        
        const scores = complianceResult.scores || {};
        const metrics = complianceResult.metrics || {};
        const alerts = complianceResult.alerts || [];
        
        // Map backend scores to frontend format
        setComplianceData({
          bankName: selectedBank,
          overallScore: complianceResult.overall_score || 0,
          capitalAdequacy: scores.capital_adequacy || 0,
          assetQuality: scores.asset_quality || 0,
          liquidity: scores.liquidity || 0,
          profitability: scores.earnings || scores.profitability || 0,
          capitalRisk: complianceResult.risk_gauges?.capital_risk || (100 - (scores.capital_adequacy || 0)),
          liquidityRisk: complianceResult.risk_gauges?.liquidity_risk || (100 - (scores.liquidity || 0)),
          creditRisk: complianceResult.risk_gauges?.credit_risk || (100 - (scores.asset_quality || 0)),
          lastUpdated: complianceResult.last_updated || new Intl.DateTimeFormat('en-US').format(new Date()),
          actualROA: metrics.roa || 0,
          actualROE: metrics.roe || 0,
          actualAssets: metrics.assets || 0,
          equityRatio: (metrics.leverage_ratio || metrics.tier1_ratio || 0).toFixed(2),
          ltdRatio: (metrics.ltd_ratio || 0).toFixed(2),
          nplRatio: metrics.npl_ratio?.toFixed(2),
          coverageRatio: metrics.coverage_ratio?.toFixed(1),
          tier1Ratio: metrics.tier1_ratio?.toFixed(2)
        });
        
        setAlerts([
          { type: 'success', message: `Compliance assessment completed for ${selectedBank}`, timestamp: 'Just now' },
          { type: 'info', message: `Overall Score: ${complianceResult.overall_score}/100`, timestamp: 'Just now' },
          ...alerts.slice(0, 2).map(a => ({ type: a.type, message: a.message, timestamp: 'Just now' }))
        ]);
      }
      
    } catch (error) {
      console.error('Compliance assessment error:', error);
      setAlerts([{
        type: 'error',
        message: `Assessment failed: ${error.message || 'Unknown error'}`,
        timestamp: 'Just now'
      }]);
      setDataSource('🔴 Error loading data');
    } finally {
      setLoading(false);
    }
  };



  // Initialize with default alerts
  useEffect(() => {
    setAlerts([
      { type: 'info', message: 'Search for a bank to begin compliance assessment', timestamp: 'Ready' }
    ]);
  }, []);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ mb: 3, fontWeight: 'bold' }}>
        🛡️ Compliance & Audit Dashboard
      </Typography>
      <Alert severity="info" sx={{ mb: 3 }}>
        <strong>Data Period:</strong> October 2024 to October 2025 (Latest Available)
      </Alert>

      {/* Bank Selection */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Bank Selection & Assessment
          </Typography>
          {/* Bank Search */}
          <Box sx={{ display: 'flex', gap: 1, mb: 3, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField
              placeholder="Search for any bank or financial institution..."
              value={searchBank}
              onChange={(e) => setSearchBank(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleBankSearch()}
              size="small"
              sx={{ minWidth: 300, flexGrow: 1 }}
            />
            <Button 
              variant="contained" 
              onClick={handleBankSearch}
              disabled={!searchBank.trim() || searching}
              startIcon={searching ? <CircularProgress size={16} /> : <Assessment />}
            >
              {searching ? 'Searching...' : 'Search'}
            </Button>
            <Button
              variant="outlined"
              onClick={handleReset}
              disabled={loading || analysisLoading}
              startIcon={<Refresh />}
              color="secondary"
            >
              Reset
            </Button>
          </Box>
          
          {/* Search Results */}
          {searchResults.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="body2" sx={{ mb: 1, fontWeight: 600 }}>Search Results:</Typography>
              <Grid container spacing={1}>
                {searchResults.map((result, index) => (
                  <Grid item key={index}>
                    <Button
                      variant={selectedBank === result.name ? 'contained' : 'outlined'}
                      onClick={() => {
                        setSelectedBank(result.name);
                        setSelectedBankCik(result.cik);
                        setSearchResults([]);
                        setSearchBank('');
                        setComplianceData(null);
                        setAuditResults(null);
                        setDataSource('');
                        setAiAnalysis('');
                      }}
                      sx={{ textTransform: 'none', fontSize: '0.8rem' }}
                    >
                      🏦 {result.name}
                    </Button>
                  </Grid>
                ))}
              </Grid>
            </Box>
          )}
          
          <Typography variant="body2" sx={{ mb: 2, fontWeight: 600 }}>Or select from 10 popular banks:</Typography>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {Object.entries(popularBanks).map(([bankName, cik]) => (
              <Grid item key={bankName}>
                <Button
                  variant={selectedBank === bankName ? 'contained' : 'outlined'}
                  onClick={() => {
                    setSelectedBank(bankName);
                    setSelectedBankCik(cik);
                    setSearchResults([]);
                    setSearchBank('');
                    setComplianceData(null);
                    setAuditResults(null);
                    setDataSource('');
                    setAiAnalysis('');
                  }}
                  sx={{ textTransform: 'none', fontSize: '0.8rem' }}
                >
                  🏦 {bankName.replace(' INC', '').replace(' CORP', '').replace(' GROUP', '').replace(' CORPORATION', '')}
                </Button>
              </Grid>
            ))}
          </Grid>
          
          {selectedBank && (
            <Box sx={{ mb: 3 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <Button
                  variant="contained"
                  onClick={handleComplianceAssessment}
                  disabled={loading || !selectedBank}
                  startIcon={loading ? <CircularProgress size={16} /> : <Assessment />}
                  size="large"
                  fullWidth
                >
                  {loading ? 'Assessing...' : `Assess Compliance for ${selectedBank.replace(' CORP', '').replace(' INC', '').substring(0, 20)}${selectedBank.length > 20 ? '...' : ''}`}
                </Button>
                <Button
                  variant="outlined"
                  onClick={handleAIAnalysis}
                  disabled={analysisLoading || !selectedBank || !complianceData}
                  startIcon={analysisLoading ? <CircularProgress size={16} /> : <Security />}
                  size="large"
                  color="secondary"
                  fullWidth
                >
                  {analysisLoading ? 'Analyzing...' : 'AI Analysis'}
                </Button>
                <FormControlLabel
                  control={
                    <Switch 
                      checked={useStreaming} 
                      onChange={(e) => setUseStreaming(e.target.checked)}
                      disabled={loading || analysisLoading}
                      size="small"
                    />
                  }
                  label={<Typography variant="caption">Stream {useStreaming ? '⚡' : ''}</Typography>}
                  sx={{ minWidth: 120 }}
                />
              </Stack>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Data Source Indicator */}
      {dataSource && complianceData && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <strong>Data Source:</strong> {dataSource}
        </Alert>
      )}

      {/* Professional Risk Temperature Gauges */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
            <Speed sx={{ mr: 1 }} /> Regulatory Risk Dashboard
          </Typography>
          {complianceData ? (
            <>
              <Grid container spacing={3}>
                <Grid item xs={12} md={4}>
                  <Card sx={{ textAlign: 'center', p: 2, bgcolor: '#f8f9fa' }}>
                    <Tooltip title="Measures bank's capital adequacy to absorb losses. Higher score = lower risk. Based on Tier 1 capital ratio and equity levels." arrow>
                      <Typography variant="subtitle2" color="text.secondary" sx={{ cursor: 'help', borderBottom: '1px dotted #999' }}>Capital Risk</Typography>
                    </Tooltip>
                    <Box sx={{ position: 'relative', display: 'inline-flex', mt: 1 }}>
                      <CircularProgress
                        variant="determinate"
                        value={complianceData.capitalRisk || 75}
                        size={80}
                        thickness={6}
                        sx={{ color: complianceData.capitalRisk >= 80 ? '#4caf50' : complianceData.capitalRisk >= 60 ? '#ff9800' : '#f44336' }}
                      />
                      <Box sx={{ position: 'absolute', top: 0, left: 0, bottom: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Typography variant="h6" color="text.secondary">{complianceData.capitalRisk || 75}%</Typography>
                      </Box>
                    </Box>
                    <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                      {complianceData.capitalRisk >= 80 ? 'Low Risk' : complianceData.capitalRisk >= 60 ? 'Moderate Risk' : 'High Risk'}
                    </Typography>
                    {complianceData.equityRatio && (
                      <Typography variant="caption" display="block" color="text.secondary">
                        Equity Ratio: {complianceData.equityRatio}%
                      </Typography>
                    )}
                  </Card>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Card sx={{ textAlign: 'center', p: 2, bgcolor: '#f8f9fa' }}>
                    <Tooltip title="Assesses ability to meet short-term obligations. Higher score = lower risk. Based on loan-to-deposit ratio and liquid assets." arrow>
                      <Typography variant="subtitle2" color="text.secondary" sx={{ cursor: 'help', borderBottom: '1px dotted #999' }}>Liquidity Risk</Typography>
                    </Tooltip>
                    <Box sx={{ position: 'relative', display: 'inline-flex', mt: 1 }}>
                      <CircularProgress
                        variant="determinate"
                        value={complianceData.liquidityRisk || 85}
                        size={80}
                        thickness={6}
                        sx={{ color: complianceData.liquidityRisk >= 80 ? '#4caf50' : complianceData.liquidityRisk >= 60 ? '#ff9800' : '#f44336' }}
                      />
                      <Box sx={{ position: 'absolute', top: 0, left: 0, bottom: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Typography variant="h6" color="text.secondary">{complianceData.liquidityRisk || 85}%</Typography>
                      </Box>
                    </Box>
                    <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                      {complianceData.liquidityRisk >= 80 ? 'Low Risk' : complianceData.liquidityRisk >= 60 ? 'Moderate Risk' : 'High Risk'}
                    </Typography>
                    {complianceData.ltdRatio && (
                      <Typography variant="caption" display="block" color="text.secondary">
                        LTD Ratio: {complianceData.ltdRatio}%
                      </Typography>
                    )}
                  </Card>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Card sx={{ textAlign: 'center', p: 2, bgcolor: '#f8f9fa' }}>
                    <Tooltip title="Evaluates loan portfolio quality and default risk. Higher score = lower risk. Based on non-performing loans and charge-offs." arrow>
                      <Typography variant="subtitle2" color="text.secondary" sx={{ cursor: 'help', borderBottom: '1px dotted #999' }}>Credit Risk</Typography>
                    </Tooltip>
                    <Box sx={{ position: 'relative', display: 'inline-flex', mt: 1 }}>
                      <CircularProgress
                        variant="determinate"
                        value={complianceData.creditRisk || 65}
                        size={80}
                        thickness={6}
                        sx={{ color: complianceData.creditRisk >= 80 ? '#4caf50' : complianceData.creditRisk >= 60 ? '#ff9800' : '#f44336' }}
                      />
                      <Box sx={{ position: 'absolute', top: 0, left: 0, bottom: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Typography variant="h6" color="text.secondary">{complianceData.creditRisk || 65}%</Typography>
                      </Box>
                    </Box>
                    <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                      {complianceData.creditRisk >= 80 ? 'Low Risk' : complianceData.creditRisk >= 60 ? 'Moderate Risk' : 'High Risk'}
                    </Typography>
                    {complianceData.actualROA && (
                      <Typography variant="caption" display="block" color="text.secondary">
                        ROA: {complianceData.actualROA}%
                      </Typography>
                    )}
                  </Card>
                </Grid>
              </Grid>
              
              {/* Alert Temperature Dials - Dynamic based on actual risk gauges */}
              <Box sx={{ mt: 3 }}>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                  <Warning sx={{ mr: 1 }} /> Regulatory Alert Status
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={4}>
                    <Card sx={{ textAlign: 'center', p: 2, bgcolor: complianceData.capitalRisk < 30 ? '#e8f5e8' : complianceData.capitalRisk < 60 ? '#fff3e0' : '#ffebee' }}>
                      <Typography variant="subtitle2" color="text.secondary">Capital Alert</Typography>
                      <Box sx={{ position: 'relative', display: 'inline-flex', mt: 1 }}>
                        <CircularProgress
                          variant="determinate"
                          value={complianceData.capitalRisk}
                          size={60}
                          thickness={8}
                          sx={{ color: complianceData.capitalRisk < 30 ? '#4caf50' : complianceData.capitalRisk < 60 ? '#ff9800' : '#f44336' }}
                        />
                        <Box sx={{ position: 'absolute', top: 0, left: 0, bottom: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {complianceData.capitalRisk < 30 ? <CheckCircle sx={{ color: '#4caf50', fontSize: 20 }} /> :
                           complianceData.capitalRisk < 60 ? <Warning sx={{ color: '#ff9800', fontSize: 20 }} /> :
                           <Error sx={{ color: '#f44336', fontSize: 20 }} />}
                        </Box>
                      </Box>
                      <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                        {complianceData.capitalRisk < 30 ? 'Well Capitalized' : complianceData.capitalRisk < 60 ? 'Adequate Capital' : 'Capital Concern'}
                      </Typography>
                    </Card>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Card sx={{ textAlign: 'center', p: 2, bgcolor: complianceData.liquidityRisk < 30 ? '#e8f5e8' : complianceData.liquidityRisk < 60 ? '#fff3e0' : '#ffebee' }}>
                      <Typography variant="subtitle2" color="text.secondary">Liquidity Alert</Typography>
                      <Box sx={{ position: 'relative', display: 'inline-flex', mt: 1 }}>
                        <CircularProgress
                          variant="determinate"
                          value={complianceData.liquidityRisk}
                          size={60}
                          thickness={8}
                          sx={{ color: complianceData.liquidityRisk < 30 ? '#4caf50' : complianceData.liquidityRisk < 60 ? '#ff9800' : '#f44336' }}
                        />
                        <Box sx={{ position: 'absolute', top: 0, left: 0, bottom: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {complianceData.liquidityRisk < 30 ? <CheckCircle sx={{ color: '#4caf50', fontSize: 20 }} /> :
                           complianceData.liquidityRisk < 60 ? <Warning sx={{ color: '#ff9800', fontSize: 20 }} /> :
                           <Error sx={{ color: '#f44336', fontSize: 20 }} />}
                        </Box>
                      </Box>
                      <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                        {complianceData.liquidityRisk < 30 ? 'Strong Liquidity' : complianceData.liquidityRisk < 60 ? 'Adequate Liquidity' : 'Liquidity Concern'}
                      </Typography>
                    </Card>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Card sx={{ textAlign: 'center', p: 2, bgcolor: complianceData.creditRisk < 30 ? '#e8f5e8' : complianceData.creditRisk < 60 ? '#fff3e0' : '#ffebee' }}>
                      <Typography variant="subtitle2" color="text.secondary">Credit Alert</Typography>
                      <Box sx={{ position: 'relative', display: 'inline-flex', mt: 1 }}>
                        <CircularProgress
                          variant="determinate"
                          value={complianceData.creditRisk}
                          size={60}
                          thickness={8}
                          sx={{ color: complianceData.creditRisk < 30 ? '#4caf50' : complianceData.creditRisk < 60 ? '#ff9800' : '#f44336' }}
                        />
                        <Box sx={{ position: 'absolute', top: 0, left: 0, bottom: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {complianceData.creditRisk < 30 ? <CheckCircle sx={{ color: '#4caf50', fontSize: 20 }} /> :
                           complianceData.creditRisk < 60 ? <Warning sx={{ color: '#ff9800', fontSize: 20 }} /> :
                           <Error sx={{ color: '#f44336', fontSize: 20 }} />}
                        </Box>
                      </Box>
                      <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                        {complianceData.creditRisk < 30 ? 'Strong Asset Quality' : complianceData.creditRisk < 60 ? 'Adequate Quality' : 'Quality Concern'}
                      </Typography>
                    </Card>
                  </Grid>
                </Grid>
              </Box>
            </>
          ) : (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="body1" color="text.secondary">
                Select a bank and run compliance assessment to view risk dashboard
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* AI Analysis Section */}
      {(aiAnalysis || analysisLoading) && !aiAnalysis.startsWith('Error:') && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
              <Security sx={{ mr: 1, color: 'primary.main' }} /> AI-Powered Compliance Analysis
              {analysisLoading && <CircularProgress size={20} sx={{ ml: 2 }} />}
            </Typography>
            {analysisLoading ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <CircularProgress />
                <Typography variant="body2" sx={{ mt: 2 }}>Analyzing compliance data...</Typography>
              </Box>
            ) : (
              <Box>
                {/* Executive Summary Card */}
                <Card sx={{ mb: 3, background: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)', color: 'white' }}>
                  <CardContent>
                    <Typography variant="h5" gutterBottom sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
                      <Assessment sx={{ mr: 1 }} /> Executive Summary
                    </Typography>
                    <Typography variant="body1" sx={{ lineHeight: 1.8, opacity: 0.95 }}>
                      {(() => {
                        let cleanText = aiAnalysis;
                        
                        // Remove JSON blocks by finding matching braces
                        if (cleanText.includes('{') && cleanText.includes('"success"')) {
                          let startIdx = cleanText.indexOf('{');
                          let braceCount = 0;
                          let endIdx = startIdx;
                          for (let i = startIdx; i < cleanText.length; i++) {
                            if (cleanText[i] === '{') braceCount++;
                            if (cleanText[i] === '}') braceCount--;
                            if (braceCount === 0) {
                              endIdx = i + 1;
                              break;
                            }
                          }
                          cleanText = cleanText.substring(endIdx).trim();
                        }
                        
                        // Extract first meaningful paragraph
                        if (cleanText.includes('## ')) {
                          return cleanText.split('## ')[0].replace(/^# .*?\n\n/, '').split('\n\n')[0];
                        }
                        
                        const paragraphs = cleanText.split('\n\n').filter(p => p.trim().length > 50);
                        return paragraphs[0] || 'AI analysis completed successfully.';
                      })()}
                    </Typography>
                  </CardContent>
                </Card>

                {/* Key Metrics Grid */}
                {complianceData && (
                  <Grid container spacing={2} sx={{ mb: 3 }}>
                    <Grid item xs={12} md={3}>
                      <Card sx={{ textAlign: 'center', p: 2, bgcolor: '#fef3c7', border: '2px solid #f59e0b' }}>
                        <Typography variant="h4" sx={{ color: '#d97706', fontWeight: 'bold' }}>{complianceData.overallScore}</Typography>
                        <Typography variant="body2" sx={{ color: '#92400e' }}>Compliance Score</Typography>
                      </Card>
                    </Grid>
                    <Grid item xs={12} md={3}>
                      <Card sx={{ textAlign: 'center', p: 2, bgcolor: '#fecaca', border: '2px solid #ef4444' }}>
                        <Typography variant="h4" sx={{ color: '#dc2626', fontWeight: 'bold' }}>{complianceData.equityRatio ? `${complianceData.equityRatio}%` : 'N/A'}</Typography>
                        <Typography variant="body2" sx={{ color: '#991b1b' }}>Equity Ratio</Typography>
                      </Card>
                    </Grid>
                    <Grid item xs={12} md={3}>
                      <Card sx={{ textAlign: 'center', p: 2, bgcolor: '#dcfce7', border: '2px solid #22c55e' }}>
                        <Typography variant="h4" sx={{ color: '#16a34a', fontWeight: 'bold' }}>{complianceData.assetQuality}</Typography>
                        <Typography variant="body2" sx={{ color: '#15803d' }}>Asset Quality</Typography>
                      </Card>
                    </Grid>
                    <Grid item xs={12} md={3}>
                      <Card sx={{ textAlign: 'center', p: 2, bgcolor: '#e0e7ff', border: '2px solid #6366f1' }}>
                        <Typography variant="h4" sx={{ color: '#4f46e5', fontWeight: 'bold' }}>{complianceData.actualROA ? `${complianceData.actualROA.toFixed(2)}%` : 'N/A'}</Typography>
                        <Typography variant="body2" sx={{ color: '#3730a3' }}>ROA</Typography>
                      </Card>
                    </Grid>
                  </Grid>
                )}

                {/* Key Insights - Professional Business Style */}
                <Grid container spacing={2}>
                  {(() => {
                    const sections = aiAnalysis.includes('## ') ? aiAnalysis.split('## ').slice(1) : [aiAnalysis];
                    const insights = sections.slice(0, 4).map((section, index) => {
                      const [title, ...content] = aiAnalysis.includes('## ') ? section.split('\n\n') : [`Key Insight ${index + 1}`, section];
                      const contentText = content.join(' ').split('.').slice(0, 2).join('.') + '.';
                      return { title: title.trim(), content: contentText.trim() };
                    });
                    
                    const colors = [
                      { bg: '#f8fafc', border: '#0ea5e9', icon: '#0284c7' },
                      { bg: '#fefce8', border: '#eab308', icon: '#ca8a04' },
                      { bg: '#f0fdf4', border: '#22c55e', icon: '#16a34a' },
                      { bg: '#fef2f2', border: '#ef4444', icon: '#dc2626' }
                    ];
                    
                    return insights.map((insight, index) => (
                      <Grid item xs={12} md={6} key={index}>
                        <Card sx={{ 
                          height: '100%',
                          bgcolor: colors[index].bg,
                          borderLeft: `4px solid ${colors[index].border}`,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                        }}>
                          <CardContent sx={{ p: 2 }}>
                            <Typography 
                              variant="subtitle2" 
                              sx={{ 
                                color: colors[index].icon,
                                fontWeight: 600,
                                mb: 1,
                                textTransform: 'uppercase',
                                fontSize: '0.75rem',
                                letterSpacing: '0.5px'
                              }}
                            >
                              {insight.title}
                            </Typography>
                            <Typography 
                              variant="body2" 
                              sx={{ 
                                color: '#475569',
                                lineHeight: 1.5,
                                fontSize: '0.875rem'
                              }}
                            >
                              {insight.content}
                            </Typography>
                          </CardContent>
                        </Card>
                      </Grid>
                    ));
                  })()}
                </Grid>


              </Box>
            )}
          </CardContent>
        </Card>
      )}

      {/* Professional Compliance Dashboard */}
      {complianceData && (
        <>
          {/* Executive Summary Card */}
          <Card sx={{ mb: 3, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
            <CardContent>
              <Grid container spacing={3} alignItems="center">
                <Grid item xs={12} md={8}>
                  <Typography variant="h5" gutterBottom sx={{ fontWeight: 'bold' }}>
                    {complianceData.bankName}
                  </Typography>
                  <Typography variant="body1" sx={{ opacity: 0.9 }}>
                    Regulatory Status: <strong>Well Capitalized</strong>
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.8, mt: 1 }}>
                    Report Date: {complianceData.lastUpdated} | Data Period: Oct 2024 - Oct 2025 | Assets: ${complianceData.actualAssets ? `$${(complianceData.actualAssets/1000).toFixed(1)}B` : '$3.8B'}
                  </Typography>
                  {complianceData.actualROA && (
                    <Typography variant="body2" sx={{ opacity: 0.8, mt: 1 }}>
                      ROA: {complianceData.actualROA.toFixed(2)}% | ROE: {complianceData.actualROE.toFixed(2)}%
                    </Typography>
                  )}
                  {dataSource && (
                    <Typography variant="body2" sx={{ opacity: 0.9, mt: 1, fontWeight: 'bold' }}>
                      Data Source: {dataSource}
                    </Typography>
                  )}
                </Grid>
                <Grid item xs={12} md={4}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h2" sx={{ fontWeight: 'bold', mb: 1 }}>
                      {complianceData.overallScore}
                    </Typography>
                    <Typography variant="h6">Compliance Score</Typography>
                    <Typography variant="caption" sx={{ display: 'block', mt: 1, opacity: 0.7, fontSize: '0.7rem' }}>
                      Simplified risk score based on public FDIC data. Not an official regulatory rating.
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          {/* Charts and Metrics */}
          <Grid container spacing={3} sx={{ mb: 3 }}>
            {/* Compliance Score Breakdown */}
            <Grid item xs={12} md={6}>
              <Card sx={{ height: '400px' }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                    <PieChart sx={{ mr: 1 }} /> Compliance Score Breakdown
                  </Typography>
                  <Box sx={{ height: '300px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <Doughnut
                      data={{
                        labels: ['Capital Adequacy', 'Asset Quality', 'Liquidity', 'Profitability'],
                        datasets: [{
                          data: [
                            complianceData.capitalAdequacy,
                            complianceData.assetQuality,
                            complianceData.liquidity,
                            complianceData.profitability
                          ],
                          backgroundColor: ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0'],
                          borderWidth: 2,
                          borderColor: '#fff'
                        }]
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: {
                            position: 'bottom'
                          }
                        }
                      }}
                    />
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* Risk Metrics Bar Chart */}
            <Grid item xs={12} md={6}>
              <Card sx={{ height: '400px' }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                    <BarChart sx={{ mr: 1 }} /> Risk Metrics vs Thresholds
                  </Typography>
                  <Box sx={{ height: '300px' }}>
                    <Bar
                      data={{
                        labels: ['Equity Ratio', 'LTD Ratio', 'ROA', 'Capital Score'],
                        datasets: [
                          {
                            label: 'Current Value',
                            data: [
                              complianceData.equityRatio || 8.5,
                              complianceData.ltdRatio || 75,
                              complianceData.actualROA,
                              complianceData.capitalAdequacy || 75
                            ],
                            backgroundColor: '#2196F3',
                            borderRadius: 4
                          },
                          {
                            label: 'Regulatory Threshold',
                            data: [6.0, 100, 0.8, 80],
                            backgroundColor: '#FF5722',
                            borderRadius: 4
                          }
                        ]
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: {
                            position: 'top'
                          }
                        },
                        scales: {
                          y: {
                            beginAtZero: true
                          }
                        }
                      }}
                    />
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Professional Metrics Table */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                <Assessment sx={{ mr: 1 }} /> Key Regulatory Metrics
              </Typography>
              <TableContainer component={Paper} sx={{ mt: 2 }}>
                <Table>
                  <TableHead>
                    <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                      <TableCell><strong>Metric</strong></TableCell>
                      <TableCell align="right"><strong>Current Value</strong></TableCell>
                      <TableCell align="right"><strong>Regulatory Threshold</strong></TableCell>
                      <TableCell align="center"><strong>Status</strong></TableCell>
                      <TableCell align="center"><strong>Score</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    <TableRow>
                      <TableCell>
                        <Tooltip title="Percentage of assets funded by shareholders' equity. Higher ratio indicates stronger capital cushion against losses." arrow>
                          <span style={{ cursor: 'help', borderBottom: '1px dotted #999' }}>Equity to Assets Ratio</span>
                        </Tooltip>
                      </TableCell>
                      <TableCell align="right">{complianceData.equityRatio ? `${complianceData.equityRatio}%` : 'N/A'}</TableCell>
                      <TableCell align="right">≥ 6.0%</TableCell>
                      <TableCell align="center">
                        <Chip 
                          label={complianceData.equityRatio >= 8 ? 'Excellent' : complianceData.equityRatio >= 6 ? 'Good' : 'Below Min'} 
                          color={complianceData.equityRatio >= 8 ? 'success' : complianceData.equityRatio >= 6 ? 'primary' : 'error'} 
                          size="small" 
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Avatar sx={{ bgcolor: '#ff9800', width: 32, height: 32, fontSize: '0.875rem' }}>
                          {complianceData.capitalAdequacy}
                        </Avatar>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>
                        <Tooltip title="Measures how much of deposits are used for loans. Ratio above 100% may indicate liquidity stress." arrow>
                          <span style={{ cursor: 'help', borderBottom: '1px dotted #999' }}>Loan-to-Deposit Ratio</span>
                        </Tooltip>
                      </TableCell>
                      <TableCell align="right">{complianceData.ltdRatio ? `${complianceData.ltdRatio}%` : 'N/A'}</TableCell>
                      <TableCell align="right">&lt; 100%</TableCell>
                      <TableCell align="center">
                        <Chip 
                          label={complianceData.ltdRatio < 80 ? 'Excellent' : complianceData.ltdRatio < 100 ? 'Good' : 'High'} 
                          color={complianceData.ltdRatio < 80 ? 'success' : complianceData.ltdRatio < 100 ? 'primary' : 'warning'} 
                          size="small" 
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Avatar sx={{ bgcolor: '#4caf50', width: 32, height: 32, fontSize: '0.875rem' }}>
                          {complianceData.liquidity}
                        </Avatar>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>
                        <Tooltip title="Net income as percentage of total assets. Measures how efficiently bank uses assets to generate profit. Industry average: 0.8-1.2%." arrow>
                          <span style={{ cursor: 'help', borderBottom: '1px dotted #999' }}>Return on Assets (ROA)</span>
                        </Tooltip>
                      </TableCell>
                      <TableCell align="right">{complianceData.actualROA ? `${complianceData.actualROA.toFixed(2)}%` : 'N/A'}</TableCell>
                      <TableCell align="right">≥ 0.8%</TableCell>
                      <TableCell align="center">
                        <Chip 
                          label={complianceData.actualROA >= 1.2 ? 'Strong' : complianceData.actualROA >= 0.8 ? 'Good' : 'Below Min'} 
                          color={complianceData.actualROA >= 1.2 ? 'success' : complianceData.actualROA >= 0.8 ? 'primary' : 'warning'} 
                          size="small" 
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Avatar sx={{ bgcolor: '#9c27b0', width: 32, height: 32, fontSize: '0.875rem' }}>
                          {complianceData.profitability}
                        </Avatar>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>
                        <Tooltip title="Net income as percentage of shareholders' equity. Measures profitability from shareholders' perspective. Industry average: 10-15%." arrow>
                          <span style={{ cursor: 'help', borderBottom: '1px dotted #999' }}>Return on Equity (ROE)</span>
                        </Tooltip>
                      </TableCell>
                      <TableCell align="right">{complianceData.actualROE ? `${complianceData.actualROE.toFixed(2)}%` : 'N/A'}</TableCell>
                      <TableCell align="right">≥ 10.0%</TableCell>
                      <TableCell align="center">
                        <Chip 
                          label={complianceData.actualROE >= 12 ? 'Strong' : complianceData.actualROE >= 10 ? 'Good' : 'Below Min'} 
                          color={complianceData.actualROE >= 12 ? 'success' : complianceData.actualROE >= 10 ? 'primary' : 'warning'} 
                          size="small" 
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Avatar sx={{ bgcolor: '#2196f3', width: 32, height: 32, fontSize: '0.875rem' }}>
                          {complianceData.assetQuality}
                        </Avatar>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </>
      )}

      {/* Professional Audit Results */}
      {auditResults && (
        <Grid container spacing={3}>
          {/* Audit Findings Table */}
          <Grid item xs={12} md={8}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                  <Security sx={{ mr: 1 }} /> Audit Findings & Risk Assessment
                </Typography>
                <TableContainer component={Paper} sx={{ mt: 2 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                        <TableCell><strong>Category</strong></TableCell>
                        <TableCell><strong>Finding</strong></TableCell>
                        <TableCell align="center"><strong>Severity</strong></TableCell>
                        <TableCell align="center"><strong>Regulation</strong></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {auditResults.findings.map((finding, index) => (
                        <TableRow key={index} hover>
                          <TableCell>
                            <Stack direction="row" alignItems="center" spacing={1}>
                              {finding.type === 'error' ? <Error color="error" fontSize="small" /> : 
                               finding.type === 'warning' ? <Warning color="warning" fontSize="small" /> : 
                               <CheckCircle color="success" fontSize="small" />}
                              <Typography variant="body2" fontWeight="medium">
                                {finding.category || 'General'}
                              </Typography>
                            </Stack>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">
                              {finding.issue}
                            </Typography>
                          </TableCell>
                          <TableCell align="center">
                            <Chip 
                              label={finding.severity} 
                              size="small" 
                              color={finding.severity === 'High' ? 'error' : 
                                     finding.severity === 'Medium' ? 'warning' : 'success'}
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell align="center">
                            <Typography variant="caption" color="text.secondary">
                              {finding.regulation || 'N/A'}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>

          {/* Risk Summary & Recommendations */}
          <Grid item xs={12} md={4}>
            <Stack spacing={2}>
              {/* Risk Summary Card */}
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                    <Timeline sx={{ mr: 1 }} /> Risk Summary
                  </Typography>
                  <Box sx={{ textAlign: 'center', py: 2 }}>
                    <Typography variant="h3" color="primary" gutterBottom>
                      85
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Overall Risk Score
                    </Typography>
                  </Box>
                  <Divider sx={{ my: 2 }} />
                  <Grid container spacing={2}>
                    <Grid item xs={4}>
                      <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="h6" color="error">
                          {auditResults.findings.filter(f => f.severity === 'High').length}
                        </Typography>
                        <Typography variant="caption">High</Typography>
                      </Box>
                    </Grid>
                    <Grid item xs={4}>
                      <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="h6" color="warning.main">
                          {auditResults.findings.filter(f => f.severity === 'Medium').length}
                        </Typography>
                        <Typography variant="caption">Medium</Typography>
                      </Box>
                    </Grid>
                    <Grid item xs={4}>
                      <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="h6" color="success.main">
                          {auditResults.findings.filter(f => f.severity === 'Low').length}
                        </Typography>
                        <Typography variant="caption">Low</Typography>
                      </Box>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>

              {/* Action Items Card */}
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                    <TrendingUp sx={{ mr: 1 }} /> Priority Actions
                  </Typography>
                  <List dense>
                    {auditResults.recommendations.slice(0, 4).map((rec, index) => (
                      <ListItem key={index} sx={{ px: 0 }}>
                        <ListItemIcon sx={{ minWidth: 32 }}>
                          <Avatar sx={{ width: 24, height: 24, fontSize: '0.75rem', bgcolor: 'primary.main' }}>
                            {index + 1}
                          </Avatar>
                        </ListItemIcon>
                        <ListItemText 
                          primary={
                            <Typography variant="body2">
                              {rec}
                            </Typography>
                          }
                        />
                      </ListItem>
                    ))}
                  </List>
                </CardContent>
              </Card>
            </Stack>
          </Grid>
        </Grid>
      )}

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
          <CircularProgress />
        </Box>
      )}
    </Box>
  );
};

export default ComplianceAudit;// Build 1761397254
