// Auto-generated - CloudFront + ECS Backend + Cognito Auth
export const API_URL = 'https://d2smwdhp2y7yl8.cloudfront.net';
export const ENVIRONMENT = 'production';
export const CLOUDFRONT_URL = 'https://d2smwdhp2y7yl8.cloudfront.net';

export const cognitoConfig = {
  region: 'us-east-1',
  userPoolId: 'us-east-1_qlYlDpXeY',
  userPoolWebClientId: '1ieq498927740b5p5alci3m9nh',
  oauth: {
    domain: 'bankiq-auth-164543933824.auth.us-east-1.amazoncognito.com',
    scope: ['email', 'openid', 'profile'],
    redirectSignIn: 'https://d2smwdhp2y7yl8.cloudfront.net',
    redirectSignOut: 'https://d2smwdhp2y7yl8.cloudfront.net',
    responseType: 'code'
  }
};
