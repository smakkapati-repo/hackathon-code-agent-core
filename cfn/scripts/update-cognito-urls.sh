#!/bin/bash
set -e

CLOUDFRONT_URL=$1

if [ -z "$CLOUDFRONT_URL" ]; then
  echo "Usage: ./update-cognito-urls.sh <cloudfront-url>"
  exit 1
fi

USER_POOL_ID=$(aws cognito-idp list-user-pools --max-results 10 --query "UserPools[?contains(Name, 'bankiq')].Id" --output text)
CLIENT_ID=$(aws cognito-idp list-user-pool-clients --user-pool-id $USER_POOL_ID --query "UserPoolClients[0].ClientId" --output text)

aws cognito-idp update-user-pool-client \
  --user-pool-id $USER_POOL_ID \
  --client-id $CLIENT_ID \
  --callback-urls "$CLOUDFRONT_URL" "$CLOUDFRONT_URL/callback" \
  --logout-urls "$CLOUDFRONT_URL" \
  --allowed-o-auth-flows "code" \
  --allowed-o-auth-scopes "openid" "email" "profile" \
  --allowed-o-auth-flows-user-pool-client

echo "✅ Cognito callback URLs updated"
