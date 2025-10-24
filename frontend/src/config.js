// Auto-generated - CloudFront + ECS Backend + Cognito Auth
export const API_URL = 'https://d3w2c0inpin7jn.cloudfront.net';
export const ENVIRONMENT = 'production';
export const CLOUDFRONT_URL = 'https://d3w2c0inpin7jn.cloudfront.net';

export const cognitoConfig = {
  region: 'us-east-1',
  userPoolId: 'us-east-1_Dy0pEmnBZ',
  userPoolWebClientId: '2sm58tsg6oc3mfu4mi7ifr5hvv',
  oauth: {
    domain: 'bankiq-auth-164543933824.auth.us-east-1.amazoncognito.com',
    scope: ['email', 'openid', 'profile'],
    redirectSignIn: 'https://d3w2c0inpin7jn.cloudfront.net',
    redirectSignOut: 'https://d3w2c0inpin7jn.cloudfront.net',
    responseType: 'code'
  }
};
