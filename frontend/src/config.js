// Auto-generated - CloudFront + ECS Backend + Cognito Auth
export const API_URL = 'https://d2haeu881j600d.cloudfront.net';
export const ENVIRONMENT = 'production';
export const CLOUDFRONT_URL = 'https://d2haeu881j600d.cloudfront.net';

export const cognitoConfig = {
  region: 'us-east-1',
  userPoolId: 'us-east-1_K4SV3PC5w',
  userPoolWebClientId: '3qijv8daorp879e59lue18lsa2',
  oauth: {
    domain: 'bankiq-auth-164543933824.auth.us-east-1.amazoncognito.com',
    scope: ['email', 'openid', 'profile'],
    redirectSignIn: 'https://d2haeu881j600d.cloudfront.net',
    redirectSignOut: 'https://d2haeu881j600d.cloudfront.net',
    responseType: 'code'
  }
};
