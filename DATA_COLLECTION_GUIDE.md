# 🚀 Deep Learning Data Collection - Quick Start Guide

## ✅ Pre-flight Checklist

Before running data collection, ensure:

1. **Environment Variable Set**
   ```powershell
   # Check if BIRDEYE_API_KEY is set
   $env:BIRDEYE_API_KEY
   ```
   If not set, add to your `.env` file:
   ```
   BIRDEYE_API_KEY=your_actual_api_key_here
   ```

2. **Dependencies Installed**
   ```powershell
   # TypeScript dependencies already installed ✅
   # Python dependencies (for later training):
   pip install -r requirements.txt
   ```

3. **Sufficient Disk Space**
   - Estimated size: ~500MB for 1M examples
   - Check free space: Should have at least 2GB free

## 🏃 Run Data Collection

### Option 1: Full Collection (1M examples, ~12-24 hours)
```powershell
npx ts-node src/deepLearning/dataCollector.ts
```

### Option 2: Test Collection (10K examples, ~10-20 minutes)
Edit `dataCollector.ts` line 564:
```typescript
collector.collectTrainingData(10_000)  // Changed from 1_000_000
```
Then run:
```powershell
npx ts-node src/deepLearning/dataCollector.ts
```

## 📊 What to Expect

### API Usage Estimates:
- **Dexscreener**: FREE, ~300 requests/hour (well within limits)
- **Birdeye**: ~2-3 requests/second = ~7,200-10,800 requests/hour
  - For 1M examples: ~35,000-40,000 total requests
  - Check your Birdeye plan limits!

### Timeline:
- **10K examples**: 10-20 minutes
- **100K examples**: 2-4 hours  
- **1M examples**: 12-24 hours

### Output Files:
- `trainingData_checkpoint.json` - Auto-saved every 50 tokens
- `trainingData_full.json` - Final dataset when complete

### Progress Indicators:
```
🧠 Starting deep learning data collection (target: 1,000,000 examples)
✅ Birdeye API key configured (length: 32)
📊 Resuming from 0 existing examples
🕒 Estimated time: ~16h 40m

🔍 Fetching ~33,334 tokens from multiple sources...
✅ Dexscreener: 250 tokens
✅ Birdeye: 180 tokens
⚠️ Raydium token fetching not yet implemented
🪙 Found 430 tokens to process

📈 PEPE: 43 examples from 8640 candles
📈 BONK: 51 examples from 8640 candles
💾 Checkpoint: 2,500/1,000,000 examples (0.3%) - 997,500 remaining
📊 birdeye usage: 500 calls, 3 errors (0.6% error rate)
```

## ⚠️ Safety Features

### API Rate Limiting:
- ✅ Built-in rate limiters (5/sec Dexscreener, 2/sec Birdeye)
- ✅ Automatic retry with exponential backoff
- ✅ Usage tracking every 100 calls
- ✅ Hourly counter resets

### Data Quality:
- ✅ Filters zero/negative prices
- ✅ Validates OHLCV relationships
- ✅ Removes extreme outliers (>1000% change)
- ✅ Detects time gaps in candles
- ✅ Minimum liquidity filter ($1,000)

### Error Handling:
- ✅ Automatic checkpoint saves (every 50 tokens)
- ✅ Resume from checkpoint on restart
- ✅ Continues on individual token failures
- ✅ Detailed error logging

## 🛑 How to Stop Safely

Press `Ctrl+C` - The script will:
1. Save current progress to checkpoint
2. Exit gracefully
3. Resume from checkpoint on next run

## 📝 After Collection

Once complete, run:

```powershell
# 1. Preprocess data
python src/deepLearning/preprocessor.py

# 2. Convert scalers for TypeScript
python src/deepLearning/convert_scalers.py

# 3. Train enhanced model
python src/deepLearning/model_v2_enhanced.py

# 4. Integrate with bot (automatic)
npm start
```

## 🐛 Troubleshooting

### "BIRDEYE_API_KEY is required"
- Add key to `.env` file
- Restart terminal to load environment

### "Rate limit hit"
- Script automatically retries with backoff
- If persistent, reduce `birdeyeLimit` to `pLimit(1)`

### "Insufficient valid candles"
- Normal - some tokens have poor data quality
- Script automatically skips and continues

### High error rate (>10%)
- Check Birdeye API key validity
- Check internet connection
- Check Birdeye service status

## 💰 Cost Estimate

### Birdeye API (most restrictive):
- **Free tier**: 100 requests/minute = 6,000/hour
  - ~3-4 hours for 10K examples ✅
  - **NOT RECOMMENDED for 1M examples** (would take 6-7 days)
  
- **Pro tier** ($99/mo): 1,000 requests/minute = 60,000/hour
  - ~1 hour for 10K examples ✅
  - ~12-16 hours for 1M examples ✅

### Recommendation:
1. **Test first**: Collect 10K examples on free tier
2. **Upgrade if needed**: For 1M collection, Pro tier recommended
3. **Alternative**: Collect in batches over multiple days on free tier

## ✅ System is Optimized

All critical issues fixed:
- ✅ Logger errors resolved (using console)
- ✅ API key validation at startup
- ✅ Retry logic with exponential backoff
- ✅ Data quality validation
- ✅ Usage tracking and monitoring
- ✅ Frequent checkpoints (every 50 tokens)
- ✅ Time estimation
- ✅ Error rate tracking

**System is ready for production data collection!** 🚀
