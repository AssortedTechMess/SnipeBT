# 🤖 AI Candlestick Monitor Integration Guide

## What This Does

The AI Candlestick Monitor uses **OpenAI GPT-4** to analyze real-time candlestick patterns and provide intelligent trading signals based on EmperorBTC methodology.

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│  1. Token enters your active positions                     │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  2. AI Monitor starts watching (every 1 minute)             │
│     - Fetches real-time candle data from DexScreener       │
│     - Calculates OHLC, wicks, body size                    │
│     - Gets market context (liquidity, RVOL, trend)         │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  3. AI Analysis with OpenAI GPT-4                           │
│     - Analyzes wick rejection patterns                     │
│     - Identifies pin bars, engulfing, etc.                 │
│     - Checks volume confirmation                           │
│     - Evaluates market context                             │
│     - Generates probability-based confidence (0-100%)      │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  4. Action Signals                                          │
│     ≥70% confidence + volume → 🚨 TELEGRAM ALERT            │
│     50-70% confidence → ⚠️  Console warning                 │
│     <50% confidence → ℹ️  Info only                         │
└─────────────────────────────────────────────────────────────┘
```

## Setup

### 1. Install OpenAI Package

```powershell
npm install openai
```

### 2. Add OpenAI API Key to .env

```env
OPENAI_API_KEY=sk-your-api-key-here
```

Get your key from: https://platform.openai.com/api-keys

### 3. Integrate into main.ts

Add this to the top of `src/main.ts`:

```typescript
import { initializeAIMonitor, monitorTokenWithAI, shutdownAIMonitor } from './aiIntegration';

// ... existing imports ...
```

In your initialization section (around line 200):

```typescript
async function main() {
  // ... existing initialization ...
  
  // Initialize strategies
  await initializeStrategies();
  
  // NEW: Initialize AI Monitor
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    initializeAIMonitor(openaiKey);
    console.log('🤖 AI Candlestick Monitor enabled!');
  } else {
    console.log('⚠️  OPENAI_API_KEY not set, AI monitoring disabled');
  }
  
  // ... rest of initialization ...
}
```

When you BUY a token (in your trade execution section):

```typescript
// After successful BUY trade
if (txResult.success) {
  // ... existing position tracking ...
  
  // Store position
  activePositions.set(mintAddress, {
    tokenAddress: mintAddress,
    symbol: tokenSymbol,
    entryPrice: currentPrice,
    amount: solAmount,
    entryTime: new Date(),
    doublingCount: 0
  });
  
  // NEW: Start AI monitoring
  monitorTokenWithAI(
    mintAddress,
    tokenSymbol,
    (signal) => {
      console.log(`🤖 AI SIGNAL for ${tokenSymbol}:`, signal);
      
      // Example: Auto-sell on high confidence SELL signal
      if (signal.action === 'SELL' && signal.confidence >= 80) {
        console.log('🚨 AI recommends SELL with 80%+ confidence!');
        // You could trigger auto-sell here if you want
      }
    }
  );
}
```

When you SELL a token:

```typescript
// After successful SELL trade
if (sellResult.success) {
  // ... existing position cleanup ...
  
  // NEW: Stop AI monitoring
  stopMonitoringToken(mintAddress);
  activePositions.delete(mintAddress);
}
```

On shutdown:

```typescript
process.on('SIGINT', async () => {
  console.log('\n⏹️  Shutting down gracefully...');
  
  // NEW: Cleanup AI monitoring
  shutdownAIMonitor();
  
  // ... existing cleanup ...
  process.exit(0);
});
```

## Example Output

When AI detects a pattern:

```
[AI Monitor] 14:35:22 - Ainti Analysis:
  Pattern: Bullish Pin Bar with Strong Lower Wick Rejection
  Confidence: 78%
  Action: BUY
  Wick Analysis: Lower wick is 3.2x body size indicating strong buyer support at $0.092. Price tested lows but buyers aggressively rejected.
  Volume Confirmed: ✅
  Risk Level: MEDIUM
  Reasoning: The long lower wick combined with bullish close and 2.6x RVOL suggests strong buying pressure. Context is favorable with $530k liquidity and uptrend continuation.

============================================================
🤖 AI HIGH CONFIDENCE SIGNAL
Token: Ainti
Pattern: Bullish Pin Bar with Strong Lower Wick Rejection
Action: BUY
Confidence: 78%
Risk: MEDIUM

The long lower wick combined with bullish close and 2.6x RVOL suggests strong buying pressure. Context is favorable with $530k liquidity and uptrend continuation.

Wick: Lower wick is 3.2x body size indicating strong buyer support at $0.092. Price tested lows but buyers aggressively rejected.
============================================================
```

## AI Prompt Strategy

The AI is prompted with **EmperorBTC methodology rules**:

1. **Wick rejection is PRIMARY signal** (wick > 2x body = strong)
2. **Context matters MORE than pattern** (50% of decision)
3. **Volume confirmation is MANDATORY** (RVOL 1.5x+)
4. **Pin bars are most reliable**
5. **Pattern WITHOUT context = NO TRADE**

This ensures AI follows proven trading principles, not just pattern recognition.

## Configuration

In `src/aiIntegration.ts`, you can modify:

### Monitor Interval
```typescript
await aiMonitor.startMonitoring(
  tokenAddress,
  callback,
  60000 // 60 seconds (change this)
);
```

### Alert Thresholds
```typescript
// High confidence alert
if (analysis.confidence >= 70 && analysis.volumeConfirmation) {
  // Send Telegram alert
}

// Medium confidence warning
else if (analysis.confidence >= 50 && analysis.volumeConfirmation) {
  // Console warning only
}
```

### AI Model
In `src/aiCandlestickMonitor.ts`:
```typescript
model: 'gpt-4-turbo-preview' // or 'gpt-4', 'gpt-3.5-turbo'
```

## Cost Estimation

**OpenAI Pricing** (GPT-4 Turbo):
- Input: $0.01 per 1K tokens
- Output: $0.03 per 1K tokens
- ~500 tokens per analysis

**Cost per token**:
- 1 minute intervals = ~$0.02/hour/token
- 5 minute intervals = ~$0.004/hour/token

**Monthly cost for 5 active positions**:
- 1 min intervals: ~$75/month
- 5 min intervals: ~$15/month

💡 **Recommendation**: Use 5-minute intervals to save costs

## Advanced: Birdeye API Integration

For REAL candlestick data (not estimates), integrate Birdeye API:

```typescript
// In aiCandlestickMonitor.ts
private async fetchCandles(tokenAddress: string, interval: '5m' = '5m'): Promise<CandleOHLC[]> {
  // Replace DexScreener with Birdeye OHLC endpoint
  const response = await axios.get(
    `https://public-api.birdeye.so/defi/ohlcv?address=${tokenAddress}&type=${interval}`,
    {
      headers: {
        'X-API-KEY': process.env.BIRDEYE_API_KEY
      }
    }
  );
  
  return response.data.items.map((candle: any) => ({
    timestamp: candle.unixTime * 1000,
    open: candle.o,
    high: candle.h,
    low: candle.l,
    close: candle.c,
    volume: candle.v
  }));
}
```

## Benefits

✅ **AI learns from patterns you might miss**
✅ **24/7 monitoring while you sleep**
✅ **Telegram alerts for high-confidence signals**
✅ **Probability-based confidence (not binary)**
✅ **Context-aware analysis (EmperorBTC method)**
✅ **Volume confirmation built-in**
✅ **Risk assessment for every pattern**

## Example Integration Flow

```typescript
// main.ts snippet

// 1. Buy token (existing code)
const buyResult = await executeSnipeSwap(/* ... */);

if (buyResult.success) {
  console.log(`✅ Bought ${tokenSymbol}`);
  
  // 2. Track position (existing)
  activePositions.set(mintAddress, { /* ... */ });
  
  // 3. Start AI monitoring (NEW!)
  await monitorTokenWithAI(mintAddress, tokenSymbol, (signal) => {
    if (signal.action === 'SELL' && signal.confidence >= 75) {
      console.log('🤖 AI: Strong SELL signal detected!');
      console.log('   Pattern:', signal.pattern);
      console.log('   Reasoning:', signal.reasoning);
      
      // Optional: Auto-execute sell
      // await executeSell(mintAddress);
    }
  });
}

// 4. Monitor outputs every 1 minute
// [AI Monitor] 14:35:22 - Ainti Analysis:
//   Pattern: Bullish Pin Bar
//   Confidence: 78%
//   Action: HOLD (waiting for 2% profit target)

// 5. High confidence signal triggers alert
// 🚨 TELEGRAM: "AI detected Bearish Engulfing on Ainti (85% confidence)"

// 6. Sell when ready (existing code)
const sellResult = await executeRoundTripSwap(/* ... */);

if (sellResult.success) {
  // 7. Stop monitoring (NEW!)
  stopMonitoringToken(mintAddress);
  activePositions.delete(mintAddress);
}
```

## Next Steps

1. ✅ Add `OPENAI_API_KEY` to `.env`
2. ✅ Install `npm install openai`
3. ⏳ Integrate into `main.ts` (3 locations: init, buy, sell)
4. ⏳ Test with 1 position first
5. ⏳ Monitor Telegram for AI alerts
6. ⏳ Adjust confidence thresholds based on results

**Ready to implement?** I can help you add the integration code to your `main.ts` file! Just say "integrate AI into main.ts"
