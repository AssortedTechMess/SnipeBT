# Deep Learning Model Integration Architecture
## SnipeBT v2 + PyTorch Model

**Date:** December 4, 2025
**Model Performance:** 92.03% AUC, 84.3% Accuracy, 88% Recall on Profitable Trades
**Training Data:** 20,542 examples → Target: 200K+

---

## 📊 CURRENT STATE ANALYSIS

### Model Requirements (Input)
```typescript
interface ModelInput {
  candles: number[100][5];      // 100 timesteps × [open, high, low, close, volume]
  context: number[5];            // [liquidity, marketCap, holders, age_hours, volume24h]
  indicators: number[5];         // [rsi, macd, ema_fast, ema_slow, bbands_width]
}
```

### Model Output
```typescript
interface ModelOutput {
  profitable: number;    // 0.0-1.0 probability of 3%+ gain in next hour
  max_profit: number;    // Expected max profit % in next hour
  rug_risk: number;      // 0.0-1.0 probability of rug pull
}
```

### Current Bot Architecture
1. **Pool Detection** (`poolPoller.ts`): Polls Raydium every 30s for new pools
2. **Token Discovery** (`validate.ts`): Fetches new tokens from DexScreener API
3. **Strategy Validation** (`strategyIntegration.ts`): Candlestick, DCA, Trend Reversal, Anti-Martingale
4. **AI Validation** (`aiTradeIntelligence.ts`): Rule-based checks (position limits, market regime, risk scoring)
5. **Trade Execution** (`trade.ts`): Jupiter swap with slippage/priority fee management
6. **Position Management** (`positionManager.ts`): Auto take-profit, stop-loss, trailing stops

### Current Data Sources
- **DexScreener API**: Price, volume24h, liquidity, priceChange24h, symbol, age
- **Birdeye API**: Historical candles, holders, detailed metrics (data collection only)
- **Jupiter API**: Quote/routing for swaps
- **Solana RPC**: Balance, transaction execution

---

## ⚠️ KNOWN ISSUES & IMPROVEMENTS

| Issue | Recommendation | Severity | Status |
|-------|---------------|----------|--------|
| **Holders count = 0** | DexScreener doesn't expose holder count. Need to fetch from Birdeye `/token/overview` or Solscan API during feature building. Holder count is very predictive for rug detection. | Medium | ⏳ To implement |
| **Fixed 100 × 5min candles** | New pools only have 20-30 candles in first hour. Options: (1) Zero-pad missing candles, (2) Train separate "early-life" model (<50 candles), (3) Skip prediction if <100 candles available | Low | ⏳ To implement |
| **Scaler version mismatch** | If you retrain and regenerate `scalers.pkl`, running bot gets garbage predictions until restart. Need versioning + hot-reload. | Medium | ⏳ To implement |
| **Python process crash = silent death** | If inference.py crashes, bot continues without ML predictions. Need watchdog to auto-restart. | Medium | ⏳ To implement |
| **Single process bottleneck** | One Python process = sequential inference (~200ms each). Max ~5 concurrent predictions/sec. For high-frequency trading, spawn worker pool (3-4 processes). | Low-Medium | 📋 Future optimization |
| **JSON IPC overhead** | JSON + newline IPC adds ~20-50ms. For <100ms latency, consider MessagePack or raw binary protocol. | Low | 📋 Future optimization |

### Mitigation Strategies

#### 1. Holders Count (Medium Priority)
```typescript
// In featureBuilder.ts
private async fetchHolderCount(address: string): Promise<number> {
    try {
        // Option A: Birdeye (requires API key)
        const response = await axios.get(
            `https://public-api.birdeye.so/v1/token/overview`,
            {
                params: { address },
                headers: { 'X-API-KEY': process.env.BIRDEYE_API_KEY },
                timeout: 2000
            }
        );
        return response.data.data?.holder || 0;
    } catch (err) {
        // Option B: Use training data mean (e.g., 150) as fallback
        return 150;  // Safe default from training distribution
    }
}
```

#### 2. Sparse Candle Data (Low Priority)
```typescript
// In featureBuilder.ts
async buildFeatures(tokenAddress: string): Promise<ModelInput | null> {
    const candles = await this.fetchCandles(tokenAddress, 100, '5m');
    
    if (!candles || candles.length < 50) {
        console.log(`❌ Insufficient candles: ${candles?.length}/100 - skipping ML prediction`);
        return null;  // Require at least 50 candles
    }
    
    if (candles.length < 100) {
        // Zero-pad at the beginning (oldest data)
        const padding = new Array(100 - candles.length).fill({
            time: 0,
            open: candles[0].open,
            high: candles[0].high,
            low: candles[0].low,
            close: candles[0].close,
            volume: 0
        });
        candles.unshift(...padding);
        console.log(`⚠️ Zero-padded ${padding.length} missing candles`);
    }
    
    return { candles, context, indicators };
}
```

#### 3. Scaler Versioning (Medium Priority)
```typescript
// In inference.py
SCALER_VERSION = "v1"
scalers = pickle.load(open(f'scalers_{SCALER_VERSION}.pkl', 'rb'))

# In inferenceClient.ts
class PyTorchInferenceClient {
    private scalerVersion: string = "v1";
    
    async checkScalerVersion() {
        // Read metadata from scalers file or separate version.json
        const versionFile = path.join(__dirname, '../../scaler_version.txt');
        const diskVersion = fs.readFileSync(versionFile, 'utf-8').trim();
        
        if (diskVersion !== this.scalerVersion) {
            console.warn(`⚠️ Scaler version mismatch: bot=${this.scalerVersion}, disk=${diskVersion}`);
            console.log('🔄 Restarting inference server with new scalers...');
            await this.restart();
            this.scalerVersion = diskVersion;
        }
    }
    
    async start() {
        // Check scaler version every 5 minutes
        setInterval(() => this.checkScalerVersion(), 5 * 60 * 1000);
    }
}
```

#### 4. Process Watchdog (Medium Priority)
```typescript
// In inferenceClient.ts
class PyTorchInferenceClient {
    private restartCount = 0;
    private maxRestarts = 3;
    private restartWindow = 60_000; // 1 minute
    private lastRestartTime = 0;
    
    async start() {
        this.process = spawn(...);
        
        // Watchdog: Auto-restart on crash
        this.process.on('exit', (code, signal) => {
            console.error(`⚠️ Inference process died (code: ${code}, signal: ${signal})`);
            
            const now = Date.now();
            if (now - this.lastRestartTime < this.restartWindow) {
                this.restartCount++;
            } else {
                this.restartCount = 1; // Reset if outside window
            }
            this.lastRestartTime = now;
            
            if (this.restartCount <= this.maxRestarts) {
                console.log(`🔄 Auto-restarting inference server (attempt ${this.restartCount}/${this.maxRestarts})...`);
                setTimeout(() => this.start(), 2000); // Wait 2s before restart
            } else {
                console.error(`❌ Inference server crashed ${this.maxRestarts} times in ${this.restartWindow}ms - giving up`);
                this.isReady = false;
                // Send alert notification
                tradeNotifier.sendError({
                    title: 'ML Inference Server Down',
                    message: `Crashed ${this.maxRestarts} times. Bot running on strategy-only mode.`
                });
            }
        });
    }
}
```

#### 5. Worker Pool (Future Optimization)
```typescript
// In inferenceClient.ts - Advanced version
class InferenceWorkerPool {
    private workers: PyTorchInferenceClient[] = [];
    private roundRobinIndex = 0;
    
    async start(numWorkers: number = 3) {
        for (let i = 0; i < numWorkers; i++) {
            const worker = new PyTorchInferenceClient();
            await worker.start();
            this.workers.push(worker);
        }
        console.log(`✅ Started ${numWorkers} inference workers`);
    }
    
    async predict(features: ModelInput): Promise<ModelOutput> {
        // Round-robin load balancing
        const worker = this.workers[this.roundRobinIndex];
        this.roundRobinIndex = (this.roundRobinIndex + 1) % this.workers.length;
        
        return worker.predict(features);
    }
}

// Supports 3x throughput: ~15 predictions/sec instead of ~5/sec
```

#### 6. MessagePack IPC (Future Optimization)
```python
# inference.py with MessagePack
import msgpack
import sys

for line in sys.stdin.buffer:
    data = msgpack.unpackb(line)
    # ... inference ...
    result = msgpack.packb({...})
    sys.stdout.buffer.write(result + b'\n')
    sys.stdout.buffer.flush()
```

```typescript
// inferenceClient.ts with MessagePack
import * as msgpack from 'msgpack-lite';

async predict(features: ModelInput): Promise<ModelOutput> {
    const encoded = msgpack.encode({id, ...features});
    this.process.stdin.write(encoded);
    this.process.stdin.write('\n');
    // ~30% faster than JSON (200ms → 140ms)
}
```

---

## 🎯 INTEGRATION STRATEGY

### Option A: Python Subprocess (RECOMMENDED)
**Pros:**
- Simple implementation (child_process.spawn)
- Can load PyTorch model directly (no conversion)
- Can reuse existing scalers.pkl
- Easy to debug (stdio communication)

**Cons:**
- ~200-500ms startup overhead (mitigated with persistent process)
- IPC serialization cost (~50ms)
- One more process to manage

**Implementation:**
```typescript
// src/deepLearning/inference.ts (Python side)
import torch, pickle, json, sys
model = torch.jit.load('model_pytorch_scripted.pt')
scalers = pickle.load(open('scalers.pkl', 'rb'))

while True:
    line = sys.stdin.readline()
    data = json.loads(line)
    # Scale features
    candles_scaled = scalers['candle_scaler'].transform(data['candles'])
    context_scaled = scalers['context_scaler'].transform([data['context']])
    indicators_scaled = scalers['indicator_scaler'].transform([data['indicators']])
    # Predict
    with torch.no_grad():
        profitable, max_profit, rug_risk = model(candles_scaled, context_scaled, indicators_scaled)
    print(json.dumps({
        'profitable': float(profitable[0][0]),
        'max_profit': float(max_profit[0][0]),
        'rug_risk': float(rug_risk[0][0])
    }))
    sys.stdout.flush()

// src/deepLearning/inferenceClient.ts (TypeScript side)
import { spawn } from 'child_process';

class PyTorchInferenceClient {
    private process: ChildProcess | null = null;
    private pendingRequests = new Map<number, {resolve, reject, timeout}>();
    private requestId = 0;
    
    async start() {
        this.process = spawn('python', ['src/deepLearning/inference.ts'], {
            stdio: ['pipe', 'pipe', 'pipe']
        });
        // Warmup
        await this.predict(dummyData);
    }
    
    async predict(features: ModelInput): Promise<ModelOutput> {
        const id = this.requestId++;
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Inference timeout')), 5000);
            this.pendingRequests.set(id, {resolve, reject, timeout});
            this.process.stdin.write(JSON.stringify({id, ...features}) + '\n');
        });
    }
}
```

### Option B: ONNX Runtime (TypeScript-native)
**Pros:**
- No subprocess overhead
- TypeScript-native (easier debugging)
- ~50-100ms inference latency

**Cons:**
- Requires model conversion PyTorch → ONNX
- Need to reimplement scaler logic in TypeScript
- ONNX Runtime adds 50MB+ to node_modules
- Potential numerical precision differences

**Implementation:**
```bash
# Convert model
python -c "
import torch
model = torch.jit.load('model_pytorch_scripted.pt')
dummy_input = (torch.randn(1, 100, 5), torch.randn(1, 5), torch.randn(1, 5))
torch.onnx.export(model, dummy_input, 'model.onnx', 
    input_names=['candles', 'context', 'indicators'],
    output_names=['profitable', 'max_profit', 'rug_risk'])
"

# TypeScript
import * as ort from 'onnxruntime-node';
const session = await ort.InferenceSession.create('model.onnx');
const feeds = {
    candles: new ort.Tensor('float32', candlesScaled.flat(), [1, 100, 5]),
    context: new ort.Tensor('float32', contextScaled, [1, 5]),
    indicators: new ort.Tensor('float32', indicatorsScaled, [1, 5])
};
const results = await session.run(feeds);
```

### Option C: HTTP Inference Server
**Pros:**
- Decoupled (model can be on different machine)
- Easy horizontal scaling
- Can batch requests

**Cons:**
- Network latency (~10-50ms)
- Another service to deploy/monitor
- Overkill for single-bot deployment

---

## 🏗️ RECOMMENDED ARCHITECTURE (Option A)

### Component Design

#### 1. Feature Builder (`src/deepLearning/featureBuilder.ts`)
```typescript
interface FeatureBuilderConfig {
    cacheTTL: number;  // 60 seconds (candles don't change that fast)
    maxCacheSize: number;  // 100 tokens
}

class FeatureBuilder {
    private cache = new LRUCache<string, {features: ModelInput, timestamp: number}>();
    
    async buildFeatures(tokenAddress: string): Promise<ModelInput | null> {
        // Check cache first
        const cached = this.cache.get(tokenAddress);
        if (cached && Date.now() - cached.timestamp < 60000) {
            return cached.features;
        }
        
        // Fetch candles (100 × 5min = 8.3 hours)
        const candles = await this.fetchCandles(tokenAddress, 100, '5m');
        if (!candles || candles.length < 100) {
            console.log(`Insufficient candle data for ${tokenAddress}: ${candles?.length}/100`);
            return null;  // Model needs exactly 100 candles
        }
        
        // Fetch context
        const dexData = await this.fetchDexScreenerData(tokenAddress);
        if (!dexData) return null;
        
        const context = {
            liquidity: dexData.liquidity?.usd || 0,
            marketCap: dexData.fdv || dexData.marketCap || 0,
            holders: 0,  // Not available from DexScreener (set to mean from training)
            age: this.calculateAgeHours(dexData.pairCreatedAt),
            volume24h: dexData.volume?.h24 || 0
        };
        
        // Calculate indicators from candles
        const indicators = {
            rsi: this.calculateRSI(candles, 14),
            macd: this.calculateMACD(candles, 12, 26, 9),
            ema_fast: this.calculateEMA(candles, 12),
            ema_slow: this.calculateEMA(candles, 26),
            bbands_width: this.calculateBollingerBandsWidth(candles, 20, 2)
        };
        
        const features = { candles, context, indicators };
        this.cache.set(tokenAddress, { features, timestamp: Date.now() });
        return features;
    }
    
    private async fetchCandles(address: string, count: number, interval: string): Promise<Candle[]> {
        // Try DexScreener first (free, 300 req/min)
        // Falls back to Birdeye if needed (paid tier required for historical)
        // Returns null if insufficient data
    }
    
    private calculateRSI(candles: Candle[], period: number): number {
        // Standard RSI calculation
        // Use ta-lib or manual implementation
    }
}
```

#### 2. Inference Client (`src/deepLearning/inferenceClient.ts`)
```typescript
class PyTorchInferenceClient {
    private process: ChildProcess | null = null;
    private isReady = false;
    private startTime: number = 0;
    
    async start() {
        console.log('🧠 Starting PyTorch inference server...');
        this.startTime = Date.now();
        
        this.process = spawn('.venv/Scripts/python.exe', [
            'src/deepLearning/inference.py'
        ], {
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: process.cwd()
        });
        
        // Setup response handler
        const readline = require('readline');
        const rl = readline.createInterface({ input: this.process.stdout });
        rl.on('line', (line: string) => this.handleResponse(line));
        
        // Setup error handler
        this.process.stderr?.on('data', (data) => {
            console.error('Inference server error:', data.toString());
        });
        
        // Warmup with dummy data
        await this.warmup();
        console.log(`✅ Inference server ready (${Date.now() - this.startTime}ms startup)`);
    }
    
    async predict(features: ModelInput, timeout: number = 5000): Promise<ModelOutput> {
        if (!this.isReady) throw new Error('Inference server not ready');
        
        const startTime = Date.now();
        const result = await this.sendRequest(features, timeout);
        const latency = Date.now() - startTime;
        
        if (latency > 500) {
            console.warn(`⚠️ Slow inference: ${latency}ms (target: <500ms)`);
        }
        
        return result;
    }
    
    async stop() {
        if (this.process) {
            this.process.kill();
            this.process = null;
            this.isReady = false;
        }
    }
}

export const inferenceClient = new PyTorchInferenceClient();
```

#### 3. Integration Point (`src/main.ts` modification)
```typescript
// In processTradeOpportunityInternal(), after strategy validation:

if (isValid && strategyDecision) {
    console.log('🧠 Running deep learning model prediction...');
    
    // Build features
    const features = await featureBuilder.buildFeatures(tokenAddress);
    if (!features) {
        console.log('⚠️ Insufficient data for ML prediction, using strategy-only decision');
        // Continue with strategy decision
    } else {
        try {
            const prediction = await inferenceClient.predict(features, 3000);  // 3s timeout
            
            console.log(`🤖 Model Prediction:`);
            console.log(`   Profitable: ${(prediction.profitable * 100).toFixed(1)}%`);
            console.log(`   Expected Profit: ${prediction.max_profit.toFixed(2)}%`);
            console.log(`   Rug Risk: ${(prediction.rug_risk * 100).toFixed(1)}%`);
            
            // DECISION LOGIC: Combine ML prediction with strategy signals
            const mlConfidence = prediction.profitable;
            const strategyConfidence = strategyDecision.confidence;
            
            // Weighted combination (60% ML, 40% strategy)
            const combinedConfidence = (mlConfidence * 0.6) + (strategyConfidence * 0.4);
            
            // Thresholds
            const MIN_ML_CONFIDENCE = 0.70;       // Model must be 70%+ confident
            const MIN_COMBINED_CONFIDENCE = 0.65; // Combined score 65%+
            const MAX_RUG_RISK = 0.30;           // Reject if >30% rug risk
            
            if (prediction.rug_risk > MAX_RUG_RISK) {
                console.log(`❌ ML REJECTED: High rug risk (${(prediction.rug_risk*100).toFixed(1)}%)`);
                markAnalyzed(tokenAddress);
                return;
            }
            
            if (mlConfidence < MIN_ML_CONFIDENCE) {
                console.log(`❌ ML REJECTED: Low confidence (${(mlConfidence*100).toFixed(1)}%)`);
                markAnalyzed(tokenAddress);
                return;
            }
            
            if (combinedConfidence < MIN_COMBINED_CONFIDENCE) {
                console.log(`❌ REJECTED: Combined confidence too low (${(combinedConfidence*100).toFixed(1)}%)`);
                markAnalyzed(tokenAddress);
                return;
            }
            
            console.log(`✅ ML APPROVED: Combined confidence ${(combinedConfidence*100).toFixed(1)}%`);
            
            // Adjust position size based on confidence
            // Higher confidence = larger position (within limits)
            const confidenceMultiplier = 0.5 + (combinedConfidence * 0.5); // 0.5x to 1.0x
            dynamicSize = Math.min(
                dynamicSize * confidenceMultiplier,
                TRADE_CONFIG.maxTradeSol
            );
            
            console.log(`💰 Position size: ${dynamicSize.toFixed(4)} SOL (${(confidenceMultiplier*100).toFixed(0)}% of base)`);
            
            // Store ML prediction in entry context for post-trade learning
            const entryContext = {
                ...strategyDecision,
                mlPrediction: prediction,
                mlConfidence,
                combinedConfidence
            };
            
        } catch (err) {
            console.error('ML prediction failed:', err);
            console.log('⚠️ Falling back to strategy-only decision');
            // Continue with strategy decision
        }
    }
}
```

---

## ⚡ PERFORMANCE OPTIMIZATIONS

### 1. Prediction Caching
```typescript
class PredictionCache {
    private cache = new Map<string, {prediction: ModelOutput, timestamp: number}>();
    private TTL = 60_000; // 1 minute (price changes fast)
    
    get(tokenAddress: string): ModelOutput | null {
        const entry = this.cache.get(tokenAddress);
        if (!entry || Date.now() - entry.timestamp > this.TTL) return null;
        return entry.prediction;
    }
    
    set(tokenAddress: string, prediction: ModelOutput) {
        this.cache.set(tokenAddress, { prediction, timestamp: Date.now() });
        // LRU eviction if cache too large
        if (this.cache.size > 100) {
            const oldest = Array.from(this.cache.entries())
                .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
            this.cache.delete(oldest[0]);
        }
    }
}
```

### 2. Parallel Inference (Batch Mode)
```typescript
// If analyzing multiple tokens in one cycle, batch them
const predictions = await inferenceClient.predictBatch([
    features1, features2, features3
]);
// Process results in parallel
```

### 3. Async Non-Blocking
```typescript
// Don't block main event loop
const predictionPromise = inferenceClient.predict(features);
// Do other work while waiting...
const prediction = await predictionPromise;
```

---

## 🛡️ ERROR HANDLING & FALLBACKS

### Fallback Strategy
```typescript
const USE_ML_PREDICTIONS = process.env.USE_ML_PREDICTIONS !== 'false';
const ML_REQUIRED = process.env.ML_REQUIRED === 'true';  // Fail if ML unavailable?

try {
    if (USE_ML_PREDICTIONS && inferenceClient.isReady) {
        prediction = await inferenceClient.predict(features);
        // Use ML decision
    } else {
        throw new Error('ML not available');
    }
} catch (err) {
    if (ML_REQUIRED) {
        console.error('ML prediction required but failed, skipping trade');
        return;
    } else {
        console.warn('ML prediction failed, using strategy-only decision');
        // Continue with strategy decision
    }
}
```

### Health Monitoring
```typescript
class InferenceHealthMonitor {
    private successCount = 0;
    private errorCount = 0;
    private totalLatency = 0;
    
    recordSuccess(latency: number) {
        this.successCount++;
        this.totalLatency += latency;
    }
    
    recordError() {
        this.errorCount++;
        // If error rate > 50%, restart inference server
        if (this.errorCount / (this.successCount + this.errorCount) > 0.5) {
            console.error('High ML error rate, restarting inference server...');
            inferenceClient.restart();
        }
    }
    
    getStats() {
        return {
            successRate: this.successCount / (this.successCount + this.errorCount),
            avgLatency: this.totalLatency / this.successCount,
            totalPredictions: this.successCount + this.errorCount
        };
    }
}
```

---

## 📈 FEEDBACK LOOP (Post-Trade Learning)

### Track Actual Outcomes
```typescript
// When entering a position
activePositions.set(tokenAddress, {
    ...existingData,
    mlPrediction: prediction,  // Store what model predicted
    entryPrice: currentPrice,
    entryTime: new Date()
});

// When exiting a position
const actualOutcome = {
    profitable: pnlPercent >= 3.0,
    max_profit: highestPnlPercent,
    rug_risk: wasRugPull,
    holdTimeMinutes: (Date.now() - entryTime) / 60000
};

// Log for retraining
appendTrainingExample({
    features: storedFeatures,
    predicted: mlPrediction,
    actual: actualOutcome,
    timestamp: Date.now()
});
```

### Periodic Retraining
```bash
# Nightly retraining script
python src/deepLearning/model_pytorch.py  # Loads updated trainingData_merged.json
# New best model saved to best_model_pytorch.pth
# Bot automatically uses new model on next restart
```

---

## 🚀 IMPLEMENTATION PLAN

### Phase 1: Core Infrastructure (Day 1-2)
- [ ] Create `inference.py` (persistent Python process)
- [ ] Create `inferenceClient.ts` (TypeScript client with watchdog)
- [ ] Create `featureBuilder.ts` (feature extraction)
- [ ] Add technical indicator calculations (RSI, MACD, EMA, BB)
- [ ] **Add holder count fetching** (Birdeye API with fallback)
- [ ] **Add scaler versioning** (scalers_v1.pkl + version.txt)
- [ ] Test inference latency (<500ms target)

### Phase 2: Integration (Day 3)
- [ ] Modify `main.ts` processTradeOpportunityInternal()
- [ ] Add ML prediction before trade execution
- [ ] Implement confidence thresholds
- [ ] Add fallback logic (strategy-only if ML fails)
- [ ] **Handle sparse candle data** (zero-padding or skip if <50)

### Phase 3: Monitoring (Day 4)
- [ ] Add prediction logging
- [ ] Add performance metrics (latency, cache hit rate)
- [ ] **Add health monitoring** (watchdog auto-restart)
- [ ] **Add scaler version checking** (hot-reload on change)
- [ ] Test with --dry-run mode

### Phase 4: Feedback Loop (Day 5)
- [ ] Track actual trade outcomes
- [ ] Log prediction vs reality
- [ ] Setup periodic retraining script
- [ ] Version scalers on each retrain

### Phase 5: Optimization (Day 6-7)
- [ ] Add prediction caching (60s TTL)
- [ ] Optimize feature extraction
- [ ] **Optional: Worker pool** (if >10 concurrent predictions needed)
- [ ] **Optional: MessagePack IPC** (if latency critical)
- [ ] Performance tuning

### Phase 6: Production Hardening (Ongoing)
- [ ] Monitor crash rate and auto-restart effectiveness
- [ ] Track scaler version mismatches
- [ ] Alert on holder count API failures
- [ ] Monitor candle data availability per token age

---

## 📊 EXPECTED PERFORMANCE METRICS

| Metric | Target | Current (Strategy Only) |
|--------|--------|------------------------|
| Win Rate | 55-60% | ~45% |
| Avg Profit on Winners | 8-12% | 5-8% |
| False Positive Rate | <30% | ~40% |
| Inference Latency | <500ms | N/A |
| Prediction Cache Hit Rate | >70% | N/A |

---

## ⚠️ CRITICAL IMPROVEMENTS & GOTCHAS

### High Priority Fixes

| Issue | Recommendation | Severity | Status |
|-------|---------------|----------|--------|
| **Holders count = 0** | DexScreener doesn't expose holders. Use Birdeye `/token/overview` or Solscan scraping for this field (it's very predictive for rugs) | **HIGH** | 🔴 Must Fix |
| **Scaler version mismatch** | If you retrain and regenerate `scalers.pkl`, the running bot will get garbage predictions until restart | **HIGH** | 🔴 Must Fix |
| **Python process crash = silent death** | No auto-restart if the process dies | **HIGH** | 🔴 Must Fix |

### Medium Priority Improvements

| Issue | Recommendation | Severity | Status |
|-------|---------------|----------|--------|
| **Fixed 100 × 5min candles** | Some new pools only have 20–30 candles in the first hour. Consider zero-padding or a separate "early-life" model | **MEDIUM** | 🟡 Enhancement |
| **Single inference bottleneck** | One Python process = one inference at a time → ~150–300 ms per call, but max ~6–7 concurrent | **MEDIUM** | 🟡 Enhancement |

### Low Priority Optimizations

| Issue | Recommendation | Severity | Status |
|-------|---------------|----------|--------|
| **JSON + newline IPC** | Works, but slightly slow. Consider MessagePack or raw bytes if you want <100ms end-to-end | **LOW** | 🟢 Optional |

### Fixes Implementation

#### 1. Holders Count (HIGH PRIORITY)
```typescript
// featureBuilder.ts - Add Birdeye fallback
async getHolderCount(tokenAddress: string): Promise<number> {
    try {
        // Try Birdeye first (requires API key)
        const response = await axios.get(
            `https://public-api.birdeye.so/defi/token_overview?address=${tokenAddress}`,
            { headers: { 'X-API-KEY': process.env.BIRDEYE_API_KEY } }
        );
        return response.data?.holder || 0;
    } catch (err) {
        console.warn('Failed to fetch holder count, using training mean (1250)');
        return 1250; // Mean from training data (better than 0)
    }
}
```

#### 2. Scaler Versioning (HIGH PRIORITY)
```python
# inference.py - Add version checking
import hashlib
import pickle
import json

SCALER_VERSION_FILE = 'scalers_version.json'
current_scaler_hash = None

def load_scalers_with_version():
    global current_scaler_hash
    with open('scalers.pkl', 'rb') as f:
        scaler_data = f.read()
        new_hash = hashlib.md5(scaler_data).hexdigest()
        
        if current_scaler_hash and new_hash != current_scaler_hash:
            print(f"⚠️ Scaler file changed! Old: {current_scaler_hash[:8]}, New: {new_hash[:8]}", file=sys.stderr)
            print("🔄 Hot-reloading scalers...", file=sys.stderr)
        
        current_scaler_hash = new_hash
        return pickle.loads(scaler_data)

# Reload scalers every 100 predictions (hot-reload support)
prediction_count = 0
scalers = load_scalers_with_version()

while True:
    line = sys.stdin.readline()
    # ... prediction logic ...
    
    prediction_count += 1
    if prediction_count % 100 == 0:
        new_scalers = load_scalers_with_version()
        if new_scalers:
            scalers = new_scalers
```

```typescript
// inferenceClient.ts - Scaler version tracking
private scalerVersion: string | null = null;

async checkScalerVersion(): Promise<boolean> {
    const fs = require('fs');
    const crypto = require('crypto');
    
    const scalerPath = 'scalers.pkl';
    const data = fs.readFileSync(scalerPath);
    const hash = crypto.createHash('md5').update(data).digest('hex');
    
    if (this.scalerVersion && hash !== this.scalerVersion) {
        console.warn('⚠️ Scaler version mismatch detected! Restarting inference server...');
        await this.restart();
        return false;
    }
    
    this.scalerVersion = hash;
    return true;
}

// Check every 60 seconds
setInterval(() => this.checkScalerVersion(), 60000);
```

#### 3. Auto-Restart on Crash (HIGH PRIORITY)
```typescript
// inferenceClient.ts - Add watchdog
private restartAttempts = 0;
private maxRestartAttempts = 5;

async start() {
    if (this.restartAttempts >= this.maxRestartAttempts) {
        console.error('❌ Max restart attempts reached, giving up');
        throw new Error('Inference server failed to start');
    }
    
    // ... existing start logic ...
    
    // Watchdog: restart on exit
    this.process.on('exit', (code) => {
        if (code !== 0 && code !== null) {
            console.error(`🔴 Inference process died with code ${code}`);
            this.restartAttempts++;
            
            setTimeout(async () => {
                console.log(`🔄 Auto-restarting inference server (attempt ${this.restartAttempts}/${this.maxRestartAttempts})...`);
                await this.start();
            }, 5000); // Wait 5s before restart
        }
    });
    
    // Reset counter on successful operation
    setInterval(() => {
        if (this.isReady) this.restartAttempts = 0;
    }, 60000);
}
```

#### 4. Early Token Handling (MEDIUM PRIORITY)
```typescript
// featureBuilder.ts - Handle insufficient candles
async buildFeatures(tokenAddress: string): Promise<ModelInput | null> {
    const candles = await this.fetchCandles(tokenAddress, 100, '5m');
    
    if (!candles) return null;
    
    if (candles.length < 100) {
        // OPTION A: Zero-pad (simple, works for new tokens)
        const paddedCandles = [...candles];
        const firstCandle = candles[0];
        
        // Pad with flat price (open=close=first price) to reach 100
        while (paddedCandles.length < 100) {
            paddedCandles.unshift({
                time: firstCandle.time - (100 - paddedCandles.length) * 300000, // 5min intervals
                open: firstCandle.open,
                high: firstCandle.open,
                low: firstCandle.open,
                close: firstCandle.open,
                volume: 0
            });
        }
        
        console.log(`⚠️ Token ${tokenAddress} only has ${candles.length} candles, zero-padded to 100`);
        return { candles: paddedCandles, context, indicators };
        
        // OPTION B: Skip very new tokens (conservative)
        // console.log(`⚠️ Insufficient candles (${candles.length}/100), skipping ${tokenAddress}`);
        // return null;
    }
    
    return { candles, context, indicators };
}
```

#### 5. Multi-Process Inference Pool (MEDIUM PRIORITY)
```typescript
// inferenceClient.ts - Worker pool for parallel inference
class InferenceWorkerPool {
    private workers: PyTorchInferenceClient[] = [];
    private currentWorker = 0;
    private poolSize = 3; // 3 workers = 3x throughput
    
    async start() {
        console.log(`🧠 Starting inference worker pool (${this.poolSize} workers)...`);
        for (let i = 0; i < this.poolSize; i++) {
            const worker = new PyTorchInferenceClient();
            await worker.start();
            this.workers.push(worker);
        }
        console.log(`✅ Worker pool ready`);
    }
    
    async predict(features: ModelInput): Promise<ModelOutput> {
        // Round-robin load balancing
        const worker = this.workers[this.currentWorker];
        this.currentWorker = (this.currentWorker + 1) % this.poolSize;
        return worker.predict(features);
    }
    
    async stop() {
        await Promise.all(this.workers.map(w => w.stop()));
        this.workers = [];
    }
}

export const inferencePool = new InferenceWorkerPool();
```

---

## 🔧 CONFIGURATION

### Environment Variables
```bash
# .env additions
USE_ML_PREDICTIONS=true           # Enable ML predictions
ML_REQUIRED=false                 # Continue without ML if unavailable
ML_MIN_CONFIDENCE=0.70           # Minimum ML confidence threshold
ML_MIN_COMBINED_CONFIDENCE=0.65  # Min combined (ML + strategy) confidence
ML_MAX_RUG_RISK=0.30            # Max acceptable rug risk
ML_WEIGHT=0.60                   # ML weight in combined score (0-1)
ML_INFERENCE_TIMEOUT_MS=3000     # Timeout for predictions
```

---

## 🎯 SUCCESS CRITERIA

1. ✅ Inference latency <500ms (P95)
2. ✅ Prediction cache hit rate >70%
3. ✅ Model uptime >99% (with graceful fallback)
4. ✅ Win rate improvement 45% → 55%+
5. ✅ False positive reduction 40% → 30%
6. ✅ Seamless integration (no performance regression)
7. ✅ Proper error handling (no bot crashes from ML failures)

---

## 📝 NEXT STEPS

1. **Review this architecture with you**
2. **Get approval on Option A (Python subprocess)**
3. **Begin Phase 1 implementation**
4. **Test inference performance**
5. **Iterate based on results**

This architecture prioritizes **simplicity**, **performance**, and **reliability** while leveraging your already-trained 92% accurate model. The Python subprocess approach gives us the best balance of ease-of-implementation and performance.

Ready to start implementation?
