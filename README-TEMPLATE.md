# SnipeBT - Solana Trading Bot

A sophisticated automated trading bot for Solana tokens featuring multi-strategy support, RVOL (Relative Volume) filtering, and advanced risk management.

## 🚀 Features

- **Multi-Strategy System**: emperorBTC, conservative, balanced, aggressive, scalping, dcaOnly
- **RVOL Filtering**: Only trade tokens with 1.5x+ average volume for high-conviction moves
- **Volume Analysis**: Filter by 24h and 1h volume thresholds
- **Position Management**: Automatic take-profit and position tracking
- **Secure Configuration**: OS-level credential storage using keytar
- **Telegram Notifications**: Real-time trade alerts (optional)
- **Jupiter Integration**: DEX aggregation for best swap rates

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
# RPC Endpoint (get from QuickNode or use public)
RPC_URL=https://api.mainnet-beta.solana.com
BACKUP_RPC_URL=https://solana-api.projectserum.com

# Trading Strategy
STRATEGY_MODE=aggressive        # emperorBTC, conservative, balanced, aggressive, scalping
TRADE_AMOUNT_SOL=0.15          # Amount per trade
MAX_POSITIONS=10               # Max concurrent positions
TAKEPROFIT_MIN_PCT=2.0         # Take profit at 2%
SLIPPAGE_BPS=150               # 1.5% slippage tolerance

# Volume Filtering (RVOL - NEW!)
MIN_RVOL=1.5                   # Require 1.5x average hourly volume
MIN_VOL24_USD=25000           # Minimum 24h volume
MIN_VOLUME1H_USD=1000         # Minimum 1h volume
```

### Volume Analysis (RVOL)

RVOL (Relative Volume) filters out low-conviction tokens:
- **Formula**: `RVOL = vol1h / (vol24h / 24)`
- **Purpose**: Only trade when current volume is 1.5x+ the average
- **Example**: If 24h vol = $24k (avg $1k/hour), and 1h vol = $2k, then RVOL = 2.0x ✅
- **Benefit**: Prevents buying tokens during low-activity periods that won't move

## 🚀 Usage

### Compile TypeScript
```bash
npx tsc
```

### Run the Bot
```bash
node dist/main.js
# or with PowerShell script:
.\scripts\run-live.ps1
```

### Check Balance
```bash
npx ts-node check-balance.ts
```

### Emergency Sell All Positions
```bash
npx ts-node sell-all-positions.ts
```

## 📊 Strategy Modes

- **emperorBTC**: AI-driven strategy based on market sentiment
- **aggressive**: High-risk, high-reward quick trades (2% TP, RVOL filtered)
- **balanced**: Medium risk with volume confirmation
- **conservative**: Low risk, higher volume requirements
- **scalping**: Very quick trades with tight targets
- **dcaOnly**: Dollar-cost averaging into positions

## 🔒 Security

- **Never commit `.env`** files to git
- **Use OS credential store** for private keys (keytar)
- **Redact RPC URLs** containing API keys before sharing
- **Keep backups** of your wallet private key offline

## 📁 Project Structure

```
SnipeBT/
├── src/
│   ├── main.ts                 # Main bot loop
│   ├── trade.ts                # Trade execution
│   ├── validate.ts             # Token filtering (RVOL here!)
│   ├── positionManager.ts      # Position tracking
│   ├── config.ts               # Configuration
│   ├── secureConfig.ts         # Secure credential handling
│   ├── storeSecret.ts          # Helper to store secrets
│   └── strategies/
│       ├── baseStrategy.ts
│       ├── emperorBTCStrategy.ts
│       ├── dcaStrategy.ts
│       └── ...
├── scripts/
│   └── run-live.ps1           # PowerShell runner
├── .env.example               # Template configuration
├── package.json
└── tsconfig.json
```

## 🐛 Troubleshooting

### Bot not trading?
- Check RVOL filter isn't too strict (lower MIN_RVOL to 1.2)
- Verify volume thresholds aren't too high
- Check RPC connection is working

### Positions held too long?
- Lower TAKEPROFIT_MIN_PCT (try 1.5% or 2%)
- Increase MIN_RVOL for higher conviction moves

### RPC rate limits?
- Use QuickNode or similar paid RPC
- Increase SCAN_INTERVAL_SECONDS

## 📈 Performance Tips

1. **RVOL = 1.5x**: Filters 80% of low-conviction tokens
2. **2% Take-Profit**: Faster exits than 2.5%, more winning trades
3. **0.15 SOL trades**: Good balance for $100-200 capital
4. **Max 10 positions**: Prevents over-diversification

## ⚠️ Disclaimer

This bot is for educational purposes. Crypto trading carries significant risk. Only trade with funds you can afford to lose. Always test strategies with small amounts first.

## 📝 License

MIT License - See LICENSE file for details

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Submit a pull request

## 📞 Support

For issues and questions, open a GitHub issue.

---

**Remember**: Never share your wallet private key or RPC API keys publicly!
