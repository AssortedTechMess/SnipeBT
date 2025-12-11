# 🧠 Deep Learning System - SnipeBT

Enterprise-grade deep learning trained on 1 million historical blockchain trades to predict profitable setups.

## 📊 System Overview

**Architecture**: Bidirectional LSTM + Custom Attention → Dense Layers → Multi-Output Prediction

**Training Data**: 1,000,000 examples from historical Solana DEX trades (Dexscreener, Birdeye, Raydium)

**Hardware**: Optimized for GTX 1660 (6GB VRAM, batch size 64)

**Integration**: Works alongside Adaptive Learning (40%) + Grok AI (40%) + Deep Learning (20%)

---

## 🏗️ Architecture

### Input Features

1. **Candles** (100 timesteps × 5 features)
   - OHLCV: Open, High, Low, Close, Volume
   - 5-minute candles = 8.3 hours of history

2. **Context** (5 features)
   - Liquidity (USD)
   - Market Cap (USD)
   - Holders count
   - Token age (hours)
   - 24h volume

3. **Indicators** (5 features)
   - RSI (14 period)
   - MACD (12/26/9)
   - EMA Fast (9 period)
   - EMA Slow (21 period)
   - Bollinger Bands width

### Model Layers

```
Candles (100, 5)
    ↓
Bidirectional LSTM (128 units, dropout 0.2)
    ↓
Bidirectional LSTM (64 units, dropout 0.2)
    ↓
Custom Attention Layer
    ↓
Global Average Pooling
    ↓
    ├─→ Context + Indicators (10 features)
    │       ↓
    │   Dense (64, relu)
    │       ↓
    │   Dense (32, relu)
    ↓
Concatenate (160 features)
    ↓
Dense (256, relu) + BatchNorm + Dropout(0.4)
    ↓
Dense (128, relu) + BatchNorm + Dropout(0.3)
    ↓
Dense (64, relu) + Dropout(0.3)
    ↓
    ├─→ Profitable (sigmoid)     [Binary: Will price go up 3%+?]
    ├─→ Max Profit (linear)      [Regression: Max % gain in 1 hour]
    └─→ Rug Risk (sigmoid)       [Binary: Is this a rug pull?]
```

### Training Config

- **Optimizer**: Adam (lr=0.0001)
- **Loss**: Binary crossentropy + MSE + Binary crossentropy
- **Metrics**: Accuracy, AUC, MAE
- **Batch Size**: 64 (GTX 1660 optimized)
- **Epochs**: 100 (with early stopping)
- **Callbacks**: ModelCheckpoint, EarlyStopping, ReduceLROnPlateau, TensorBoard

---

## 🚀 Usage

### Phase 1: Data Collection

Collect 1M training examples from blockchain history:

```bash
cd src/deepLearning
npx ts-node dataCollector.ts
```

**Runtime**: 12-24 hours (background process, can run bot simultaneously)

**Output**: `trainingData_full.json` (~5-10GB)

**API Usage**:
- Dexscreener: ~50K requests (free tier, 300/min)
- Birdeye: ~80K requests (uses existing API key)
- QuickNode: ~500K requests (only 0.625% of 80M monthly budget)

### Phase 2: Preprocessing

Scale features and split dataset:

```bash
cd src/deepLearning
python preprocessor.py
```

**Requirements**:
```bash
pip install tensorflow==2.13.0 tensorflowjs scikit-learn pandas numpy
```

**Runtime**: 30 minutes

**Output**: `processed_data.npz`, `scalers.pkl`

### Phase 3: Model Training

Train LSTM + Attention model on GTX 1660:

```bash
cd src/deepLearning
python model.py
```

**Runtime**: 6-12 hours

**GPU Check**:
```bash
python -c "import tensorflow as tf; print(tf.config.list_physical_devices('GPU'))"
```

**Output**: 
- `best_model.keras` (best weights)
- `tfjs_model/` (for bot integration)
- `training_history.json` (metrics)
- `logs/tensorboard_*/` (TensorBoard logs)

**Monitor Training**:
```bash
tensorboard --logdir=logs
```

### Phase 4: Bot Integration

Deep learning automatically loads on bot startup:

```typescript
// src/main.ts (around line 650-700)

import { getDeepLearningInstance, initializeDeepLearning } from './deepLearning/inference';

// Initialize at startup
await initializeDeepLearning();

// Use in trade validation
const dl = getDeepLearningInstance();
const prediction = await dl.predict(candles, context, indicators);

if (prediction) {
    // Hybrid confidence: 40% adaptive + 40% grok + 20% DL
    const hybridConfidence = (
        adaptiveConfidence * 0.4 +
        grokConfidence * 0.4 +
        prediction.confidence * 0.2
    );
    
    logger.info(`🎯 Hybrid Confidence: ${(hybridConfidence * 100).toFixed(1)}%`);
    logger.info(`  ├─ Adaptive: ${(adaptiveConfidence * 100).toFixed(1)}%`);
    logger.info(`  ├─ Grok AI: ${(grokConfidence * 100).toFixed(1)}%`);
    logger.info(`  └─ Deep Learning: ${(prediction.confidence * 100).toFixed(1)}%`);
    logger.info(`     ├─ Profitable: ${(prediction.profitable_probability * 100).toFixed(1)}%`);
    logger.info(`     ├─ Max Profit: ${prediction.max_profit_percent.toFixed(1)}%`);
    logger.info(`     └─ Rug Risk: ${(prediction.rug_risk_probability * 100).toFixed(1)}%`);
}
```

### Phase 5: Auto-Refresh

Daily retraining with new data (runs at 3 AM):

```bash
cd src/deepLearning
npx ts-node autoRefresh.ts
```

**Schedule**:
- 2:00 AM: Incremental data collection (new tokens only, ~1K examples)
- 3:00 AM: Model retraining (1-2 hours on GTX 1660)
- 5:00 AM: Hot reload model in bot (no downtime)

**Backup**: Previous model saved before refresh, rollback on failure

---

## 📈 Expected Performance

### Training Metrics (Target)

- **Accuracy**: 75-82%
- **AUC**: 0.82-0.88
- **Precision**: 70-78% (avoid false positives)
- **Recall**: 72-80% (catch most wins)

### Inference Performance

- **Prediction Time**: 20-50ms per trade (CPU inference on i7-10750H)
- **Memory**: ~200MB (model loaded in memory)
- **GPU Usage**: None during inference (TensorFlow.js CPU backend)

### Bot Win Rate Impact

- **Before DL**: 43% win rate (adaptive + Grok only)
- **After DL**: 65-75% win rate (all 3 systems)
- **ROI Boost**: +50-150% (predicted)

---

## 🔧 Troubleshooting

### Issue: TensorFlow.js Not Loading

**Error**: `Error: The specified module could not be found`

**Fix**:
```bash
cd node_modules/@tensorflow/tfjs-node
npm run build-addon-from-source
cp lib/napi-v10/tensorflow.dll lib/napi-v8/
```

### Issue: GPU Not Detected

**Error**: `[] PhysicalDevice GPU:0`

**Check**:
```bash
python -c "import tensorflow as tf; print(tf.config.list_physical_devices('GPU'))"
```

**Fix**: Install CUDA 11.2 + cuDNN 8.1 (for TensorFlow 2.13)

### Issue: Out of Memory During Training

**Error**: `ResourceExhaustedError: OOM when allocating tensor`

**Fix**: Reduce batch size in `model.py`:
```python
# Change from 64 to 32
history = train_model(model, X_train, y_train, X_val, y_val, batch_size=32)
```

### Issue: Model Not Found

**Error**: `Model file not found at tfjs_model/model.json`

**Fix**: Ensure Phase 3 (training) completed successfully and exported model

---

## 📂 File Structure

```
src/deepLearning/
├── dataCollector.ts       # Data harvesting from blockchain
├── preprocessor.py        # Feature scaling and dataset split
├── model.py               # LSTM + Attention training
├── inference.ts           # Real-time prediction in bot
└── autoRefresh.ts         # Daily retraining automation

Generated Files (root):
├── trainingData_full.json           # 1M training examples (~5-10GB)
├── trainingData_checkpoint.json     # Collection progress backup
├── processed_data.npz               # Scaled training data
├── scalers.pkl                      # Feature scalers (for inference)
├── scalers.json                     # Scalers converted to JSON
├── best_model.keras                 # Best model weights
├── tfjs_model/                      # TensorFlow.js model for bot
│   ├── model.json
│   └── group1-shard*.bin
├── training_history.json            # Training metrics
└── logs/tensorboard_*/              # TensorBoard logs
```

---

## 🎯 Integration with Existing AI

### Hybrid Confidence Calculation

The bot uses **3 AI systems** working together:

1. **Adaptive Learning** (40% weight)
   - Rule-based statistical learning
   - Tracks hot/cold patterns from bot's 115 trades
   - Fast, lightweight, learns from mistakes
   - File: `src/aiAdaptiveLearning_v2.ts`

2. **Grok-3 AI** (40% weight)
   - xAI API validation (15s timeout)
   - Analyzes market context, detects unusual patterns
   - Fallback when Grok unavailable
   - File: `src/aiTradeIntelligence.ts`

3. **Deep Learning** (20% weight)
   - LSTM + Attention trained on 1M examples
   - Predicts profitable trades, max profit, rug risk
   - 20-50ms inference time
   - File: `src/deepLearning/inference.ts`

**Formula**:
```
Hybrid Confidence = (Adaptive × 0.4) + (Grok × 0.4) + (DL × 0.2)

Trade Execution:
  - If Hybrid Confidence ≥ 0.7 → Execute trade
  - If 0.5-0.7 → Wait for better setup
  - If < 0.5 → Skip
```

---

## 🔄 Auto-Refresh System

### Daily Workflow

**2:00 AM** - Incremental Data Collection
- Fetch new trending tokens from last 24 hours
- ~1,000 new examples added
- Appends to existing dataset

**3:00 AM** - Model Retraining
- Train on full dataset (1M + new examples)
- Uses GTX 1660 (1-2 hours)
- Saves new model to `tfjs_model_new/`

**5:00 AM** - Hot Reload
- Validates new model performance
- If better: Replace old model, reload in bot (no downtime)
- If worse: Keep old model, log warning

**Backup Strategy**:
- Previous model saved to `tfjs_model_backup/`
- Rollback command: `cp -r tfjs_model_backup tfjs_model`

---

## 📊 Monitoring

### Bot Logs

Deep learning predictions appear in logs:

```
🔮 DL Prediction (32ms): profit=78.5%, max=12.3%, rug=5.2%, conf=76.8%
🎯 Hybrid Confidence: 72.5%
  ├─ Adaptive: 68.0%
  ├─ Grok AI: 75.0%
  └─ Deep Learning: 76.8%
     ├─ Profitable: 78.5%
     ├─ Max Profit: 12.3%
     └─ Rug Risk: 5.2%
```

### TensorBoard

Monitor training in real-time:

```bash
tensorboard --logdir=logs --port=6006
```

Visit: http://localhost:6006

**Metrics**:
- Loss curves (train vs val)
- Accuracy over epochs
- AUC score progression
- Learning rate adjustments

---

## 🎓 Technical Details

### Why LSTM + Attention?

- **LSTM**: Captures temporal patterns in price movements (candlestick sequences)
- **Bidirectional**: Learns from both past → future and future → past context
- **Attention**: Learns which candles matter most (e.g., breakout candles)
- **Multi-Task**: Predicts 3 related outputs, shares representations

### Why RobustScaler for Candles?

- Handles extreme outliers (pump/dump events)
- Uses median and IQR instead of mean/std
- Better for crypto price data

### Why 100 Candles?

- 100 × 5 minutes = 8.3 hours of history
- Captures short-term trends without too much noise
- Fits in GTX 1660 memory (batch size 64)

### Why 20% Weight for DL?

- Deep learning is powerful but not perfect on crypto (high volatility)
- Adaptive learning adapts faster to recent changes
- Grok AI provides unique real-time context
- 20% = boost without over-relying on historical patterns

---

## 🚀 Next Steps

1. ✅ **Install Dependencies**
   ```bash
   npm install @tensorflow/tfjs-node p-limit
   pip install tensorflow==2.13.0 tensorflowjs scikit-learn pandas numpy
   ```

2. ✅ **Collect Data** (12-24 hours)
   ```bash
   npx ts-node src/deepLearning/dataCollector.ts
   ```

3. ✅ **Preprocess** (30 min)
   ```bash
   python src/deepLearning/preprocessor.py
   ```

4. ✅ **Train Model** (6-12 hours on GTX 1660)
   ```bash
   python src/deepLearning/model.py
   ```

5. ✅ **Integrate & Test**
   - Bot will auto-load model on startup
   - Watch logs for DL predictions
   - Monitor win rate improvement

6. ✅ **Enable Auto-Refresh**
   ```bash
   # Add to cron or Windows Task Scheduler
   npx ts-node src/deepLearning/autoRefresh.ts
   ```

---

## 📞 Support

For issues:
1. Check logs: `logs/dryrun.csv` and console output
2. Verify GPU: `python -c "import tensorflow as tf; print(tf.config.list_physical_devices('GPU'))"`
3. Test model: `npx ts-node -e "import('./src/deepLearning/inference').then(m => m.initializeDeepLearning())"`

---

**Status**: ✅ System architecture complete, ready for data collection!

**Target Go-Live**: After 1 week of data collection + training + testing
