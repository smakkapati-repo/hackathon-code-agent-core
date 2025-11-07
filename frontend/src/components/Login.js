import React from 'react';
import { Box, Paper, Button, Typography } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import CloudIcon from '@mui/icons-material/Cloud';

const Login = ({ onCognitoLogin }) => {

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #232F3E 0%, #146EB4 100%)',
      }}
    >
      <Paper
        elevation={3}
        sx={{
          p: 4,
          maxWidth: 400,
          width: '100%',
          textAlign: 'center',
        }}
      >
        <LockOutlinedIcon sx={{ fontSize: 48, color: '#FF9900', mb: 2 }} />
        <Typography variant="h4" gutterBottom sx={{ fontWeight: 600 }}>
          BankIQ+ Login
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Secure authentication powered by AWS Cognito
        </Typography>

        <Button
          variant="contained"
          fullWidth
          onClick={onCognitoLogin}
          startIcon={<CloudIcon />}
          sx={{
            mt: 2,
            backgroundColor: '#FF9900',
            '&:hover': { backgroundColor: '#EC7211' },
          }}
        >
          Sign In with AWS Cognito
        </Button>
        
        <Typography variant="caption" color="text.secondary" sx={{ mt: 3, display: 'block' }}>
          New users can sign up on the login page
        </Typography>
      </Paper>
    </Box>
  );
};

export default Login;
