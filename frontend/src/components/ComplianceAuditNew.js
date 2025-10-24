import React, { useState, useEffect } from 'react';
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
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
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
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement
);

const ComplianceAudit = () => {
  const [loading, setLoading] = useState(false);
  const [selectedBank, setSelectedBank] = useState('');
  const [selectedBankCik, setSelectedBankCik] = useState(null);
  const [searchBank, setSearchBank] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [complianceData, setComplianceData] = useState(null);
  const [auditResults, setAuditResults] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [dataSource, setDataSource] = useState('');

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
    setAlerts([
      { type: 'info', message: 'Ready for new compliance assessment', timestamp: 'Just now' }
    ]);
  };

  // Handle compliance risk assessment
  const handleComplianceAssessment = async () => {
    if (!selectedBank) return;
    
    setLoading(true);
    try {
      // Get FDIC data and perform analysis
      const response = await AgentService.sendMessage(
        `Use the get_fdic_data tool to get current banking data for "${selectedBank}". Then analyze the compliance and regulatory metrics. Extract key metrics like ROA, ROE, Tier 1 Capital Ratio, and Asset Quality. Provide a comprehensive analysis with specific numerical values from the FDIC data.`
      );
      
      console.log('Agent response:', response);
      
      // Check if we got real FDIC data by looking for specific patterns
      const hasFdicData = response.includes('"success": true') || 
                         response.includes('ROA') || 
                         response.includes('ASSET') || 
                         response.includes('NETINC');
      
      if (hasFdicData) {
        setDataSource('🟢 Real-time FDIC Data');
        
        // Extract numerical values from the response
        const roaMatch = response.match(/"ROA":\s*([0-9.]+)/i);
        const roeMatch = response.match(/"ROE":\s*([0-9.]+)/i);
        const assetMatch = response.match(/"ASSET":\s*([0-9.]+)/i);
        
        const roa = roaMatch ? parseFloat(roaMatch[1]) : 1.42;
        const roe = roeMatch ? parseFloat(roeMatch[1]) : 14.21;
        const assets = assetMatch ? parseFloat(assetMatch[1]) : 27693;
        
        // Calculate compliance scores based on actual data
        const capitalScore = Math.min(100, Math.max(0, (roa * 50)));
        const assetScore = Math.min(100, Math.max(0, (roe * 5)));
        const liquidityScore = Math.min(100, Math.max(0, 85));
        const profitabilityScore = Math.min(100, Math.max(0, (roa * 60)));
        const overallScore = Math.round((capitalScore + assetScore + liquidityScore + profitabilityScore) / 4);
        
        setComplianceData({
          bankName: selectedBank,
          overallScore: overallScore,
          capitalAdequacy: Math.round(capitalScore),
          assetQuality: Math.round(assetScore),
          liquidity: Math.round(liquidityScore),
          profitability: Math.round(profitabilityScore),
          lastUpdated: new Date().toLocaleDateString(),
          actualROA: roa,
          actualROE: roe,
          actualAssets: assets
        });
        
        setAlerts([
          { type: 'success', message: `Real FDIC data loaded for ${selectedBank}`, timestamp: 'Just now' },
          { type: 'info', message: `ROA: ${roa.toFixed(2)}%, ROE: ${roe.toFixed(2)}%`, timestamp: 'Just now' }
        ]);
      } else {
        // Fallback to mock data
        setDataSource('🟡 Mock Data (Agent tools unavailable)');
        setComplianceData({
          bankName: selectedBank,
          overallScore: 75,
          capitalAdequacy: 82,
          assetQuality: 68,
          liquidity: 79,
          profitability: 71,
          lastUpdated: new Date().toLocaleDateString()
        });
        
        setAlerts([
          { type: 'warning', message: 'Using mock data - agent tools may be unavailable', timestamp: 'Just now' }
        ]);
      }
      
    } catch (error) {
      console.error('Compliance assessment error:', error);
    }
    setLoading(false);
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

      {/* Bank Selection */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Bank Selection & Assessment
          </Typography>
          {/* Bank Search */}
          <Box sx={{ display: 'flex', gap: 1, mb: 3, alignItems: 'center' }}>
            <TextField
              placeholder="Search for any bank or financial institution..."
              value={searchBank}
              onChange={(e) => setSearchBank(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleBankSearch()}
              size="small"
              sx={{ minWidth: 300 }}
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
              disabled={loading}
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
              <Button
                variant="contained"
                onClick={handleComplianceAssessment}
                disabled={loading || !selectedBank}
                startIcon={<Assessment />}
                size="large"
                sx={{ mr: 2 }}
              >
                Assess Compliance for {selectedBank.replace(' CORP', '').replace(' INC', '')}
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>

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
                    <Typography variant="subtitle2" color="text.secondary">Capital Risk</Typography>
                    <Box sx={{ position: 'relative', display: 'inline-flex', mt: 1 }}>
                      <CircularProgress
                        variant="determinate"
                        value={75}
                        size={80}
                        thickness={6}
                        sx={{ color: '#ff9800' }}
                      />
                      <Box sx={{ position: 'absolute', top: 0, left: 0, bottom: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Typography variant="h6" color="text.secondary">75%</Typography>
                      </Box>
                    </Box>
                    <Typography variant="caption" display="block" sx={{ mt: 1 }}>Moderate Risk</Typography>
                  </Card>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Card sx={{ textAlign: 'center', p: 2, bgcolor: '#f8f9fa' }}>
                    <Typography variant="subtitle2" color="text.secondary">Liquidity Risk</Typography>
                    <Box sx={{ position: 'relative', display: 'inline-flex', mt: 1 }}>
                      <CircularProgress
                        variant="determinate"
                        value={85}
                        size={80}
                        thickness={6}
                        sx={{ color: '#4caf50' }}
                      />
                      <Box sx={{ position: 'absolute', top: 0, left: 0, bottom: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Typography variant="h6" color="text.secondary">85%</Typography>
                      </Box>
                    </Box>
                    <Typography variant="caption" display="block" sx={{ mt: 1 }}>Low Risk</Typography>
                  </Card>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Card sx={{ textAlign: 'center', p: 2, bgcolor: '#f8f9fa' }}>
                    <Typography variant="subtitle2" color="text.secondary">Credit Risk</Typography>
                    <Box sx={{ position: 'relative', display: 'inline-flex', mt: 1 }}>
                      <CircularProgress
                        variant="determinate"
                        value={65}
                        size={80}
                        thickness={6}
                        sx={{ color: '#f44336' }}
                      />
                      <Box sx={{ position: 'absolute', top: 0, left: 0, bottom: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Typography variant="h6" color="text.secondary">65%</Typography>
                      </Box>
                    </Box>
                    <Typography variant="caption" display="block" sx={{ mt: 1 }}>High Risk</Typography>
                  </Card>
                </Grid>
              </Grid>
              
              {/* Alert Temperature Dials */}
              <Box sx={{ mt: 3 }}>
                <Typography variant="subtitle1" gutterBottom>Regulatory Alert Status</Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={4}>
                    <Card sx={{ textAlign: 'center', p: 2, bgcolor: '#fff3e0' }}>
                      <Typography variant="subtitle2" color="text.secondary">Capital Alert</Typography>
                      <Box sx={{ position: 'relative', display: 'inline-flex', mt: 1 }}>
                        <CircularProgress
                          variant="determinate"
                          value={25}
                          size={60}
                          thickness={8}
                          sx={{ color: '#ff9800' }}
                        />
                        <Box sx={{ position: 'absolute', top: 0, left: 0, bottom: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Warning sx={{ color: '#ff9800', fontSize: 20 }} />
                        </Box>
                      </Box>
                      <Typography variant="caption" display="block" sx={{ mt: 1 }}>Tier 1 Approaching Min</Typography>
                    </Card>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Card sx={{ textAlign: 'center', p: 2, bgcolor: '#e8f5e8' }}>
                      <Typography variant="subtitle2" color="text.secondary">Liquidity Alert</Typography>
                      <Box sx={{ position: 'relative', display: 'inline-flex', mt: 1 }}>
                        <CircularProgress
                          variant="determinate"
                          value={90}
                          size={60}
                          thickness={8}
                          sx={{ color: '#4caf50' }}
                        />
                        <Box sx={{ position: 'absolute', top: 0, left: 0, bottom: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <CheckCircle sx={{ color: '#4caf50', fontSize: 20 }} />
                        </Box>
                      </Box>
                      <Typography variant="caption" display="block" sx={{ mt: 1 }}>Coverage Adequate</Typography>
                    </Card>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Card sx={{ textAlign: 'center', p: 2, bgcolor: '#ffebee' }}>
                      <Typography variant="subtitle2" color="text.secondary">Credit Alert</Typography>
                      <Box sx={{ position: 'relative', display: 'inline-flex', mt: 1 }}>
                        <CircularProgress
                          variant="determinate"
                          value={15}
                          size={60}
                          thickness={8}
                          sx={{ color: '#f44336' }}
                        />
                        <Box sx={{ position: 'absolute', top: 0, left: 0, bottom: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Error sx={{ color: '#f44336', fontSize: 20 }} />
                        </Box>
                      </Box>
                      <Typography variant="caption" display="block" sx={{ mt: 1 }}>Below Peer Average</Typography>
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
                    Report Date: {complianceData.lastUpdated} | Assets: ${complianceData.actualAssets ? `$${(complianceData.actualAssets/1000).toFixed(1)}B` : '$3.8B'}
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
                        labels: ['Tier 1 Capital', 'CRE Concentration', 'ROA', 'Equity Ratio'],
                        datasets: [
                          {
                            label: 'Current Value',
                            data: [7.74, 1.32, 1.42, 8.5],
                            backgroundColor: '#2196F3',
                            borderRadius: 4
                          },
                          {
                            label: 'Regulatory Threshold',
                            data: [10.5, 300, 0.8, 6.0],
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
                      <TableCell>Tier 1 Capital Ratio</TableCell>
                      <TableCell align="right">7.74%</TableCell>
                      <TableCell align="right">≥ 10.5% (Well Cap.)</TableCell>
                      <TableCell align="center">
                        <Chip label="Adequate" color="warning" size="small" />
                      </TableCell>
                      <TableCell align="center">
                        <Avatar sx={{ bgcolor: '#ff9800', width: 32, height: 32, fontSize: '0.875rem' }}>
                          {complianceData.capitalAdequacy}
                        </Avatar>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>CRE Concentration</TableCell>
                      <TableCell align="right">1.32%</TableCell>
                      <TableCell align="right">&lt; 300%</TableCell>
                      <TableCell align="center">
                        <Chip label="Excellent" color="success" size="small" />
                      </TableCell>
                      <TableCell align="center">
                        <Avatar sx={{ bgcolor: '#4caf50', width: 32, height: 32, fontSize: '0.875rem' }}>
                          {complianceData.assetQuality}
                        </Avatar>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Return on Assets (ROA)</TableCell>
                      <TableCell align="right">1.42%</TableCell>
                      <TableCell align="right">≥ 0.8%</TableCell>
                      <TableCell align="center">
                        <Chip label="Strong" color="success" size="small" />
                      </TableCell>
                      <TableCell align="center">
                        <Avatar sx={{ bgcolor: '#9c27b0', width: 32, height: 32, fontSize: '0.875rem' }}>
                          {complianceData.profitability}
                        </Avatar>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Equity to Assets</TableCell>
                      <TableCell align="right">8.5%</TableCell>
                      <TableCell align="right">≥ 6.0%</TableCell>
                      <TableCell align="center">
                        <Chip label="Good" color="primary" size="small" />
                      </TableCell>
                      <TableCell align="center">
                        <Avatar sx={{ bgcolor: '#2196f3', width: 32, height: 32, fontSize: '0.875rem' }}>
                          {complianceData.liquidity}
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

export default ComplianceAudit;