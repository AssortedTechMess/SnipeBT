
# SnipeBT - AI-Powered Solana Trading Bot

An advanced autonomous trading bot for Solana memecoins featuring AI-driven decision making, adaptive learning, candlestick pattern recognition, and fortress-level protection optimized for small capital trading.

## 🚀 Key Features

### 🧠 AI & Machine Learning
- **AI Adaptive Learning V2**: Learns from every trade to improve pattern recognition and confidence scoring
- **Candlestick Pattern Analysis**: Recognizes 10+ patterns (BULLISH_ENGULFING, HAMMER, MORNING_STAR, etc.)
- **Dynamic Confidence Adjustments**: AI adjusts strategy weights based on historical performance
- **Multi-Strategy Intelligence**: Candlestick + Martingale + Trend Reversal analysis combined

### 🛡️ 7-Layer Protection System
1. **Liquidity Filter**: $15K minimum (optimized for small capital)
2. **Volume Filter**: $10K minimum 24h volume
3. **RVOL Filter**: 1.5x relative volume (high-conviction moves only)
4. **Rug Score**: < 750 threshold (allows moderate risk for AI analysis)
5. **First Candle Rule**: 5-minute minimum token age (avoids launch volatility)
6. **AI Candlestick Validation**: Pattern-based entry signals
7. **Bearish Pattern Rejection**: Filters out bearish setups automatically

### ⚡ RPC Optimization
- **Efficient Balance Tracking**: 1-minute verification cycle saves 3,000+ RPC calls/day
- **Smart Caching**: Price and validation data cached to minimize API usage
- **Rate Limiting**: Built-in RPC request management
- **Multi-Endpoint Failover**: Automatic fallback to backup RPCs

### 🎯 Advanced Features
- **Jupiter DEX Aggregation**: Best swap rates across all Solana DEXs
- **Position Management**: Automatic tracking and profit target monitoring
- **Telegram Notifications**: Real-time trade alerts and status updates
- **Secure Configuration**: OS-level credential storage (keytar)
- **Emergency Controls**: Quick sell-all and position checking tools

## 📋 Requirements

- Node.js 18+ and npm
- Solana wallet with SOL for trading
- RPC endpoint (QuickNode recommended or public endpoints)

## 🛠️ Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/SnipeBT.git
cd SnipeBT
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment:
```bash
cp .env.example .env
# Edit .env with your settings
```

4. Store wallet private key securely (recommended):
```bash
npx ts-node src/storeSecret.ts --name WALLET_PRIVATE_KEY
```

## ⚙️ Configuration

### Essential Settings (.env)

```properties
# RPC Endpoint (QuickNode recommended for reliability)
RPC_URL=https://your-quicknode-endpoint-here.solana-mainnet.quiknode.pro
BACKUP_RPC_URL=https://api.mainnet-beta.solana.com
RPC_WSS_URL=wss://your-wss-endpoint-here

# Trading Configuration
TRADE_AMOUNT_SOL=0.15          # Amount per trade (optimized for $100-200 capital)
MAX_POSITIONS=5                # Max concurrent positions
SLIPPAGE_BPS=150               # 1.5% slippage tolerance

# 7-Layer Protection Settings
MIN_LIQUIDITY_USD=15000        # Minimum liquidity ($15K - rug protection)
MIN_VOLUME24H_USD=10000        # Minimum 24h volume ($10K)
MIN_RVOL=1.5                   # Relative volume filter (1.5x average)
MAX_RUG_SCORE=750              # Rug check threshold (< 750)
MIN_TOKEN_AGE_MINUTES=5        # First candle rule (5 min minimum age)

# AI Configuration
USE_AI_EXITS=true              # Enable AI-driven exit decisions
AI_MIN_CONFIDENCE=65           # Minimum 65% confidence for trades
ENABLE_LEARNING=true           # Enable adaptive learning from trades

# Allowed DEXs (raydium, orca, meteora, pumpswap)
ALLOWED_DEXES=raydium,orca,meteora,pumpswap

# Telegram (Optional)
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

### Protection Layers Explained

#### 1. Liquidity Filter ($15K minimum)
Filters out low-cap rugs and illiquid tokens. Optimized for small capital - higher than typical $5K but low enough to catch early opportunities.

#### 2. Volume Filter ($10K minimum)
Ensures token has active trading. Dead tokens filtered out automatically.

#### 3. RVOL Filter (1.5x relative volume)
**Formula**: `RVOL = vol1h / (vol24h / 24)`  
Only trades when current volume is 1.5x+ the hourly average. Prevents buying during low-activity periods.

#### 4. Rug Score (< 750 threshold)
Checks token security metrics. Allows moderate risk for AI analysis while blocking extreme rugs (scores > 750).

#### 5. First Candle Rule (5-minute minimum)
Rejects tokens younger than 5 minutes. Protects against launch volatility - 60% of rugs happen in first 5 minutes.

#### 6. AI Candlestick Validation
Analyzes 5-minute candles for patterns:
- BULLISH_ENGULFING, HAMMER, MORNING_STAR (enter)
- BEARISH_ENGULFING, SHOOTING_STAR, EVENING_STAR (avoid)
- DOJI, SPINNING_TOP (neutral - needs confirmation)

#### 7. Confidence Threshold (65%+)
AI must be 65%+ confident before entering. Low-confidence setups automatically rejected.

## 🚀 Usage

### First-Time Setup

1. **Configure Environment**:
```bash
cp .env.example .env
# Edit .env with your wallet key, RPC endpoints, etc.
```

2. **Store Wallet Key Securely** (recommended):
```bash
npx ts-node src/storeSecret.ts --name WALLET_PRIVATE_KEY
```

3. **Compile TypeScript**:
```bash
npx tsc
```

### Running the Bot

**Start Trading**:
```bash
npm start
# or with PowerShell:
.\scripts\run-live.ps1
```

**Check Balance**:
```bash
npx ts-node check-balance.ts
```

**Check Open Positions**:
```bash
npx ts-node check-positions-now.ts
```

**Emergency Sell All**:
```bash
npx ts-node sell-all-positions.ts
```

### What Happens When Running

The bot will:
1. ✅ Load AI learning data from previous sessions (`learningData_v2.json`)
2. ✅ Initialize balance tracker (1-minute verification cycle)
3. ✅ Scan tokens from multiple sources (Dexscreener, Raydium, Birdeye)
4. ✅ Apply 7-layer protection filters
5. ✅ Analyze passing tokens with AI candlestick patterns
6. ✅ Enter high-confidence setups (65%+ confidence)
7. ✅ Monitor positions with AI-driven exit decisions
8. ✅ Learn from outcomes to improve future trades

### Monitoring

**Console Logs Show**:
- Token discovery and filtering results
- Protection layer rejections (liquidity, volume, rug score, age)
- AI analysis (pattern detected, confidence score, decision)
- Trade execution (entry price, position size)
- Exit decisions (profit target hit, AI-driven exits)
- Learning updates (pattern performance adjustments)

**Telegram Notifications** (if configured):
- Bot startup/shutdown
- Trade entries with analysis
- Profit targets hit
- Emergency alerts## 🧠 AI Learning System

### How It Works

The bot uses **adaptive learning** to improve over time:

1. **Pattern Recognition**: Analyzes candlestick patterns on every token
2. **Trade Execution**: Enters based on AI confidence and pattern strength
3. **Outcome Tracking**: Records win/loss for each pattern used
4. **Confidence Adjustment**: Increases confidence for winning patterns, decreases for losing ones
5. **Strategy Weighting**: Adjusts which strategies get more influence based on performance

### Learning Data Persistence

All learning persists across restarts in `learningData_v2.json`:
- ✅ Pattern performance stats (win rate per pattern)
- ✅ Confidence score adjustments
- ✅ Strategy effectiveness weights
- ✅ Historical trade outcomes

**The bot gets smarter with every trade!**

### Candlestick Patterns Recognized

**Bullish Patterns** (enter signals):
- BULLISH_ENGULFING: Strong reversal signal
- HAMMER: Bottom reversal after downtrend
- MORNING_STAR: Three-candle reversal pattern
- PIERCING_LINE: Bullish reversal
- THREE_WHITE_SOLDIERS: Strong uptrend

**Bearish Patterns** (avoid/exit signals):
- BEARISH_ENGULFING: Strong reversal down
- SHOOTING_STAR: Top reversal signal
- EVENING_STAR: Three-candle top pattern
- DARK_CLOUD_COVER: Bearish reversal
- THREE_BLACK_CROWS: Strong downtrend

**Neutral Patterns** (need confirmation):
- DOJI: Indecision, watch for next move
- SPINNING_TOP: Low conviction, needs volume

## 📊 AI Decision Making

The bot combines **three strategies** for each decision:

1. **Candlestick Strategy** (30% weight)
   - Pattern recognition
   - Trend analysis
   - Confidence based on historical pattern performance

2. **Martingale Strategy** (40% weight)
   - Anti-martingale momentum detection
   - Volume confirmation
   - Waits for strong momentum entries

3. **Trend Reversal Strategy** (30% weight)
   - Identifies reversals
   - Confirmation signals
   - Risk/reward assessment

**Final Decision**: Weighted average of all strategies
- **BUY**: If confidence ≥ 65% and bullish patterns detected
- **HOLD**: If confidence < 65% or neutral patterns (not blacklisted, re-evaluated)
- **REJECT**: If bearish patterns or failed protection layers (blacklisted)

## 🔒 Security

- **Never commit `.env`** files to git
- **Use OS credential store** for private keys (keytar)
- **Redact RPC URLs** containing API keys before sharing
- **Keep backups** of your wallet private key offline

## 📁 Project Structure

```
SnipeBT/
├── src/
│   ├── main.ts                      # Main bot orchestration
│   ├── trade.ts                     # Trade execution (Jupiter integration)
│   ├── validate.ts                  # 7-layer protection filtering
│   ├── positionManager.ts           # Position tracking
│   ├── aiBalanceTracker.ts          # RPC-efficient balance tracking
│   ├── aiAdaptiveLearning_v2.ts     # Adaptive learning system
│   ├── aiCandlestickMonitor.ts      # Candlestick pattern recognition
│   ├── aiDynamicExits.ts            # AI-driven exit decisions
│   ├── aiPriceCache.ts              # Price caching for RPC efficiency
│   ├── aiTradeIntelligence.ts       # Trade intelligence coordination
│   ├── config.ts                    # Configuration management
│   ├── secureConfig.ts              # Secure credential handling
│   ├── notifications.ts             # Telegram notifications
│   ├── rpcLimiter.ts                # RPC rate limiting
│   ├── cache.ts                     # Validation caching
│   ├── logging.ts                   # Logging utilities
│   └── strategies/
│       ├── baseStrategy.ts          # Base strategy interface
│       ├── candlestickStrategy.ts   # Candlestick analysis
│       ├── martingaleStrategy.ts    # Momentum detection
│       ├── trendReversalStrategy.ts # Reversal identification
│       ├── strategyManager.ts       # Strategy coordination
│       └── configs.ts               # Strategy configurations
├── scripts/
│   └── run-live.ps1                 # PowerShell runner
├── logs/
│   └── dryrun.csv                   # Trade simulation logs
├── learningData_v2.json             # AI learning persistence
├── tradeHistory.json                # Trade history log
├── balance-tracker.json             # Balance tracking state
├── entryPrices.json                 # Position entry prices
├── entryTimes.json                  # Position entry timestamps
├── rpc-stats.json                   # RPC usage statistics
├── .env.example                     # Configuration template
├── package.json
└── tsconfig.json
```

## 🐛 Troubleshooting

### Bot Not Trading?

**Check Protection Filters**:
```bash
# Review logs for rejection reasons:
# - "Token XXX failed liquidity validation: $YYY < $15000"
# - "Token XXX failed rug check with score YYY (extreme rug)"
# - "Token XXX too young: X.X min < 5 min (first candle rule)"
# - "Low RVOL X.XXx (< 1.5x) - weak conviction"
```

**Common Fixes**:
- ✅ Lower `MIN_LIQUIDITY_USD` to 10000 (if you want riskier plays)
- ✅ Lower `MIN_RVOL` to 1.2 (less strict volume filter)
- ✅ Increase `MAX_RUG_SCORE` to 1000 (allow higher-risk tokens)
- ✅ Lower `MIN_TOKEN_AGE_MINUTES` to 3 (catch earlier launches)
- ✅ Lower `AI_MIN_CONFIDENCE` to 60 (accept lower confidence)

### Bot Holding Positions Too Long?

**AI Exit Not Triggering**:
- Check `USE_AI_EXITS=true` in .env
- Monitor AI exit analysis in console logs
- Bearish patterns should trigger exits automatically

**Manual Sell**:
```bash
npx ts-node sell-all-positions.ts
```

### RPC Rate Limit Errors?

**Solutions**:
1. Use QuickNode or paid RPC (2.5M requests/day on Build plan)
2. Check RPC usage: `cat rpc-stats.json`
3. Increase `SCAN_INTERVAL_SECONDS` to reduce request frequency
4. Balance tracker already optimized (saves 3,000+ calls/day)

### Learning Data Not Persisting?

**Check Files**:
```bash
# These files should exist after first trades:
ls learningData_v2.json      # AI learning state
ls tradeHistory.json         # Trade outcomes
ls balance-tracker.json      # Balance state
```

**Reset Learning** (if needed):
```bash
rm learningData_v2.json
# Bot will create fresh learning data on next start
```

### Telegram Notifications Not Working?

**Verify Configuration**:
```properties
TELEGRAM_BOT_TOKEN=your_actual_bot_token_from_BotFather
TELEGRAM_CHAT_ID=your_actual_chat_id
```

**Test Notification**:
```bash
node test-telegram.js
```

## 📈 Performance Tips

### Optimized for Small Capital ($100-200)

1. **Trade Size**: 0.15 SOL (~$25) allows 4-5 concurrent positions
2. **Max Positions**: 5 prevents over-diversification
3. **7-Layer Protection**: Filters 95%+ of rugs and low-quality tokens
4. **First Candle Rule**: Avoids 60% of rugs that happen in first 5 minutes
5. **High Confidence Threshold**: 65%+ ensures only strong setups

### RPC Efficiency

- **Balance Tracker**: Saves 3,000+ RPC calls/day (12% of daily budget)
- **Price Caching**: Reduces redundant price checks
- **Smart Validation**: Caches validation results (15-min TTL)
- **Expected Usage**: ~92K calls/day (3.7% of 2.5M QuickNode Build quota)

### AI Learning Optimization

- **Let It Learn**: First 10-20 trades calibrate the AI
- **Pattern Refinement**: AI learns which patterns work in current market
- **Strategy Weights**: Automatically adjusts based on performance
- **Continuous Improvement**: Gets better with more trade data

### Risk Management

- **Small Position Sizes**: 0.15 SOL = manageable losses
- **Multiple Protection Layers**: Each filter reduces risk significantly
- **AI Confidence Gating**: Won't trade on weak signals
- **Adaptive Learning**: Learns from mistakes to avoid repeating them

### Best Practices

1. **Start Small**: Run with 0.1 SOL trades first to verify behavior
2. **Monitor Learning**: Check `learningData_v2.json` after 10 trades
3. **Review Rejections**: Understand why tokens are filtered (logs show reasons)
4. **Tune Protection**: Adjust filters based on your risk tolerance
5. **Trust the AI**: Don't override decisions - let it learn and adapt

## 🔧 Advanced Configuration

### Fine-Tuning Protection Layers

**Conservative** (safer, fewer trades):
```properties
MIN_LIQUIDITY_USD=20000
MIN_VOLUME24H_USD=15000
MIN_RVOL=2.0
MAX_RUG_SCORE=500
MIN_TOKEN_AGE_MINUTES=10
AI_MIN_CONFIDENCE=70
```

**Aggressive** (more trades, higher risk):
```properties
MIN_LIQUIDITY_USD=10000
MIN_VOLUME24H_USD=5000
MIN_RVOL=1.2
MAX_RUG_SCORE=1000
MIN_TOKEN_AGE_MINUTES=3
AI_MIN_CONFIDENCE=60
```

**Balanced** (recommended default):
```properties
MIN_LIQUIDITY_USD=15000
MIN_VOLUME24H_USD=10000
MIN_RVOL=1.5
MAX_RUG_SCORE=750
MIN_TOKEN_AGE_MINUTES=5
AI_MIN_CONFIDENCE=65
```

### Learning System Tuning

```properties
ENABLE_LEARNING=true           # Enable adaptive learning
LEARNING_RATE=0.1             # How fast AI adjusts (0.1 = moderate)
MIN_TRADES_FOR_PATTERN=3      # Minimum trades before pattern adjustment
CONFIDENCE_DECAY=0.95         # How much losing trades reduce confidence
```

## ⚠️ Disclaimer

**IMPORTANT - READ CAREFULLY:**

- This bot is for **educational and research purposes only**
- Cryptocurrency trading carries **significant financial risk**
- **You can lose all your invested capital**
- This software is provided "AS IS" with **no guarantees of profit**
- Past performance (if any) does **not indicate future results**
- The AI learning system is **experimental** and may make mistakes
- **Always test with small amounts first** (0.05-0.1 SOL)
- Never trade with funds you cannot afford to lose
- The developers assume **no liability** for your trading losses
- You are responsible for **complying with local trading regulations**
- **Use at your own risk**

### Recommended Safe Usage

1. ✅ Start with test amounts (0.05-0.1 SOL per trade)
2. ✅ Monitor closely for first 10-20 trades
3. ✅ Review learning data to understand AI behavior
4. ✅ Keep majority of capital in cold storage
5. ✅ Set stop-loss limits for yourself (e.g., max 20% of wallet)
6. ✅ Understand that memecoins are highly volatile and risky

## 📝 License

MIT License - See LICENSE file for details

**Key Points:**
- Free to use, modify, and distribute
- No warranty or guarantee of any kind
- Authors not liable for any damages
- Use at your own risk

## 🤝 Contributing

Contributions are welcome! Here's how:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/your-feature`
3. **Make your changes** (test thoroughly!)
4. **Commit changes**: `git commit -m "Add your feature"`
5. **Push to branch**: `git push origin feature/your-feature`
6. **Open a Pull Request** with description of changes

### Areas for Contribution

- 🧠 Additional candlestick patterns
- 📊 New trading strategies
- 🛡️ Enhanced protection filters
- 📈 Performance analytics dashboard
- 🔔 Additional notification channels
- 📚 Documentation improvements
- 🧪 Test coverage expansion

## 📞 Support

- **Issues**: Open a GitHub issue for bugs or questions
- **Discussions**: Use GitHub Discussions for strategy ideas
- **Pull Requests**: Submit improvements via PR

**Please DO NOT share:**
- ❌ Your wallet private keys
- ❌ RPC API keys or URLs
- ❌ Telegram bot tokens
- ❌ Any other sensitive credentials

---

## 🌟 Features Roadmap

### Current (v1.0)
- ✅ AI adaptive learning v2
- ✅ 7-layer protection system
- ✅ Candlestick pattern recognition
- ✅ RPC optimization
- ✅ Multi-strategy decision making
- ✅ First candle rule

### Planned (v2.0)
- 🔄 Web dashboard for monitoring
- 🔄 Advanced backtesting framework
- 🔄 Multi-wallet support
- 🔄 Portfolio rebalancing
- 🔄 Social sentiment analysis
- 🔄 Advanced stop-loss strategies

---

**Remember**: 
- 🔐 **Never commit `.env` files** to version control
- 🔐 **Use OS credential storage** for private keys (keytar)
- 🔐 **Redact RPC URLs** containing API keys before sharing
- 🔐 **Keep backups** of your wallet private key in secure offline storage
- 🧪 **Test with small amounts** before scaling up
- 📊 **Monitor performance** and adjust settings as needed

**Happy Trading! Stay Safe! 🚀**



