// Test Birdeye rate limits
require('dotenv').config();
const axios = require('axios');

async function testRateLimits() {
    console.log('🧪 Testing Birdeye rate limits...\n');
    
    const key = process.env.BIRDEYE_API_KEY;
    let successCount = 0;
    let failCount = 0;
    
    const startTime = Date.now();
    
    // Try 20 rapid requests
    console.log('Sending 20 rapid requests...');
    for (let i = 0; i < 20; i++) {
        try {
            await axios.get('https://public-api.birdeye.so/defi/tokenlist', {
                headers: { 'X-API-KEY': key },
                params: { limit: 1 }
            });
            successCount++;
            process.stdout.write('✅');
        } catch (error) {
            failCount++;
            if (error.response?.status === 429) {
                process.stdout.write('🔴');
            } else {
                process.stdout.write('❌');
            }
        }
    }
    
    const elapsed = Date.now() - startTime;
    
    console.log('\n\n📊 Results:');
    console.log(`  Success: ${successCount}/20`);
    console.log(`  Rate Limited: ${failCount}/20`);
    console.log(`  Time: ${elapsed}ms`);
    console.log(`  Rate: ${(successCount / (elapsed / 1000)).toFixed(1)} req/sec`);
    
    if (failCount === 0) {
        console.log('\n✅ Likely PRO tier or better (no rate limits hit)');
        console.log('   Estimated time for 1M examples: 12-16 hours');
    } else if (failCount > 10) {
        console.log('\n⚠️  Likely FREE tier (heavy rate limiting)');
        console.log('   Estimated time for 1M examples: 5-7 DAYS');
        console.log('   Recommendation: Upgrade to Pro or collect smaller dataset');
    } else {
        console.log('\n🤔 Mixed results - somewhere between Free and Pro');
        console.log('   Estimated time for 1M examples: 1-3 days');
    }
}

testRateLimits();
