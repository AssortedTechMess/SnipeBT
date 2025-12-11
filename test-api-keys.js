// Quick API Key Verification Script
// Run: node test-api-keys.js

require('dotenv').config();
const axios = require('axios');

async function testAPIs() {
    console.log('🔍 Testing API Keys...\n');
    
    // Check environment variables
    console.log('📋 Environment Variables:');
    const birdeyeKey = process.env.BIRDEYE_API_KEY;
    console.log(`  BIRDEYE_API_KEY: ${birdeyeKey ? `✅ Set (${birdeyeKey.length} chars, starts with ${birdeyeKey.substring(0, 8)}...)` : '❌ NOT SET'}`);
    console.log('');
    
    if (!birdeyeKey) {
        console.error('❌ CRITICAL: BIRDEYE_API_KEY not set!');
        console.error('   Add it to your .env file: BIRDEYE_API_KEY=your_key_here');
        process.exit(1);
    }
    
    // Test Dexscreener (no key needed)
    console.log('🧪 Testing Dexscreener API (FREE, no key needed)...');
    try {
        const response = await axios.get('https://api.dexscreener.com/latest/dex/tokens/solana/trending', {
            timeout: 10000
        });
        if (response.data && response.data.pairs) {
            console.log(`✅ Dexscreener: Working! Found ${response.data.pairs.length} trending tokens`);
            console.log(`   Sample token: ${response.data.pairs[0]?.baseToken.symbol} (${response.data.pairs[0]?.baseToken.address})`);
        } else {
            console.log('⚠️  Dexscreener: Response format unexpected');
        }
    } catch (error) {
        console.error(`❌ Dexscreener: Failed - ${error.message}`);
    }
    console.log('');
    
    // Test Birdeye Token List
    console.log('🧪 Testing Birdeye API (Token List)...');
    try {
        const response = await axios.get('https://public-api.birdeye.so/defi/tokenlist', {
            headers: { 'X-API-KEY': birdeyeKey },
            params: {
                sort_by: 'v24hUSD',
                sort_type: 'desc',
                offset: 0,
                limit: 10
            },
            timeout: 10000
        });
        
        if (response.data && response.data.success) {
            const tokens = response.data.data?.tokens || [];
            console.log(`✅ Birdeye Token List: Working! Found ${tokens.length} tokens`);
            if (tokens.length > 0) {
                console.log(`   Sample token: ${tokens[0].symbol} (${tokens[0].address})`);
                console.log(`   Liquidity: $${tokens[0].liquidity?.toLocaleString() || 'N/A'}`);
            }
        } else {
            console.log('⚠️  Birdeye: Response indicates failure');
            console.log(`   Message: ${response.data.message || 'Unknown error'}`);
        }
    } catch (error) {
        if (error.response?.status === 401) {
            console.error('❌ Birdeye: INVALID API KEY! (401 Unauthorized)');
            console.error('   Your key may be expired or incorrect');
        } else if (error.response?.status === 429) {
            console.error('⚠️  Birdeye: Rate limit hit (429)');
            console.error('   Key is valid but you\'re being rate limited');
        } else {
            console.error(`❌ Birdeye Token List: Failed - ${error.message}`);
        }
    }
    console.log('');
    
    // Test Birdeye OHLCV (most important for data collection)
    console.log('🧪 Testing Birdeye API (OHLCV Candles) - CRITICAL TEST...');
    // Use a known Solana token (SOL/USDC)
    const testToken = 'So11111111111111111111111111111111111111112';
    try {
        const response = await axios.get('https://public-api.birdeye.so/defi/ohlcv', {
            headers: { 'X-API-KEY': birdeyeKey },
            params: {
                address: testToken,
                type: '5m',
                time_from: Math.floor(Date.now() / 1000) - (7 * 86400), // Last 7 days
                time_to: Math.floor(Date.now() / 1000)
            },
            timeout: 15000
        });
        
        if (response.data && response.data.success) {
            const candles = response.data.data?.items || [];
            console.log(`✅ Birdeye OHLCV: Working! Got ${candles.length} candles`);
            if (candles.length > 0) {
                const latest = candles[candles.length - 1];
                console.log(`   Latest candle: O=${latest.o} H=${latest.h} L=${latest.l} C=${latest.c}`);
            }
            console.log('   🎉 DATA COLLECTION WILL WORK!');
        } else {
            console.log('⚠️  Birdeye OHLCV: Response indicates failure');
            console.log(`   Message: ${response.data.message || 'Unknown error'}`);
        }
    } catch (error) {
        if (error.response?.status === 401) {
            console.error('❌ Birdeye OHLCV: INVALID API KEY! (401 Unauthorized)');
            console.error('   ⚠️  DATA COLLECTION WILL FAIL!');
        } else if (error.response?.status === 429) {
            console.error('⚠️  Birdeye OHLCV: Rate limit hit (429)');
            console.error('   Key is valid but you\'re being rate limited');
            console.error('   Wait a bit or upgrade your plan');
        } else {
            console.error(`❌ Birdeye OHLCV: Failed - ${error.message}`);
        }
    }
    console.log('');
    
    // Summary
    console.log('=' .repeat(60));
    console.log('📊 SUMMARY:');
    console.log('=' .repeat(60));
    console.log('Data Sources for Collection:');
    console.log('  1. Dexscreener (Token Discovery): FREE, no key needed');
    console.log('  2. Birdeye (Token Discovery + Candles): Requires valid key');
    console.log('');
    console.log('Critical Requirements:');
    console.log(`  ✅ BIRDEYE_API_KEY: ${birdeyeKey ? 'Configured' : '❌ MISSING'}`);
    console.log('');
    console.log('What Data Collector Needs:');
    console.log('  1. Token addresses (from Dexscreener + Birdeye)');
    console.log('  2. OHLCV candles (from Birdeye) ← MOST IMPORTANT');
    console.log('  3. Liquidity/market cap metadata (from both)');
    console.log('');
    console.log('If all tests passed above, you\'re ready to collect data! 🚀');
    console.log('=' .repeat(60));
}

testAPIs().catch(console.error);
