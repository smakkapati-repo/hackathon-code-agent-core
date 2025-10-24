// Auto-generated - CloudFront + ECS Backend + Cognito Auth
export const API_URL = 'https://dcrp3vuinje2l.cloudfront.net';
export const ENVIRONMENT = 'production';
export const CLOUDFRONT_URL = 'https://dcrp3vuinje2l.cloudfront.net';

export const cognitoConfig = {
  region: 'us-east-1',
  userPoolId: 'us-east-1_BLCIwJMAa',
  userPoolWebClientId: '4ngl5glp78ltq4ju197jl4pte3',
  oauth: {
    domain: 'bankiq-auth-164543933824.auth.us-east-1.amazoncognito.com',
    scope: ['email', 'openid', 'profile'],
    redirectSignIn: 'https://dcrp3vuinje2l.cloudfront.net',
    redirectSignOut: 'https://dcrp3vuinje2l.cloudfront.net',
    responseType: 'code'
  }
};
