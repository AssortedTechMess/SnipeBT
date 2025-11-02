import dotenv from 'dotenv'; dotenv.config();
import { TwitterApi, ApiResponseError } from 'twitter-api-v2';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface TokenTestResult {
  tokenType: string;
  isValid: boolean;
  permissions: string[];
  error?: string;
}

const testEndpoints = async (client: TwitterApi): Promise<string[]> => {
  const permissions = [];
  
  // Test different endpoints to determine permissions
  try {
    await client.v2.search('test');
    permissions.push('tweet.read');
  } catch (e) {
    if (!(e instanceof ApiResponseError && e.code === 429)) {
      // Only add to errors if it's not a rate limit issue
      console.log('Search access denied');
    }
  }

  try {
    await client.v2.userByUsername('twitter');
    permissions.push('users.read');
  } catch (e) {
    if (!(e instanceof ApiResponseError && e.code === 429)) {
      console.log('User lookup access denied');
    }
  }

  return permissions;
};

const testToken = async () => {
  const results: TokenTestResult[] = [];
  
  try {
    console.log('🔍 Testing Twitter API tokens...\n');

    // Test Bearer Token
    const bearerToken = process.env.TWITTER_BEARER_TOKEN;
    if (bearerToken) {
      console.log('Testing Bearer Token...');
      try {
        const client = new TwitterApi(bearerToken);
        const permissions = await testEndpoints(client);
        results.push({
          tokenType: 'Bearer Token',
          isValid: true,
          permissions
        });
        console.log('✅ Bearer Token is valid!');
      } catch (e) {
        results.push({
          tokenType: 'Bearer Token',
          isValid: false,
          permissions: [],
          error: e instanceof ApiResponseError ? `${e.message} (HTTP ${e.code})` : 'Unknown error'
        });
        console.log('❌ Bearer Token is invalid');
      }
    } else {
      console.log('⚠️ TWITTER_BEARER_TOKEN not found in .env');
    }

    // Test API Key & Secret
    const apiKey = process.env.TWITTER_API_KEY;
    const apiSecret = process.env.TWITTER_API_SECRET;
    if (apiKey && apiSecret) {
      console.log('\nTesting API Key & Secret...');
      try {
        const client = new TwitterApi({ appKey: apiKey, appSecret: apiSecret });
        const permissions = await testEndpoints(client);
        results.push({
          tokenType: 'API Key & Secret',
          isValid: true,
          permissions
        });
        console.log('✅ API Key & Secret are valid!');
      } catch (e) {
        results.push({
          tokenType: 'API Key & Secret',
          isValid: false,
          permissions: [],
          error: e instanceof ApiResponseError ? `${e.message} (HTTP ${e.code})` : 'Unknown error'
        });
        console.log('❌ API Key & Secret are invalid');
      }
    } else {
      console.log('⚠️ TWITTER_API_KEY and/or TWITTER_API_SECRET not found in .env');
    }

    // Test OAuth tokens
    const accessToken = process.env.TWITTER_ACCESS_TOKEN;
    const accessSecret = process.env.TWITTER_ACCESS_TOKEN_SECRET;
    if (accessToken && accessSecret && apiKey && apiSecret) {
      console.log('\nTesting OAuth Access Tokens...');
      try {
        const client = new TwitterApi({
          appKey: apiKey,
          appSecret: apiSecret,
          accessToken: accessToken,
          accessSecret: accessSecret,
        });
        const permissions = await testEndpoints(client);
        results.push({
          tokenType: 'OAuth Tokens',
          isValid: true,
          permissions
        });
        console.log('✅ OAuth Tokens are valid!');
      } catch (e) {
        results.push({
          tokenType: 'OAuth Tokens',
          isValid: false,
          permissions: [],
          error: e instanceof ApiResponseError ? `${e.message} (HTTP ${e.code})` : 'Unknown error'
        });
        console.log('❌ OAuth Tokens are invalid');
      }
    } else {
      console.log('⚠️ One or more OAuth tokens not found in .env');
    }

    // Print summary
    console.log('\n📋 Token Validation Summary:');
    results.forEach(result => {
      console.log(`\n${result.tokenType}:`);
      console.log(`Status: ${result.isValid ? '✅ Valid' : '❌ Invalid'}`);
      if (result.isValid) {
        console.log('Permissions:', result.permissions.length ? result.permissions.join(', ') : 'None detected');
      }
      if (result.error) {
        console.log('Error:', result.error);
      }
    });

    // Provide guidance based on results
    console.log('\n� Recommendations:');
    const validTokens = results.filter(r => r.isValid);
    if (validTokens.length === 0) {
      console.log('- No valid tokens found. Please check your Twitter Developer Portal for correct tokens');
      console.log('- Ensure your App permissions include "Read and Write"');
      console.log('- Verify that your tokens have not expired');
    } else {
      console.log(`- You have ${validTokens.length} valid token(s)`);
      const permissions = new Set(validTokens.flatMap(t => t.permissions));
      if (!permissions.has('tweet.read')) {
        console.log('- Your tokens may not have read permissions. Check App permissions in Developer Portal');
      }
    }

  } catch (error: unknown) {
    if (error instanceof ApiResponseError) {
      console.error('\n❌ Error:', error.message);
      if (error.code === 429) {
        console.log('\n⚠️ Rate limited! Please wait before trying again.');
      }
      if (error.rateLimit) {
        console.error('Rate Limit Info:', {
          limit: error.rateLimit.limit,
          remaining: error.rateLimit.remaining,
          reset: new Date(error.rateLimit.reset * 1000).toLocaleString()
        });
      }
    } else {
      console.error('\n❌ Unexpected error:', error);
    }
  }
};

// Run the token tests
testToken();