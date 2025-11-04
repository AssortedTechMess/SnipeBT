# AI Telegram Notifications

## Overview
The bot now sends **smart, filtered AI insights** to Telegram - only important events, no spam.

## Notification Types

### 1. AI Trade Validation Alerts
**When**: AI rejects a trade OR approves with low confidence (<60%)
**Format**:
```
🤖 AI Trade Validator

❌ REJECTED: TOKEN
📍 CA1234...

📊 Analysis:
  • AI Confidence: 45.0%
  • Signal Strength: 70.0%
  • Risk Level: HIGH

💭 AI Reasoning:
Token only 2 hours old, liquidity below $5K threshold

⚠️ Warnings:
  • Extremely low liquidity
  • New token (rug risk)
```

**Filter**: Only sends if trade is rejected OR approved with <60% confidence

---

### 2. AI Candlestick Pattern Alerts
**When**: High confidence pattern detected (≥70%) with actionable signal
**Format**:
```
🕯️ AI Candlestick Alert

🔴 SELL Signal: Ainti
📍 BAezfV...

📈 Pattern: Bearish Wick Rejection
🎯 Confidence: 80%
🔴 Risk: HIGH

💭 AI Analysis:
Upper wick 555% of body shows strong rejection at resistance

📊 Wick Analysis:
RVOL 2.87x confirms distribution
```

**Filter**: Only sends if confidence ≥70% AND action is BUY/SELL (not HOLD)

---

### 3. Market Regime Change Alerts
**When**: AI detects market regime shift (BULL→BEAR, SIDEWAYS→BULL, etc.)
**Format**:
```
📊 AI Market Regime Change

🐻 BULL → BEAR

🎯 Risk Appetite: CAUTIOUS
💰 Position Sizing: 0.5x base amount
🔍 Confidence: 85.0%

💭 AI Reasoning:
Win rate dropped from 75% to 45%, recent losses indicate bearish shift

⚡ Action Required: Position sizes will automatically adjust to 0.5x
```

**Filter**: Always sends (regime changes are critical)

---

### 4. AI Position Sizing Alerts
**When**: AI recommends significantly different size (>20% deviation from base)
**Format**:
```
💰 AI Position Sizing

📈 INCREASED for TOKEN

📊 Sizing:
  • Base Amount: 0.0500 SOL
  • AI Recommended: 0.0800 SOL
  • Adjustment: 1.60x (+60.0%)

🎯 Confidence: 78.0%

💭 AI Reasoning:
Strong signals (78%) in BULL regime, recent 70% win rate justifies increased allocation
```

**Filter**: Only sends if adjustment differs from base by >20% (multiplier <0.8 or >1.2)

---

### 5. AI Post-Trade Learning Alerts
**When**: Trade closes with lessons learned
**Format**:
```
📚 AI Post-Trade Learning

✅ WIN: TOKEN (+25.50%)

📊 Expected vs Actual:
AI predicted 15-20% gain, achieved 25.5%

✅ Success Factors:
  • Strong liquidity pool
  • Multiple strategy alignment
  • High volume confirmation

💡 Lessons Learned:
  • Early entry on strong setups yields best results
  • Volume confirmation critical for >20% gains

🎯 Strategy Adjustments:
{
  "minLiquidity": 15000,
  "requireVolumeConfirmation": true
}
```

**Filter**: Only sends if there are actual lessons learned (array not empty)

---

## Integration Points

### main.ts
- **Line 508-515**: AI validation notification after trade analysis
- **Line 530-547**: Regime change detection and notification
- **Line 548-556**: Position sizing notification
- **Line 1026-1034**: Post-trade analysis notification

### aiIntegration.ts
- **Line 71-81**: Candlestick pattern notification (replaces old Telegram message)

### notifications.ts
- **Line 60-104**: `sendAIValidation()` method
- **Line 106-157**: `sendAICandlestickSignal()` method
- **Line 159-200**: `sendAIRegimeChange()` method
- **Line 202-243**: `sendAIPositionSize()` method
- **Line 245-291**: `sendAIPostTradeAnalysis()` method

---

## Smart Filtering Logic

### What WILL trigger notifications:
✅ AI rejects a trade (safety alert)
✅ AI approves with <60% confidence (borderline decision)
✅ Candlestick pattern ≥70% confidence with BUY/SELL action
✅ Market regime changes (BULL↔BEAR↔SIDEWAYS)
✅ Position size adjusted >20% from base (significant deviation)
✅ Post-trade analysis with lessons learned

### What WON'T trigger notifications:
❌ AI approves with >60% confidence (normal operation)
❌ Candlestick patterns <70% confidence (low confidence)
❌ HOLD signals from candlestick monitor (no action needed)
❌ Position size within 20% of base (normal variance)
❌ Post-trade analysis with no lessons (nothing to learn)
❌ Every token scan (would be spam)

---

## Testing

Your current running bot has:
- 1 open position (Ainti token)
- AI detected 80% confidence bearish wick rejection
- This SHOULD have triggered a candlestick alert

Check your Telegram for the alert!

---

## Cost Impact

**No additional costs** - notifications use existing Telegram bot (free)
- AI analysis already running (included in $25 credits)
- Notifications are filtered, so minimal Telegram API calls
- Expected: 5-15 notifications per day (important events only)

---

## Next Steps

1. ✅ Code compiled with 0 errors
2. 🔄 Restart bot to activate new notification system
3. 📱 Monitor Telegram for AI insights
4. 🎯 Adjust filter thresholds if too many/few notifications

---

## Configuration

All thresholds are hardcoded for optimal balance:
- Validation: <60% confidence triggers alert
- Candlestick: ≥70% confidence required
- Regime: Any change triggers alert
- Position Size: >20% deviation triggers alert
- Post-Trade: Only if lessons learned

No environment variables needed - smart defaults built in!
