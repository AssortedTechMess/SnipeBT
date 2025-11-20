SnipeBT - AI-Powered Solana Trading Bot

An advanced autonomous trading bot for Solana memecoins featuring AI-driven decision making, adaptive learning, candlestick pattern recognition, and fortress-level protection optimized for small capital trading.

## 🚀 Key Features

### 🧠 AI & Machine Learning
- **AI Adaptive Learning V2**: Learns from every trade to improve pattern recognition and confidence scoring
- **Candlestick Pattern Analysis**: Recognizes 10+ patterns (BULLISH_ENGULFING, HAMMER, MORNING_STAR, etc.)
- **Dynamic Confidence Adjustments**: AI adjusts strategy weights based on historical performance
- **Multi-Strategy Intelligence**: Candlestick + Martingale + Trend Reversal analysis combined
- **Real-time Dashboard**: SNIPEHOME socket server (port 3001) for live monitoring
- **xAI Grok-3 Integration**: Advanced AI validation and regime detection

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
- **AI-Optimized Exits**: Dynamic stop-loss (-4% to -15%) and trailing stops
- **Auto Take-Profit & Stop-Loss**: Configurable automatic exits
- **Telegram Notifications**: Real-time trade alerts and status updates
- **Secure Configuration**: OS-level credential storage (keytar)
- **Emergency Controls**: Quick sell-all and position checking tools

---

## 📋 Requirements

- **Node.js 18+** and npm
- **Solana wallet** with SOL for trading
- **RPC endpoint** (QuickNode recommended or public endpoints)
- **xAI API Key** (for Grok-3 AI features)
- **Telegram Bot** (optional, for notifications)

---

## 🛠️ Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/AssortedTechMess/SnipeBT.git
   cd SnipeBT
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your settings (see Configuration section below)
   ```

4. **Store wallet private key securely (recommended):**
   ```bash
   npx ts-node src/storeSecret.ts --name WALLET_PRIVATE_KEY
   ```
   The script accepts multiple formats:
   - Base58 string
   - Base64 string
   - JSON array of bytes
   - Comma-separated bytes

---

## ⚙️ Configuration

### Essential Settings (.env)

```env
# Wallet Configuration (Base58 encoded private key)
WALLET_PRIVATE_KEY=YOUR_WALLET_PRIVATE_KEY_HERE

# RPC Endpoints - Multiple endpoints for redundancy
RPC_URL=YOUR_PRIMARY_RPC_ENDPOINT_HERE
BACKUP_RPC_URL=https://solana-mainnet.rpc.extrnode.com
RPC_WSS_URL=wss://api.mainnet-beta.solana.com

# Environment Configuration
ENVIRONMENT=development
DRY_RUN=false

# API Keys
XAI_API_KEY=YOUR_XAI_API_KEY_HERE           # xAI Grok-3 for AI features
BIRDEYE_API_KEY=YOUR_BIRDEYE_API_KEY_HERE   # Birdeye for token data
HELIUS_API_KEY=YOUR_HELIUS_API_KEY_HERE     # Helius for additional data
TWITTER_BEARER_TOKEN=YOUR_TWITTER_BEARER_TOKEN_HERE  # Twitter sentiment (optional)

# AI Configuration
SKIP_AI_VALIDATION=false                     # Set to true to skip AI validation

# Trading Configuration
AUTO_TAKEPROFIT=true                         # Enable automatic take-profit
TAKEPROFIT_MIN_PCT=2.0                       # Minimum 2% profit target

# Volume Filtering (adjusted for slow market)
MIN_VOLUME24H_USD=10000                      # Minimum 24h volume
MIN_VOLUME1H_USD=500                         # Minimum 1h volume
MIN_RVOL=1.5                                 # Relative volume filter
VERBOSE_FILTER_LOGS=true

# Multi-Strategy System
# Available modes: emperorBTC, conservative, balanced, aggressive, scalping, dcaOnly
STRATEGY_MODE=aggressive
USE_STRATEGIES=true

# Telegram Notifications (Optional)
TELEGRAM_BOT_TOKEN=YOUR_TELEGRAM_BOT_TOKEN_HERE
TELEGRAM_CHAT_ID=YOUR_TELEGRAM_CHAT_ID_HERE

# Bot Configuration
LOG_LEVEL=debug
MAX_RETRIES=5
REQUEST_TIMEOUT_MS=30000
CACHE_DURATION_MS=60000
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
- **BULLISH_ENGULFING, HAMMER, MORNING_STAR** (enter)
- **BEARISH_ENGULFING, SHOOTING_STAR, EVENING_STAR** (avoid)
- **DOJI, SPINNING_TOP** (neutral - needs confirmation)

#### 7. Confidence Threshold (65%+)
AI must be 65%+ confident before entering. Low-confidence setups automatically rejected.

---

## 🚀 Usage

### First-Time Setup

1. **Configure Environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your wallet key, RPC endpoints, API keys, etc.
   ```

2. **Store Wallet Key Securely (recommended):**
   ```bash
   npx ts-node src/storeSecret.ts --name WALLET_PRIVATE_KEY
   ```

3. **Compile TypeScript:**
   ```bash
   npx tsc
   ```

### Running the Bot

**Start Trading:**
```bash
npm start
# or with PowerShell (includes auto-tp and auto-sl):
.\scripts\run-live.ps1
```

**Check Balance:**
```bash
npx ts-node check-balance.ts
```

**Check Open Positions:**
```bash
npx ts-node check-positions-now.ts
```

**Emergency Sell All:**
```bash
npx ts-node sell-all-positions.ts
```

### What Happens When Running

The bot will:

✅ Load AI learning data from previous sessions (`learningData.json`)  
✅ Initialize SNIPEHOME dashboard (ws://localhost:3001)  
✅ Initialize balance tracker (1-minute verification cycle)  
✅ Scan tokens from multiple sources (Dexscreener, Raydium, Birdeye)  
✅ Apply 7-layer protection filters  
✅ Analyze passing tokens with AI candlestick patterns and Grok-3 validation  
✅ Enter high-confidence setups (65%+ confidence)  
✅ Monitor positions with AI-optimized dynamic exits  
✅ Record all trades (wins AND losses) for adaptive learning  
✅ Learn from outcomes to improve future trades  

### Monitoring

**Console Logs Show:**
- Token discovery and filtering results
- Protection layer rejections (liquidity, volume, rug score, age)
- AI analysis (pattern detected, confidence score, Grok validation)
- Trade execution (entry price, position size)
- Exit decisions (profit target hit, stop-loss triggered, AI-driven exits)
- Learning updates (pattern performance adjustments, hot/cold detection)

**Telegram Notifications (if configured):**
- Bot startup/shutdown
- Trade entries with analysis
- Profit targets hit
- Stop-loss exits
- Emergency alerts

**SNIPEHOME Dashboard (ws://localhost:3001):**
- Real-time trade events
- AI learning broadcasts
- Position updates
- Market regime changes
- PnL tracking

---

## 🧠 AI Learning System

### How It Works

The bot uses adaptive learning to improve over time:

1. **Pattern Recognition**: Analyzes candlestick patterns on every token
2. **Trade Execution**: Enters based on AI confidence and pattern strength
3. **Outcome Tracking**: Records win/loss for each pattern used (including stop-loss exits)
4. **Confidence Adjustment**: Increases confidence for winning patterns, decreases for losing ones
5. **Hot/Cold Detection**: Boosts confidence +30% for hot patterns (>60% WR), reduces -30% for cold patterns (<40% WR)
6. **Strategy Weighting**: Adjusts which strategies get more influence based on performance

### Learning Data Persistence

All learning persists across restarts in `learningData.json`:

✅ Pattern performance stats (win rate per pattern)  
✅ Confidence score adjustments  
✅ Strategy effectiveness weights  
✅ Historical trade outcomes (wins AND losses)  
✅ Market regime performance  
✅ Risk lessons and optimal conditions  

**The bot gets smarter with every trade!**

### Candlestick Patterns Recognized

**Bullish Patterns (enter signals):**
- **BULLISH_ENGULFING**: Strong reversal signal
- **HAMMER**: Bottom reversal after downtrend
- **MORNING_STAR**: Three-candle reversal pattern
- **PIERCING_LINE**: Bullish reversal
- **THREE_WHITE_SOLDIERS**: Strong uptrend

**Bearish Patterns (avoid/exit signals):**
- **BEARISH_ENGULFING**: Strong reversal down
- **SHOOTING_STAR**: Top reversal signal
- **EVENING_STAR**: Three-candle top pattern
- **DARK_CLOUD_COVER**: Bearish reversal
- **THREE_BLACK_CROWS**: Strong downtrend

**Neutral Patterns (need confirmation):**
- **DOJI**: Indecision, watch for next move
- **SPINNING_TOP**: Low conviction, needs volume

---

## 📊 AI Decision Making

The bot combines multiple strategies for each decision:

### Strategy System

1. **EmperorBTC Strategy** - Candlestick patterns with market context
2. **Candlestick Strategy** (30% weight) - Pattern recognition and trend analysis
3. **Martingale Strategy** (40% weight) - Anti-martingale momentum detection
4. **Trend Reversal Strategy** (30% weight) - RSI-based reversal identification
5. **DCA Strategy** - Dollar-cost averaging for accumulation

### Decision Flow

```
Token Discovered
    ↓
7-Layer Protection Filters
    ↓
Strategy Analysis (All strategies vote)
    ↓
Pattern Extraction (from candlestick strategy)
    ↓
xAI Grok-3 Validation (analyzes all signals + market context)
    ↓
Adaptive Learning Adjustment (hot/cold pattern confidence boost/penalty)
    ↓
Final Decision: BUY (≥65% confidence) | HOLD (<65%) | REJECT (bearish/failed filters)
    ↓
Trade Execution with Entry Context Storage
    ↓
Position Monitoring (AI-optimized exits)
    ↓
Exit Recording (profit or stop-loss with real market data)
    ↓
Learning Update (pattern stats, regime performance, risk lessons)
```

### Final Decision Logic

- **BUY**: If confidence ≥ 65% and bullish patterns detected
- **HOLD**: If confidence < 65% or neutral patterns (not blacklisted, re-evaluated)
- **REJECT**: If bearish patterns or failed protection layers (blacklisted)

---

## 🔒 Security

- ✅ Never commit `.env` files to git
- ✅ Use OS credential store for private keys (keytar)
- ✅ Redact RPC URLs containing API keys before sharing
- ✅ Keep backups of your wallet private key offline
- ✅ All sensitive data excluded from GitHub repository

---

## 📁 Project Structure

```
SnipeBT/
├── src/
│   ├── main.ts                      # Main bot orchestration & monitoring loops
│   ├── trade.ts                     # Trade execution (Jupiter integration)
│   ├── validate.ts                  # 7-layer protection filtering
│   ├── positionManager.ts           # Position tracking
│   ├── riskManager.ts               # Risk management & position sizing
│   ├── snipehome.ts                 # Real-time dashboard (Socket.IO)
│   ├── aiBalanceTracker.ts          # RPC-efficient balance tracking
│   ├── aiAdaptiveLearning.ts        # Adaptive learning system (hot/cold detection)
│   ├── aiCandlestickMonitor.ts      # Candlestick pattern recognition
│   ├── aiDynamicExits.ts            # AI-optimized exit levels
│   ├── aiPriceCache.ts              # Price caching for RPC efficiency
│   ├── aiTradeIntelligence.ts       # Trade intelligence coordination (Grok-3)
│   ├── aiIntegration.ts             # AI system wiring layer
│   ├── config.ts                    # Configuration management
│   ├── secureConfig.ts              # Secure credential handling
│   ├── notifications.ts             # Telegram notifications
│   ├── rpcLimiter.ts                # RPC rate limiting
│   ├── cache.ts                     # Validation caching
│   ├── logging.ts                   # Logging utilities
│   ├── strategyIntegration.ts       # Strategy system integration
│   └── strategies/
│       ├── baseStrategy.ts          # Base strategy interface
│       ├── candlestickStrategy.ts   # Candlestick analysis
│       ├── emperorBTCStrategy.ts    # EmperorBTC pattern strategy
│       ├── martingaleStrategy.ts    # Momentum detection
│       ├── trendReversalStrategy.ts # Reversal identification
│       ├── dcaStrategy.ts           # Dollar-cost averaging
│       ├── strategyManager.ts       # Strategy coordination & voting
│       └── configs.ts               # Strategy configurations
├── scripts/
│   └── run-live.ps1                 # PowerShell runner (with --auto-tp --auto-sl)
├── logs/
│   └── dryrun.csv                   # Trade simulation logs
├── learningData.json                # AI learning persistence
├── tradeHistory.json                # Trade history log
├── balance-tracker.json             # Balance tracking state
├── entryPrices.json                 # Position entry prices
├── entryTimes.json                  # Position entry timestamps
├── rpc-stats.json                   # RPC usage statistics
├── .env.example                     # Configuration template
├── package.json
└── tsconfig.json
```

---

## 🐛 Troubleshooting

### Bot Not Trading?

**Check Protection Filters:**
```bash
# Review logs for rejection reasons:
# - "Token XXX failed liquidity validation: $YYY < $15000"
# - "Token XXX failed rug check with score YYY (extreme rug)"
# - "Token XXX too young: X.X min < 5 min (first candle rule)"
# - "Low RVOL X.XXx (< 1.5x) - weak conviction"
```

**Common Fixes:**
- ✅ Lower `MIN_LIQUIDITY_USD` to 10000 (if you want riskier plays)
- ✅ Lower `MIN_RVOL` to 1.2 (less strict volume filter)
- ✅ Increase `MAX_RUG_SCORE` to 1000 (allow higher-risk tokens)
- ✅ Lower `MIN_TOKEN_AGE_MINUTES` to 3 (catch earlier launches)
- ✅ Lower `AI_MIN_CONFIDENCE` to 60 (accept lower confidence)

### Bot Holding Positions Too Long?

**AI Exit Not Triggering:**
- Check `AUTO_TAKEPROFIT=true` and `AUTO_STOPLOSS=true` in `.env`
- Verify `--auto-tp --auto-sl` flags in `run-live.ps1`
- Monitor AI exit analysis in console logs
- Bearish patterns should trigger exits automatically

**Manual Sell:**
```bash
npx ts-node sell-all-positions.ts
```

### RPC Rate Limit Errors?

**Solutions:**
- Use QuickNode or paid RPC (2.5M requests/day on Build plan)
- Check RPC usage: `cat rpc-stats.json`
- Increase `SCAN_INTERVAL_SECONDS` to reduce request frequency
- Balance tracker already optimized (saves 3,000+ calls/day)

### Learning Data Not Persisting?

**Check Files:**
```bash
# These files should exist after first trades:
ls learningData.json      # AI learning state
ls tradeHistory.json      # Trade outcomes
ls balance-tracker.json   # Balance state
```

**Reset Learning (if needed):**
```bash
rm learningData.json
# Bot will create fresh learning data on next start
```

### Telegram Notifications Not Working?

**Verify Configuration:**
```env
TELEGRAM_BOT_TOKEN=your_actual_bot_token_from_BotFather
TELEGRAM_CHAT_ID=your_actual_chat_id
```

**Test Notification:**
```bash
node test-telegram.js
```

### Grok API Errors?

**502 Bad Gateway:**
- Temporary xAI server outage (bot has fallback logic)
- Bot will continue trading using signal thresholds

**401 Authentication:**
- Verify `XAI_API_KEY` in `.env` is correct
- Key should start with `xai-`

---

## 📈 Performance Tips

### Optimized for Small Capital ($100-200)

- **Trade Size**: 0.15 SOL (~$25) allows 4-5 concurrent positions
- **Max Positions**: 5 prevents over-diversification
- **7-Layer Protection**: Filters 95%+ of rugs and low-quality tokens
- **First Candle Rule**: Avoids 60% of rugs that happen in first 5 minutes
- **High Confidence Threshold**: 65%+ ensures only strong setups

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
- **Hot/Cold Detection**: After 5+ trades per pattern, confidence adjustments activate

### Risk Management

- **Small Position Sizes**: 0.15 SOL = manageable losses
- **Multiple Protection Layers**: Each filter reduces risk significantly
- **AI Confidence Gating**: Won't trade on weak signals
- **Adaptive Learning**: Learns from mistakes to avoid repeating them
- **Dynamic Stop-Loss**: AI-optimized levels (-4% to -15%) based on volatility

### Best Practices

1. **Start Small**: Run with 0.1 SOL trades first to verify behavior
2. **Monitor Learning**: Check `learningData.json` after 10 trades
3. **Review Rejections**: Understand why tokens are filtered (logs show reasons)
4. **Tune Protection**: Adjust filters based on your risk tolerance
5. **Trust the AI**: Don't override decisions - let it learn and adapt
6. **Watch Dashboard**: Monitor SNIPEHOME (ws://localhost:3001) for real-time insights

---

## 🔧 Advanced Configuration

### Fine-Tuning Protection Layers

**Conservative (safer, fewer trades):**
```env
MIN_LIQUIDITY_USD=20000
MIN_VOLUME24H_USD=15000
MIN_RVOL=2.0
MAX_RUG_SCORE=500
MIN_TOKEN_AGE_MINUTES=10
AI_MIN_CONFIDENCE=70
```

**Aggressive (more trades, higher risk):**
```env
MIN_LIQUIDITY_USD=10000
MIN_VOLUME24H_USD=5000
MIN_RVOL=1.2
MAX_RUG_SCORE=1000
MIN_TOKEN_AGE_MINUTES=3
AI_MIN_CONFIDENCE=60
```

**Balanced (recommended default):**
```env
MIN_LIQUIDITY_USD=15000
MIN_VOLUME24H_USD=10000
MIN_RVOL=1.5
MAX_RUG_SCORE=750
MIN_TOKEN_AGE_MINUTES=5
AI_MIN_CONFIDENCE=65
```

### Strategy Modes

Available in `STRATEGY_MODE`:

- **aggressive** - All strategies enabled, high-risk/high-reward
- **balanced** - Moderate approach with multiple strategies
- **conservative** - Fewer strategies, stricter filters
- **emperorBTC** - EmperorBTC candlestick-focused
- **scalping** - Quick entries/exits
- **dcaOnly** - Dollar-cost averaging only

---

## ⚠️ Disclaimer

**IMPORTANT - READ CAREFULLY:**

- ⚠️ This bot is for **educational and research purposes only**
- ⚠️ Cryptocurrency trading carries **significant financial risk**
- ⚠️ You can **lose all your invested capital**
- ⚠️ This software is provided "**AS IS**" with **no guarantees of profit**
- ⚠️ Past performance (if any) **does not indicate future results**
- ⚠️ The AI learning system is **experimental** and may make mistakes
- ⚠️ Always test with **small amounts first** (0.05-0.1 SOL)
- ⚠️ **Never trade with funds you cannot afford to lose**
- ⚠️ The developers assume **no liability for your trading losses**
- ⚠️ You are responsible for **complying with local trading regulations**
- ⚠️ **Use at your own risk**

### Recommended Safe Usage

✅ Start with test amounts (0.05-0.1 SOL per trade)  
✅ Monitor closely for first 10-20 trades  
✅ Review learning data to understand AI behavior  
✅ Keep majority of capital in cold storage  
✅ Set stop-loss limits for yourself (e.g., max 20% of wallet)  
✅ Understand that memecoins are **highly volatile and risky**  

---

## 📝 License

MIT License - See LICENSE file for details

**Key Points:**
- Free to use, modify, and distribute
- No warranty or guarantee of any kind
- Authors not liable for any damages
- Use at your own risk
- Not Financial Advice

---

## 🤝 Contributing

Contributions are welcome! Here's how:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes (test thoroughly!)
4. Commit changes: `git commit -m "Add your feature"`
5. Push to branch: `git push origin feature/your-feature`
6. Open a Pull Request with description of changes

### Areas for Contribution

- 🧠 Additional candlestick patterns
- 📊 New trading strategies
- 🛡️ Enhanced protection filters
- 📈 Performance analytics dashboard
- 🔔 Additional notification channels
- 📚 Documentation improvements
- 🧪 Test coverage expansion
- 🎨 SNIPEHOME dashboard UI

---

## 📞 Support

- **Issues**: Reach out to me, ill answer that I can.
- **Discussions**: Use GitHub Discussions for strategy ideas
- **Pull Requests**: Submit improvements via PR

**Please DO NOT share:**

❌ Your wallet private keys  
❌ RPC API keys or URLs  
❌ Telegram bot tokens  
❌ xAI API keys  
❌ Any other sensitive credentials  

---

## 🌟 Features Roadmap

### Current (v2.0)

✅ AI adaptive learning with hot/cold pattern detection  
✅ 7-layer protection system  
✅ Candlestick pattern recognition  
✅ xAI Grok-3 integration  
✅ RPC optimization  
✅ Multi-strategy decision making  
✅ First candle rule  
✅ SNIPEHOME real-time dashboard  
✅ AI-optimized dynamic exits  
✅ Stop-loss recording and learning  
✅ Complete trade outcome tracking  

### Planned (v3.0)

🔄 Enhanced web dashboard with analytics  
🔄 Advanced backtesting framework  
🔄 Multi-wallet support  
🔄 Portfolio rebalancing  
🔄 Social sentiment analysis  
🔄 Advanced stop-loss strategies  
🔄 Historical pattern performance charts  
🔄 Strategy performance analytics  

---

## 🔐 Security Reminders

- 🔐 **Never commit `.env` files to version control**
- 🔐 **Use OS credential storage for private keys (keytar)**
- 🔐 **Redact RPC URLs containing API keys before sharing**
- 🔐 **Keep backups of your wallet private key in secure offline storage**
- 🧪 **Test with small amounts before scaling up**
- 📊 **Monitor performance and adjust settings as needed**

---

**Happy Trading! Stay Safe! 🚀**

*Remember: The AI learns from both wins AND losses. Give it time to calibrate (10-20 trades), and it will continuously improve its decision-making!*








