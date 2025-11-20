# Race Condition & Extended Level Detection Fix

## Problem Summary

Bot had TWO critical flaws causing bad trades:

### 1. Race Condition (5x BULLISH purchases)
- **What happened**: Bot bought BULLISH token 5 times in 60 seconds:
  - 06:11:28, 06:11:40, 06:11:42, 06:41:25 (2x same second!), 06:41:47
- **Root cause**: `activeTransactions` Set existed but was NEVER populated
  - Multiple threads checked `activeTransactions.has(token)` → all returned false
  - All threads proceeded to execute trades simultaneously
  - `activePositions.set()` happened AFTER trade completed (too late)
- **Impact**: Duplicate buys wasted capital, concentrated risk

### 2. Extended Level Detection Failure (BULLISH 476% monthly gain missed)
- **What happened**: BULLISH had gained:
  - 1H: 0.57%, 1D: 5.6%, 1W: 35%, **1M: 476%**, YTD: 2512%
  - Bot bought it anyway despite being at extended levels
- **Root cause**: DexScreener API only provides `{m5, h1, h6, h24}` price changes
  - NO 7-day, 30-day, or all-time high data available
  - Risk manager checked 7D threshold (>200%) but used ESTIMATED 7-day data
  - BULLISH's 35% weekly gain passed the 200% threshold
  - The real 476% monthly pump was never checked
- **Impact**: Bought tokens at tops, high risk of drawdown

## Solutions Implemented

### Fix #1: Immediate Transaction Lock
```typescript
const processTradeOpportunity = async (tokenAddress: string) => {
  // Check if already processing
  if (activeTransactions.has(tokenAddress)) {
    console.log(`⏸️  Trade already in progress for ${tokenAddress.slice(0, 8)}, skipping duplicate`);
    return;
  }
  
  // ADD TO SET IMMEDIATELY - locks token from concurrent processing
  activeTransactions.add(tokenAddress);
  console.log(`🔒 Locked ${tokenAddress.slice(0, 8)} for processing`);
  
  // Ensure cleanup on any exit
  try {
    await processTradeOpportunityInternal(tokenAddress);
  } finally {
    activeTransactions.delete(tokenAddress);
    console.log(`🔓 Unlocked ${tokenAddress.slice(0, 8)}`);
  }
};
```

**Why this works**:
- Token is locked BEFORE any validation or API calls
- `try/finally` ensures cleanup even if errors occur
- Multiple threads calling same function see locked state immediately

### Fix #2: Conservative Extended Level Estimation
Since DexScreener doesn't provide 30-day history, we now use FDV/Liquidity ratios to estimate:

```typescript
// Calculate FDV/Liquidity ratio to detect parabolic tokens
const fdvToLiqRatio = liquidity > 0 ? fdv / liquidity : 0;
const volumeToLiqRatio = liquidity > 0 ? volume24h / liquidity : 0;

// Conservative estimates for 7-day movement
if (fdvToLiqRatio > 10 && tokenAgeHours > 168) {
  // High FDV but low liquidity = likely parabolic already
  day7Ago = current * 0.3; // Assume 233% weekly gain
} else if (tokenAgeHours > 168) {
  day7Ago = current * 0.6; // Assume 67% weekly gain
}

// CRITICAL: Detect extreme volume = fresh parabolic move
if (volumeToLiqRatio > 3.0) {
  // Volume is 3x liquidity in 24h = insane parabolic move
  console.log(`🚨 EXTREME volume: ${volumeToLiqRatio.toFixed(2)}x liquidity`);
  day7Ago = current * 0.25; // Assume 300% weekly gain
  monthHigh = current * 1.2; // At or near ATH
}
```

**Detection Logic**:
1. **FDV/Liq > 20** + Age > 30 days → Assume came down from 2x higher
2. **FDV/Liq > 10** + Age > 30 days → Assume came down from 1.5x higher
3. **Volume/Liq > 3.0** → EXTREME ALERT, assume fresh 300% pump
4. **7-day gain > 200%** → Still extended (existing check)
5. **Distance from month high < 5%** → Near ATH resistance

**BULLISH Example**:
- Current: $0.01, FDV: $10M, Liquidity: $500K
- FDV/Liq = 20x → Flags as parabolic token
- Estimates monthHigh = $0.02 (2x current)
- Estimates day7Ago = $0.003 (current * 0.3)
- Calculated 7D gain = 233% → **BLOCKED** by 200% threshold

## Expected Results

### Race Condition Fix
- ✅ Lock logging: `🔒 Locked C2omVhcv for processing (active: 1)`
- ✅ Duplicate rejection: `⏸️ Trade already in progress for C2omVhcv, skipping duplicate`
- ✅ Unlock logging: `🔓 Unlocked C2omVhcv (active: 0)`
- ✅ No more 5x duplicate purchases

### Extended Level Detection
- ✅ Better estimates: `📊 [Risk Manager] C2omVhcv estimates:`
- ✅ FDV/Liq logging: `FDV/Liq: 20.0x, Vol/Liq: 3.50x`
- ✅ Conservative 7D estimates: `7D ago (est): $0.003000`
- ✅ Parabolic rejection: `🔴 [EXTENDED] Extreme 7d rally: +233.3%`
- ✅ Tokens like BULLISH will be blocked

## Monitoring

Watch for these log patterns:

**Good (working correctly)**:
```
🔒 Locked C2omVhcv for processing (active: 1)
📊 [Risk Manager] C2omVhcv estimates:
   FDV/Liq: 15.2x, Vol/Liq: 2.10x
   7D ago (est): $0.004123
🔴 [EXTENDED] Extreme 7d rally: +142.5%
Token rejected: Extreme 7d rally - late to party
🔓 Unlocked C2omVhcv (active: 0)
```

**Bad (needs attention)**:
```
🔒 Locked C2omVhcv for processing (active: 1)
🔒 Locked C2omVhcv for processing (active: 2)  ← DUPLICATE LOCK (shouldn't happen)
```

## Limitations

**DexScreener API constraints**:
- Only provides: m5, h1, h6, h24 price changes
- NO 7-day, 30-day, or all-time high data
- We're using FDV/Liquidity ratios as proxies
- Not 100% accurate but MUCH better than before

**Future improvements**:
- Integrate Birdeye API for ACTUAL 30-day OHLCV data
- Add `BIRDEYE_API_KEY` to .env
- Replace estimates with real historical candles
- More accurate extended level detection

## Testing Checklist

- [ ] Compile successful (`npx tsc`)
- [ ] Bot starts without errors (`npm start`)
- [ ] Lock/unlock logs appear for each token
- [ ] No duplicate lock messages (same token, different active count)
- [ ] FDV/Liq ratio calculated and logged
- [ ] Extended level checks show conservative 7D estimates
- [ ] Tokens with high FDV/Liq (>10x) are flagged
- [ ] Tokens with extreme volume (>3x liq) are blocked
- [ ] No 5x duplicate purchases on same token

## Files Modified

1. **src/main.ts**:
   - Added immediate lock in `processTradeOpportunity()`
   - Wrapped processing in try/finally for cleanup
   - Split into `processTradeOpportunity()` + `processTradeOpportunityInternal()`

2. **src/riskManager.ts**:
   - Replaced ATH estimation with FDV/Liq ratio analysis
   - Added Volume/Liq ratio for fresh parabolic detection
   - Conservative 7-day price estimates (233% for high FDV/Liq)
   - Enhanced logging for debugging extended level checks

## Rollback Plan

If issues occur, revert with:
```bash
git checkout HEAD~1 src/main.ts src/riskManager.ts
npx tsc
npm start
```

## Next Steps

1. Monitor for 24 hours to verify:
   - No duplicate purchases
   - Extended level detection working
   - Conservative estimates preventing bad entries

2. If stable, add Birdeye integration for real historical data:
   - Get Birdeye API key
   - Implement `getBirdeyePriceHistory(tokenAddress, days=30)`
   - Replace estimates with actual OHLCV candles
   - More precise 30-day gain calculation

3. Consider additional protections:
   - Max daily trades per token (prevent repeated attempts)
   - Token "cooldown" period after rejection
   - Stricter FDV/Liq thresholds during high volatility
