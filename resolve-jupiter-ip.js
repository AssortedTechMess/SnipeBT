// Simple script to resolve Jupiter API IP using DNS-over-HTTPS
const https = require('https');

async function queryDNS(hostname, type = 'A') {
  return new Promise((resolve, reject) => {
    https.get(`https://dns.google/resolve?name=${hostname}&type=${type}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function resolveJupiterIP() {
  console.log('Checking quote-api.jup.ag CNAME...');
  const cnameResp = await queryDNS('quote-api.jup.ag', 'CNAME');
  console.log('CNAME Response:', JSON.stringify(cnameResp, null, 2));
  
  if (cnameResp.Answer && cnameResp.Answer.length > 0) {
    const cname = cnameResp.Answer[0].data;
    console.log('\n✓ Found CNAME:', cname);
    console.log('\nResolving CNAME to IP...');
    const aResp = await queryDNS(cname.replace(/\.$/, ''), 'A');
    console.log('A Record Response:', JSON.stringify(aResp, null, 2));
    
    if (aResp.Answer && aResp.Answer.length > 0) {
      const ip = aResp.Answer[0].data;
      console.log('\n✓ Jupiter API IP:', ip);
      console.log('\nAdd this to your .env file:');
      console.log(`JUPITER_QUOTE_IP=${ip}`);
      return ip;
    }
  }
  
  console.log('\nTrying direct A record...');
  const aResp = await queryDNS('quote-api.jup.ag', 'A');
  console.log('A Record Response:', JSON.stringify(aResp, null, 2));
  
  if (aResp.Answer && aResp.Answer.length > 0) {
    const ip = aResp.Answer[0].data;
    console.log('\n✓ Jupiter API IP:', ip);
    console.log('\nAdd this to your .env file:');
    console.log(`JUPITER_QUOTE_IP=${ip}`);
    return ip;
  }
  
  throw new Error('Could not resolve Jupiter API IP');
}

resolveJupiterIP().catch(err => {
  console.error('\n✗ Error:', err.message);
  console.log('\n⚠️  Jupiter API may be using dynamic DNS/CDN.');
  console.log('Recommendation: Fix system DNS settings instead.');
  console.log('See DEPLOYMENT.md for instructions.');
  process.exit(1);
});
