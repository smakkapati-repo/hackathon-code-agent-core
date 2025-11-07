import React, { useState } from 'react';
import { Typography, Box, Grid, Card, CardContent, Chip, Paper, Button } from '@mui/material';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import AssessmentIcon from '@mui/icons-material/Assessment';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import SecurityIcon from '@mui/icons-material/Security';
import CloudIcon from '@mui/icons-material/Cloud';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

function Home() {
  const [showArch, setShowArch] = useState(false);
  const features = [
    {
      icon: <AnalyticsIcon sx={{ fontSize: 48, color: 'primary.main' }} />,
      title: 'Natural Language Analytics',
      description: 'Just ask questions - AI agent decides which tools to use. No complex forms or dropdowns.',
      status: 'Simplified ✨'
    },
    {
      icon: <AssessmentIcon sx={{ fontSize: 48, color: 'primary.main' }} />,
      title: 'Smart Tool Selection',
      description: 'Claude Sonnet 4.5 automatically picks from 23 specialized banking tools: FDIC data, peer comparison, SEC filings, compliance monitoring, and more',
      status: 'AI-Powered'
    },
    {
      icon: <TrendingUpIcon sx={{ fontSize: 48, color: 'primary.main' }} />,
      title: 'Enterprise-Grade',
      description: 'ECS Fargate deployment with ALB - extended timeouts, auto-scaling, and cloud-native reliability.',
      status: 'AWS-Powered'
    }
  ];

  const stats = [
    { label: 'Banks Available', value: '500+', color: '#146EB4' },
    { label: 'Metrics Tracked', value: '6+', color: '#FF9900' },
    { label: 'Data Sources', value: '3', color: '#146EB4' },
    { label: 'AI Tools', value: '20', color: '#FF9900' }
  ];

  return (
    <Box>
      {/* Hero Section */}
      <Paper 
        elevation={0} 
        sx={{ 
          background: 'linear-gradient(135deg, #146EB4 0%, #232F3E 100%)',
          color: 'white',
          p: 3,
          borderRadius: 2,
          mb: 2
        }}
      >
        <Box textAlign="center" sx={{ maxWidth: '40%', mx: 'auto' }}>
          <AccountBalanceIcon sx={{ fontSize: 48, mb: 1 }} />
          <Typography variant="h3" component="h1" gutterBottom sx={{ fontWeight: 600, mb: 1 }}>
            BankIQ+
          </Typography>
          <Typography variant="h6" sx={{ opacity: 0.9, mb: 2 }}>
            Simplified Banking Analytics - Just Ask Questions!
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
            <Chip 
              icon={<CloudIcon />} 
              label="AWS Bedrock AgentCore" 
              sx={{ 
                backgroundColor: 'rgba(255,255,255,0.2)', 
                color: 'white',
                fontSize: '0.8rem'
              }} 
            />
            <Chip 
              label="Claude Sonnet 4.5" 
              sx={{ 
                backgroundColor: 'rgba(255,255,255,0.2)', 
                color: 'white',
                fontSize: '0.8rem'
              }} 
            />
          </Box>
        </Box>
      </Paper>

      {/* Stats Section */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        {stats.map((stat, index) => (
          <Grid item xs={12} sm={6} md={3} key={index}>
            <Card sx={{ textAlign: 'center', p: 1.5, backgroundColor: stat.color, color: 'white' }}>
              <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>
                {stat.value}
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                {stat.label}
              </Typography>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Features Section */}
      <Grid container spacing={2}>
        {features.map((feature, index) => (
          <Grid item xs={12} md={4} key={index}>
            <Card 
              sx={{ 
                height: '100%',
                p: 2,
                transition: 'all 0.3s ease',
                '&:hover': { 
                  transform: 'translateY(-4px)', 
                  boxShadow: '0 8px 16px rgba(255, 153, 0, 0.15)'
                }
              }}
            >
              <CardContent sx={{ textAlign: 'center', p: 2, '&:last-child': { pb: 2 } }}>
                <Box sx={{ mb: 1 }}>
                  {React.cloneElement(feature.icon, { sx: { fontSize: 32, color: 'primary.main' } })}
                </Box>
                <Typography variant="subtitle1" component="h3" gutterBottom sx={{ fontWeight: 600 }}>
                  {feature.title}
                </Typography>
                <Typography color="text.secondary" sx={{ mb: 1, fontSize: '0.85rem', minHeight: 40 }}>
                  {feature.description}
                </Typography>
                <Chip 
                  label={feature.status}
                  size="small"
                  color={feature.status === 'Coming Soon' ? 'default' : 'primary'}
                  variant={feature.status === 'Coming Soon' ? 'outlined' : 'filled'}
                />
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Architecture */}
      <Box sx={{ mt: 4, textAlign: 'center' }}>
        <Button 
          onClick={() => setShowArch(!showArch)}
          endIcon={showArch ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          sx={{ mb: 2 }}
        >
          {showArch ? 'Hide' : 'Show'} AWS Architecture
        </Button>
        {showArch && (
          <Box 
            component="a" 
            href="/bankiq_plus_agentcore_architecture.png" 
            target="_blank"
            sx={{ 
              display: 'inline-block',
              cursor: 'pointer',
              transition: 'transform 0.2s',
              '&:hover': { transform: 'scale(1.02)' }
            }}
          >
            <img 
              src="/bankiq_plus_agentcore_architecture.png" 
              alt="BankIQ+ Architecture" 
              style={{ maxWidth: '100%', height: 'auto', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
            />
          </Box>
        )}
      </Box>

      {/* Technology Stack */}
      <Box sx={{ mt: 4, p: 2, backgroundColor: '#f8f9fa', borderRadius: 2 }}>
        <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, textAlign: 'center', mb: 2 }}>
          Technology Stack
        </Typography>
        <Grid container spacing={1} justifyContent="center">
          {['AWS Bedrock AgentCore', 'Claude Sonnet 4.5', 'OpenSearch Serverless', 'Strands Framework', 'Express.js', 'ECS Fargate', 'FDIC API', 'SEC EDGAR', 'React', 'Material-UI'].map((tech) => (
            <Grid item key={tech}>
              <Chip 
                label={tech} 
                variant="outlined" 
                size="small"
                sx={{ 
                  borderColor: 'primary.main',
                  color: 'primary.main',
                  fontWeight: 500
                }}
              />
            </Grid>
          ))}
        </Grid>
      </Box>
    </Box>
  );
}

export default Home;