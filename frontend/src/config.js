// Auto-generated - CloudFront + ECS Backend + Cognito Auth
export const API_URL = 'https://d3mi0x1n2ild0s.cloudfront.net';
export const ENVIRONMENT = 'production';
export const CLOUDFRONT_URL = 'https://d3mi0x1n2ild0s.cloudfront.net';

export const cognitoConfig = {
  region: 'us-east-1',
  userPoolId: 'us-east-1_ZzRnvmnvS',
  userPoolWebClientId: 'sb5qarkejqsm1ltug8jj033so',
  oauth: {
    domain: 'bankiq-auth-164543933824.auth.us-east-1.amazoncognito.com',
    scope: ['email', 'openid', 'profile'],
    redirectSignIn: 'https://d3mi0x1n2ild0s.cloudfront.net',
    redirectSignOut: 'https://d3mi0x1n2ild0s.cloudfront.net',
    responseType: 'code'
  }
};
