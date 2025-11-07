// Auto-generated - CloudFront + ECS Backend + Cognito Auth
export const API_URL = 'https://d2zhkx6s151zzk.cloudfront.net';
export const ENVIRONMENT = 'production';
export const CLOUDFRONT_URL = 'https://d2zhkx6s151zzk.cloudfront.net';

export const cognitoConfig = {
  region: 'us-east-1',
  userPoolId: 'us-east-1_ZzRnvmnvS',
  userPoolWebClientId: 'sb5qarkejqsm1ltug8jj033so',
  oauth: {
    domain: 'bankiq-auth-164543933824.auth.us-east-1.amazoncognito.com',
    scope: ['email', 'openid', 'profile'],
    redirectSignIn: 'https://d2zhkx6s151zzk.cloudfront.net',
    redirectSignOut: 'https://d2zhkx6s151zzk.cloudfront.net',
    responseType: 'code'
  }
};
