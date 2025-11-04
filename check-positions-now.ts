import { getHeldPositions, getEntryPrice } from './src/positionManager';
import axios from 'axios';

async function checkPositions() {
  console.log('🔍 Checking current positions...\n');
  
  const positions = await getHeldPositions();
  
  if (positions.length === 0) {
    console.log('No positions held');
    return;
  }
  
  console.log(`Found ${positions.length} positions:\n`);
  
  for (const pos of positions) {
    const entryPrice = getEntryPrice(pos.mint);
    
    // Get current price from Dexscreener
    let currentPrice = 0;
    try {
      const res = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${pos.mint}`, { timeout: 5000 });
      if (res.data?.pairs?.[0]?.priceUsd) {
        currentPrice = parseFloat(res.data.pairs[0].priceUsd);
      }
    } catch (e) {
      console.log(`Failed to fetch price for ${pos.mint}`);
    }
    
    const profitPct = entryPrice && currentPrice ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0;
    const profitEmoji = profitPct > 0 ? '🟢' : profitPct < 0 ? '🔴' : '⚪';
    
    console.log(`${profitEmoji} Token: ${pos.mint.substring(0, 8)}...`);
    console.log(`   Amount: ${pos.uiAmount.toFixed(4)}`);
    console.log(`   Entry: $${entryPrice?.toFixed(6) || 'Unknown'}`);
    console.log(`   Current: $${currentPrice.toFixed(6)}`);
    console.log(`   P&L: ${profitPct >= 0 ? '+' : ''}${profitPct.toFixed(2)}%`);
    console.log('');
  }
}

checkPositions().catch(console.error);
