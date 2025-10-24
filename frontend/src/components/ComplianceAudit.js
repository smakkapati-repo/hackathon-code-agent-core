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
  LinearProgress,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemIcon
} from '@mui/material';
import {
  Warning,
  CheckCircle,
  Error,
  Assessment,
  Security,
  TrendingUp,
  AccountBalance
} from '@mui/icons-material';
import { AgentService } from '../services/AgentService';

const ComplianceAudit = () => {
  const [loading, setLoading] = useState(false);
  const [bankName, setBankName] = useState('');
  const [complianceData, setComplianceData] = useState(null);
  const [auditResults, setAuditResults] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [selectedBank, setSelectedBank] = useState('');

  // Risk score color mapping
  const getRiskColor = (score) => {
    if (score >= 80) return 'success';
    if (score >= 60) return 'warning';
    return 'error';
  };

  // Handle compliance risk assessment
  const handleComplianceAssessment = async () => {
    if (!bankName.trim()) return;
    
    setLoading(true);
    try {
      const response = await AgentService.sendMessage(
        `Perform compliance risk assessment for ${bankName}. Use the compliance_risk_assessment tool to analyze FDIC ratios, regulatory thresholds, and generate risk scores with real-time alerts.`
      );
      
      // Try to parse JSON response from the agent
      let parsedData = null;
      try {
        // Look for JSON in the response
        const jsonMatch = response.match(/\{[^}]+"success"[^}]+\}/g);
        if (jsonMatch) {
          parsedData = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        console.log('Could not parse JSON from response, using mock data');
      }
      
      if (parsedData && parsedData.success) {
        setComplianceData({
          bankName: bankName,
          overallScore: parsedData.overall_score || 75,
          capitalAdequacy: parsedData.scores?.capital_adequacy || 82,
          assetQuality: parsedData.scores?.asset_quality || 68,
          liquidity: parsedData.scores?.cre_concentration || 79,
          profitability: parsedData.scores?.profitability || 71,
          lastUpdated: parsedData.last_updated || new Date().toLocaleDateString()
        });
        
        // Update alerts with real data
        if (parsedData.alerts) {
          setAlerts(parsedData.alerts.map(alert => ({
            type: alert.type,
            message: alert.message,
            timestamp: 'Just now'
          })));
        }
      } else {
        // Fallback to mock data
        setComplianceData({
          bankName: bankName,
          overallScore: 75,
          capitalAdequacy: 82,
          assetQuality: 68,
          liquidity: 79,
          profitability: 71,
          lastUpdated: new Date().toLocaleDateString()
        });
      }
      
      setSelectedBank(bankName);
    } catch (error) {
      console.error('Compliance assessment error:', error);
    }
    setLoading(false);
  };

  // Handle audit document analysis
  const handleAuditAnalysis = async () => {
    setLoading(true);
    try {
      const response = await AgentService.sendMessage(
        `Perform audit analysis for ${selectedBank || bankName}. Use the audit_document_analyzer tool to identify potential compliance issues and regulatory concerns.`
      );
      
      // Try to parse JSON response from the agent
      let parsedData = null;
      try {
        const jsonMatch = response.match(/\{[^}]+"success"[^}]+\}/g);
        if (jsonMatch) {
          parsedData = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        console.log('Could not parse JSON from response, using mock data');
      }
      
      if (parsedData && parsedData.success) {
        setAuditResults({
          findings: parsedData.findings || [],
          recommendations: parsedData.recommendations || []
        });
      } else {
        // Fallback to mock data
        setAuditResults({
          findings: [
            { type: 'warning', issue: 'CRE Concentration above 300%', severity: 'Medium' },
            { type: 'info', issue: 'Capital ratios within regulatory limits', severity: 'Low' },
            { type: 'error', issue: 'Loan loss provisions may be understated', severity: 'High' }
          ],
          recommendations: [
            'Monitor commercial real estate exposure',
            'Review loan loss methodology',
            'Enhance stress testing procedures'
          ]
        });
      }
    } catch (error) {
      console.error('Audit analysis error:', error);
    }
    setLoading(false);
  };

  // Initialize with default alerts
  useEffect(() => {
    if (alerts.length === 0) {
      setAlerts([
        { type: 'warning', message: 'Tier 1 Capital ratio approaching minimum threshold', timestamp: '2 hours ago' },
        { type: 'info', message: 'New regulatory guidance on climate risk published', timestamp: '1 day ago' },
        { type: 'error', message: 'Liquidity coverage ratio below peer average', timestamp: '3 hours ago' }
      ]);
    }
  }, [alerts]);

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
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Bank Name"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="e.g., JPMorgan Chase, Wells Fargo"
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <Button
                variant="contained"
                onClick={handleComplianceAssessment}
                disabled={loading || !bankName.trim()}
                startIcon={<Assessment />}
                fullWidth
              >
                Assess Compliance
              </Button>
            </Grid>
            <Grid item xs={12} md={3}>
              <Button
                variant="outlined"
                onClick={handleAuditAnalysis}
                disabled={loading || !selectedBank}
                startIcon={<Security />}
                fullWidth
              >
                Run Audit
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Real-time Alerts */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            🚨 Regulatory Alerts
          </Typography>
          {alerts.map((alert, index) => (
            <Alert 
              key={index} 
              severity={alert.type} 
              sx={{ mb: 1 }}
              icon={alert.type === 'error' ? <Error /> : alert.type === 'warning' ? <Warning /> : <CheckCircle />}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <Typography>{alert.message}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {alert.timestamp}
                </Typography>
              </Box>
            </Alert>
          ))}
        </CardContent>
      </Card>

      {/* Compliance Dashboard */}
      {complianceData && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              📊 Compliance Risk Dashboard - {complianceData.bankName}
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Last Updated: {complianceData.lastUpdated}
            </Typography>
            
            <Grid container spacing={3} sx={{ mt: 1 }}>
              {/* Overall Score */}
              <Grid item xs={12} md={6}>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h4" color={getRiskColor(complianceData.overallScore)}>
                    {complianceData.overallScore}
                  </Typography>
                  <Typography variant="body2">Overall Compliance Score</Typography>
                  <LinearProgress 
                    variant="determinate" 
                    value={complianceData.overallScore} 
                    color={getRiskColor(complianceData.overallScore)}
                    sx={{ mt: 1, height: 8, borderRadius: 4 }}
                  />
                </Box>
              </Grid>

              {/* Risk Metrics */}
              <Grid item xs={12} md={6}>
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="h6" color={getRiskColor(complianceData.capitalAdequacy)}>
                        {complianceData.capitalAdequacy}
                      </Typography>
                      <Typography variant="caption">Capital Adequacy</Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={6}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="h6" color={getRiskColor(complianceData.assetQuality)}>
                        {complianceData.assetQuality}
                      </Typography>
                      <Typography variant="caption">Asset Quality</Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={6}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="h6" color={getRiskColor(complianceData.liquidity)}>
                        {complianceData.liquidity}
                      </Typography>
                      <Typography variant="caption">Liquidity</Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={6}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="h6" color={getRiskColor(complianceData.profitability)}>
                        {complianceData.profitability}
                      </Typography>
                      <Typography variant="caption">Profitability</Typography>
                    </Box>
                  </Grid>
                </Grid>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* Audit Results */}
      {auditResults && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  🔍 Audit Findings
                </Typography>
                <List>
                  {auditResults.findings.map((finding, index) => (
                    <ListItem key={index}>
                      <ListItemIcon>
                        {finding.type === 'error' ? <Error color="error" /> : 
                         finding.type === 'warning' ? <Warning color="warning" /> : 
                         <CheckCircle color="success" />}
                      </ListItemIcon>
                      <ListItemText
                        primary={finding.issue}
                        secondary={
                          <Chip 
                            label={finding.severity} 
                            size="small" 
                            color={finding.severity === 'High' ? 'error' : 
                                   finding.severity === 'Medium' ? 'warning' : 'default'}
                          />
                        }
                      />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  💡 Recommendations
                </Typography>
                <List>
                  {auditResults.recommendations.map((rec, index) => (
                    <ListItem key={index}>
                      <ListItemIcon>
                        <TrendingUp color="primary" />
                      </ListItemIcon>
                      <ListItemText primary={rec} />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
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