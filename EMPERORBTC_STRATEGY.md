# EmperorBTC Trading Strategy Integration

## Overview

The EmperorBTC strategy is a **conservative, risk-managed trading approach** based on proven principles from the EmperorBTC Trading Manual. It integrates seamlessly with the multi-strategy system as either:

1. **Standalone mode** (`--strategy-mode emperorBTC`) - Pure EmperorBTC principles only
2. **Ensemble mode** - Combined with DCA, Martingale, or Trend Reversal strategies

## Core EmperorBTC Principles

### 1. **Quality Over Quantity**
- Only trades tokens that pass **ALL** quality filters
- Strict thresholds: $50k+ liquidity, $25k+ volume, <100 rug score
- Avoids pump.fun and high-risk DEXes
- 5+ transactions in 5m window required

### 2. **Conservative Risk Management**
- **3% risk per trade** (max position size)
- **20% stop-loss** (protect capital)
- **1.5% take-profit** (secure gains)
- **0.5% minimum profit** threshold to consider trades

### 3. **Multiple Confirmations Required**
Requires at least 2/5 confirmations:
- High liquidity (>$100k)
- Active trading (>10 tx/5m or >$50k/1h)
- Low rug risk (<50 score)
- Oversold RSI (20-40 range)
- Volume spike (2x+ average)

### 4. **Session Profit Targets**
- Default: **4x multiplier** (e.g., 0.0923 SOL → 0.3694 SOL)
- **No auto-stop** - continues running toward target
- Tracks progress: "Baseline → Current → Target"

### 5. **Capital Preservation**
- Immediate stop-loss at -20%
- Time-based exit if position stalls (>3 hours, <0.3% profit)
- Trailing exits if conditions deteriorate while profitable

### 6. **Position Management**
- Max 5 concurrent positions
- Position tracking with entry time/price/size
- Deterioration detection (volume drop, rug score increase, liquidity drain)

### 7. **Profit Security**
- Take profit at +1.5% (secure small wins)
- Trailing stop if conditions worsen (even while profitable)
- Free up capital for better opportunities

## How It Integrates with Multi-Strategy System

### **Pure EmperorBTC Mode** (Recommended for your 500-min runs)
```bash
npx ts-node src/main.ts --strategy-mode emperorBTC --live --auto-tp --auto-sl
```

**Behavior:**
- ✅ Only EmperorBTC strategy active
- ✅ Conservative decision mode (requires high confidence)
- ✅ All 7 EmperorBTC principles enforced
- ✅ Perfect for your current setup (0.0923 SOL → 4x target)

### **Conservative Mode** (EmperorBTC-aligned, multi-strategy)
```bash
npx ts-node src/main.ts --strategy-mode conservative --live --auto-tp --auto-sl
```

**Behavior:**
- 60% DCA strategy (gradual accumulation)
- 40% Trend Reversal (oversold opportunities)
- 0% Martingale (disabled - too risky)
- Conservative decision mode (requires strategy agreement)

### **Balanced Mode** (EmperorBTC + Others)
```bash
npx ts-node src/main.ts --strategy-mode balanced --live --auto-tp --auto-sl
```

**Behavior:**
- 40% DCA, 30% Martingale, 30% Trend Reversal
- Ensemble voting (weighted combination)
- Moderate risk tolerance
- Good for experimentation

## Integration Points

### **1. Validation Layer**
EmperorBTC runs **after** basic validation but **before** trade execution:

```
Token Discovery → Basic Validation → EmperorBTC Analysis → Trade Execution
     (API)            (validate.ts)        (emperorBTC)         (trade.ts)
```

### **2. Decision Flow**
```typescript
// Current flow (your bot):
if (await validateToken(token)) {
  executeTrade(token);
}

// With EmperorBTC integration:
const { isValid, decision } = await validateTokenWithStrategies(token);
if (isValid && decision.finalAction === 'BUY') {
  executeStrategyBasedTrade(token, decision);
}
```

### **3. Session Management**
```typescript
// Initialize with your current baseline
await initializeStrategies();
strategyManager.strategies.get('emperorBTC')?.setSessionBaseline(0.0923, 4);

// Tracks progress automatically
// Baseline: 0.0923 SOL → Target: 0.3694 SOL (4x)
```

### **4. Telegram Notifications**
EmperorBTC sends enhanced notifications:
```
🧠 Strategy Signal: BUY
Token: 3FoUAs...
Confidence: 85.0%
Reason: EmperorBTC: Quality token passed all filters
Confirmations: 3/5 [High liquidity, Active trading, Low rug risk]
Session: 12.3% → 4x target
```

## Current Bot Alignment

Your current bot **already follows EmperorBTC principles**:

| Principle | Current Bot | EmperorBTC Strategy |
|-----------|-------------|---------------------|
| Risk per trade | 3% (`--risk 0.03`) | ✅ 3% |
| Stop-loss | 20% (`--auto-sl`) | ✅ 20% |
| Take-profit | 1.5% (`--auto-tp`, `--min-profit 0.005`) | ✅ 1.5%, 0.5% min |
| Profit target | 4x (`--target-mult 4`) | ✅ 4x multiplier |
| No auto-stop | Enabled | ✅ Continues running |
| Min liquidity | $2.5k (`--min-liquidity-usd 2500`) | 🔧 **Increase to $50k** |
| Min volume | $800 (`--min-volume24h-usd 800`) | 🔧 **Increase to $25k** |
| Rug check | >100 score rejected | ✅ <100 required |
| Min txns | 1 (`--min-txns5m 1`) | 🔧 **Increase to 5** |

## Recommended Adjustments

To fully align with EmperorBTC (for more trades):

```bash
npx ts-node src/main.ts \
  --strategy-mode emperorBTC \
  --live \
  --auto-tp \
  --auto-sl \
  --multi-input \
  --risk 0.03 \
  --slippage-bps 40 \
  --min-profit 0.005 \
  --target-mult 4 \
  --min-liquidity-usd 50000 \      # Increased from 2500
  --min-volume24h-usd 25000 \       # Increased from 800
  --min-txns5m 5 \                  # Increased from 1
  --max-concurrent 5
```

**Why you're seeing no trades:**
- Current thresholds: $2.5k liq, $800 vol, 1 txn - **Too relaxed for current market**
- EmperorBTC thresholds: $50k liq, $25k vol, 5 txns - **Quality focus, but stricter**
- Market conditions: Dominated by pump.fun (auto-rejected by EmperorBTC)

## Strategy Comparison

### Your Current 500-min Run
- Manual validation thresholds
- All 54 tokens filtered (correct behavior - poor market)
- No multi-strategy decision making

### With EmperorBTC Strategy
- Automated EmperorBTC principles
- Multiple confirmation system
- Session profit tracking
- Deterioration detection
- Telegram notifications for all decisions
- **Same conservative filtering, but more intelligent**

## Benefits of Integration

1. **Automated EmperorBTC discipline** - No manual threshold tuning needed
2. **Multiple confirmation system** - Reduces false positives
3. **Session tracking** - Visual progress toward 4x target
4. **Deterioration detection** - Exits even profitable positions if conditions worsen
5. **Strategy breakdown** - See why each decision was made
6. **Ensemble option** - Combine with other strategies when market improves

## Usage Examples

### Pure EmperorBTC (Your Use Case)
```bash
# Set baseline in .env or CLI
STRATEGY_MODE=emperorBTC

# Run with your usual params
npx ts-node src/main.ts --live --auto-tp --auto-sl --risk 0.03
```

### EmperorBTC + DCA (Accumulation)
```bash
STRATEGY_MODE=conservative  # 60% DCA, 40% TrendReversal
```

### Custom Mix
```typescript
import { createCustomConfig } from './strategies/configs';

const myConfig = createCustomConfig('emperorBTC', {
  strategies: {
    emperorBTC: { enabled: true, weight: 0.7 },
    dca: { enabled: true, weight: 0.3 }
  }
});
```

## Monitoring

EmperorBTC provides detailed logging:
```
🧠 EmperorBTC Session: 0.0923 SOL → 0.3694 SOL (4x)
✅ Active strategies: emperorBTC
🧠 Strategy Decision for 3FoUAs...:
   Action: HOLD (confidence: 20.0%)
   Reason: EmperorBTC: Failed quality checks [volume, rugScore, pumpFun]
   Quality Score: 0.43
```

## Summary

**EmperorBTC strategy is your current bot's disciplined, automated version:**
- Same conservative principles
- Same risk management (3%, 20% SL, 1.5% TP)
- Same profit targets (4x)
- **Enhanced** with multi-confirmation, deterioration detection, and intelligent position management

**Use `--strategy-mode emperorBTC` for your next 500-min run** to see the difference!