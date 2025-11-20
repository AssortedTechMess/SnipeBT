# AI Risk Learning System

## Overview
The AI now learns from every trade outcome and automatically adjusts its behavior to avoid repeating costly mistakes like the groyper over-concentration incident.

## What the AI Tracks

### 1. **Extended Level Entries** (Buying Tops)
- **Tracks**: Every trade where token was >50% up in 24h
- **Learns**: Win rate when entering extended levels
- **Action**: If extended level win rate < 40%, AI will warn against future entries
- **Result**: Prevents FOMO buying at parabolic tops

### 2. **Position Size Performance**
- **Tracks**: Position size as % of portfolio for every trade
- **Learns**: Average position size of winning vs losing trades
- **Action**: Recommends max safe position size (capped at 30%)
- **Result**: Prevents over-concentration in single tokens

### 3. **Doubling Effectiveness**
- **Tracks**: Success rate of each doubling (1st, 2nd, 3rd)
- **Learns**: At what point doubling becomes unprofitable
- **Action**: Adjusts max safe doublings based on historical data
- **Result**: Stops throwing good money after bad on dead bounces

### 4. **Drawdown Patterns**
- **Tracks**: Maximum drawdown on every position
- **Learns**: Average drawdown on losing trades
- **Action**: Won't double positions that already had >10% drawdown
- **Result**: Avoids averaging down into collapsing positions

### 5. **Large Position Outcomes**
- **Tracks**: All trades where position exceeded 30% of portfolio
- **Learns**: Win rate on oversized positions
- **Action**: Flags warnings when concentration risk builds
- **Result**: Maintains portfolio diversification

## How It Works

### During Trading
1. **Before Entry**: AI checks learned lessons
   - "Avoid extended levels: 25% win rate when buying tops"
   - "Max safe position: 18% based on winning trades"
   - "Token is +67% today - LEARNED: avoid entries here"

2. **During Holding**: Tracks drawdown
   - Updates `maxDrawdown` on every price check
   - Remembers worst drawdown even if position recovers

3. **After Exit**: Records everything
   - Position size, max drawdown, doubling count
   - Whether entry was at extended level
   - Complete outcome for pattern matching

### Learning Process
```typescript
// After each trade closes
recordTrade({
  symbol: "GROYPER",
  profit: -12%,
  positionSizePercent: 100%,  // ⚠️ Over-concentrated
  maxDrawdown: -18%,          // ⚠️ Deep drawdown
  enteredAtExtendedLevel: true, // ⚠️ Bought the top
  doublingCount: 3            // ⚠️ Doubled 3 times
})

// AI analyzes patterns:
// "Trades with >30% position size: 35% win rate"
// "Extended level entries: 28% win rate" 
// "Positions doubled 3x: 42% win rate"

// Next time:
// ✅ Caps position at 30%
// ✅ Rejects extended level entries
// ✅ Stops after 2 doublings
```

## Learning Display

### In Market Summary
```
🛡️ Risk Management Lessons:
  • ⚠️ AVOID buying tokens >50% up (28% win rate)
  • Max safe position size: 18%
  • Safe doubling limit: 2x
  • Large positions (>30%) win rate: 35%
```

### In AI Confidence Adjustments
```
🧠 LEARNED: Avoid extended price levels (28% win rate when buying tops)
```

## Key Improvements Over Previous System

### Before (What Caused Groyper Loss)
❌ No position size limits
❌ No extended level detection  
❌ Blindly doubled on small bounces
❌ No drawdown tracking
❌ No learning from mistakes

### After (Current System)
✅ 30% max position size enforced
✅ Detects extended levels (>50% 24h)
✅ Progressive doubling requirements (5%, 10%, 15%)
✅ Won't double positions with >10% historical drawdown
✅ Learns optimal position sizing from winning trades
✅ Tracks and avoids buying tops based on past performance

## Real-World Example

### Groyper Incident (What Happened)
```
Entry 1: 100% of capital at monthly ATH
Entry 2: Doubled on +3% bounce (dead cat)
Entry 3: Doubled again on +2% bounce 
Entry 4: Doubled again immediately
Result: -12% loss, all capital tied up
```

### How AI Would Handle It Now
```
Entry 1: Rejected
  - "Token +67% in 24h = extended level"
  - "LEARNED: 28% win rate on extended entries"
  - Risk assessment: REJECTED

Alternative: Wait for cooldown
  - If token pulls back to support
  - If 24h gains normalize below 50%
  - Position size capped at 30% max
```

## Data Persistence

All learning data saved to:
- `learningData.json` - Complete trade history
- `metrics.json` - Aggregate statistics
- `tradeHistory.json` - Execution records

Survives bot restarts - AI remembers past mistakes indefinitely.

## Future Enhancements

The learning system can be extended to track:
- Time-of-day patterns (best/worst hours)
- Token category performance (memes vs utilities)
- Holding time optimization
- Multi-timeframe confluence
- Volume profile analysis
- Liquidity depth effectiveness

## Testing the Learning

To verify AI is learning:

1. **Check logs for risk warnings**:
```
🧠 LEARNED: Avoid extended price levels (28% win rate when buying tops)
⚠️ Extended level detected: +67% in 24h - reducing confidence
```

2. **Review market summaries**:
```
🛡️ Risk Management Lessons:
  • ⚠️ AVOID buying tokens >50% up
  • Max safe position size: 18%
```

3. **Monitor rejected trades**:
```
🚫 Risk Assessment REJECTED trade
   • Token at extended levels (>50% 24h gain)
   • Position would exceed 30% concentration
```

## Summary

The AI now has **institutional memory** of risk management failures. It won't make the same mistake twice:

- **Groyper taught it**: Don't buy parabolic moves
- **Future losses will teach**: Pattern-specific risk profiles
- **Every trade builds**: Smarter, more conservative AI

The system is **self-improving** - the more it trades, the better it understands what works and what doesn't.
