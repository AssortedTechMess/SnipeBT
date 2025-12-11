import * as tf from '@tensorflow/tfjs-node';
import * as fs from 'fs';
import * as path from 'path';

interface CandleData {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

interface ContextData {
    liquidity: number;
    marketCap: number;
    holders: number;
    age: number;
    volume24h: number;
}

interface IndicatorData {
    rsi: number;
    macd: number;
    ema_fast: number;
    ema_slow: number;
    bbands_width: number;
}

interface PredictionResult {
    profitable_probability: number;  // 0-1
    max_profit_percent: number;      // Expected max profit %
    rug_risk_probability: number;    // 0-1
    confidence: number;               // Overall confidence 0-1
}

export class DeepLearningInference {
    private model: tf.LayersModel | null = null;
    private scalers: any = null;
    private modelPath: string;
    private scalersPath: string;
    private isReady: boolean = false;
    
    constructor(
        modelPath: string = path.join(__dirname, '../../tfjs_model/model.json'),
        scalersPath: string = path.join(__dirname, '../../scalers.json')
    ) {
        this.modelPath = modelPath;
        this.scalersPath = scalersPath;
    }
    
    /**
     * Load model and scalers
     */
    async initialize(): Promise<void> {
        try {
            console.log('🧠 Loading deep learning model...');
            
            // Load TensorFlow.js model
            this.model = await tf.loadLayersModel(`file://${this.modelPath}`);
            console.log(`✅ Model loaded from ${this.modelPath}`);
            
            // Load scalers (converted from Python pickle to JSON)
            if (fs.existsSync(this.scalersPath)) {
                this.scalers = JSON.parse(fs.readFileSync(this.scalersPath, 'utf-8'));
                console.log(`✅ Scalers loaded from ${this.scalersPath}`);
            } else {
                console.warn(`⚠️ Scalers not found at ${this.scalersPath}, using default scaling`);
                this.scalers = this.getDefaultScalers();
            }
            
            // Warmup prediction
            await this.warmup();
            
            this.isReady = true;
            console.log('✅ Deep learning inference ready!');
            
        } catch (error: any) {
            console.error(`❌ Failed to initialize deep learning: ${error.message}`);
            this.isReady = false;
            throw error;
        }
    }
    
    /**
     * Warmup model with dummy data
     */
    private async warmup(): Promise<void> {
        console.log('🔥 Warming up model...');
        
        const dummyCandles: CandleData[] = Array(100).fill(null).map((_, i) => ({
            time: Date.now() - (100 - i) * 300000,
            open: 1.0,
            high: 1.1,
            low: 0.9,
            close: 1.0,
            volume: 1000
        }));
        
        const dummyContext: ContextData = {
            liquidity: 10000,
            marketCap: 100000,
            holders: 100,
            age: 24,
            volume24h: 50000
        };
        
        const dummyIndicators: IndicatorData = {
            rsi: 50,
            macd: 0,
            ema_fast: 1.0,
            ema_slow: 1.0,
            bbands_width: 0.05
        };
        
        const start = Date.now();
        await this.predict(dummyCandles, dummyContext, dummyIndicators);
        const elapsed = Date.now() - start;
        
        console.log(`✅ Warmup complete (${elapsed}ms)`);
    }
    
    /**
     * Make prediction for a trade setup
     */
    async predict(
        candles: CandleData[],
        context: ContextData,
        indicators: IndicatorData
    ): Promise<PredictionResult | null> {
        if (!this.isReady || !this.model) {
            console.warn('⚠️ Deep learning model not ready');
            return null;
        }
        
        try {
            // Validate inputs
            if (candles.length < 100) {
                console.warn(`⚠️ Not enough candles: ${candles.length}/100`);
                return null;
            }
            
            // Take last 100 candles
            const recentCandles = candles.slice(-100);
            
            // Prepare inputs
            const candlesTensor = this.prepareCandleInput(recentCandles);
            const contextTensor = this.prepareContextInput(context);
            const indicatorsTensor = this.prepareIndicatorInput(indicators);
            
            // Run inference
            const start = Date.now();
            const predictions = this.model.predict([
                candlesTensor,
                contextTensor,
                indicatorsTensor
            ]) as tf.Tensor[];
            
            const elapsed = Date.now() - start;
            
            // Extract predictions
            const [profitableProb, maxProfit, rugRisk] = await Promise.all([
                predictions[0].data(),
                predictions[1].data(),
                predictions[2].data()
            ]);
            
            // Cleanup tensors
            tf.dispose([candlesTensor, contextTensor, indicatorsTensor, ...predictions]);
            
            // Calculate overall confidence
            // High confidence if: profitable likely, good profit expected, low rug risk
            const confidence = this.calculateConfidence(
                profitableProb[0],
                maxProfit[0],
                rugRisk[0]
            );
            
            const result: PredictionResult = {
                profitable_probability: profitableProb[0],
                max_profit_percent: maxProfit[0],
                rug_risk_probability: rugRisk[0],
                confidence
            };
            
            if (process.env.DEBUG) {
                console.log(`🔮 DL Prediction (${elapsed}ms): profit=${(result.profitable_probability * 100).toFixed(1)}%, max=${result.max_profit_percent.toFixed(1)}%, rug=${(result.rug_risk_probability * 100).toFixed(1)}%, conf=${(result.confidence * 100).toFixed(1)}%`);
            }
            
            return result;
            
        } catch (error: any) {
            console.error(`❌ Prediction failed: ${error.message}`);
            return null;
        }
    }
    
    /**
     * Prepare candle data as tensor
     */
    private prepareCandleInput(candles: CandleData[]): tf.Tensor {
        // Extract OHLCV features
        const candleArray = candles.map(c => [
            c.open,
            c.high,
            c.low,
            c.close,
            c.volume
        ]);
        
        // Scale using RobustScaler parameters
        const scaled = this.scalers.candle_scaler 
            ? this.scaleCandles(candleArray, this.scalers.candle_scaler)
            : candleArray;
        
        // Create tensor: shape (1, 100, 5)
        return tf.tensor3d([scaled], [1, 100, 5]);
    }
    
    /**
     * Prepare context data as tensor
     */
    private prepareContextInput(context: ContextData): tf.Tensor {
        const contextArray = [
            context.liquidity,
            context.marketCap,
            context.holders,
            context.age,
            context.volume24h
        ];
        
        // Scale using StandardScaler parameters
        const scaled = this.scalers.context_scaler
            ? this.scaleStandard(contextArray, this.scalers.context_scaler)
            : contextArray;
        
        // Create tensor: shape (1, 5)
        return tf.tensor2d([scaled], [1, 5]);
    }
    
    /**
     * Prepare indicator data as tensor
     */
    private prepareIndicatorInput(indicators: IndicatorData): tf.Tensor {
        const indicatorArray = [
            indicators.rsi,
            indicators.macd,
            indicators.ema_fast,
            indicators.ema_slow,
            indicators.bbands_width
        ];
        
        // Scale using StandardScaler parameters
        const scaled = this.scalers.indicator_scaler
            ? this.scaleStandard(indicatorArray, this.scalers.indicator_scaler)
            : indicatorArray;
        
        // Create tensor: shape (1, 5)
        return tf.tensor2d([scaled], [1, 5]);
    }
    
    /**
     * Scale data using RobustScaler (for candles)
     */
    private scaleCandles(data: number[][], scaler: any): number[][] {
        return data.map(row => 
            row.map((val, i) => {
                const center = scaler.center_[i] || 0;
                const scale = scaler.scale_[i] || 1;
                return (val - center) / scale;
            })
        );
    }
    
    /**
     * Scale data using StandardScaler (for context/indicators)
     */
    private scaleStandard(data: number[], scaler: any): number[] {
        return data.map((val, i) => {
            const mean = scaler.mean_[i] || 0;
            const std = scaler.scale_[i] || 1;
            return (val - mean) / std;
        });
    }
    
    /**
     * Calculate overall confidence from predictions
     */
    private calculateConfidence(
        profitableProb: number,
        maxProfit: number,
        rugRisk: number
    ): number {
        // High confidence = high profitable prob + high expected profit + low rug risk
        
        // Normalize max profit to 0-1 (assume 50% is excellent)
        const profitScore = Math.min(maxProfit / 50, 1);
        
        // Invert rug risk (lower is better)
        const safetyScore = 1 - rugRisk;
        
        // Weighted average
        const confidence = (
            profitableProb * 0.4 +    // 40% weight on profitable
            profitScore * 0.3 +        // 30% weight on expected profit
            safetyScore * 0.3          // 30% weight on safety
        );
        
        return Math.max(0, Math.min(1, confidence));
    }
    
    /**
     * Get default scalers if not available
     */
    private getDefaultScalers(): any {
        return {
            candle_scaler: null,
            context_scaler: null,
            indicator_scaler: null
        };
    }
    
    /**
     * Hot reload model (for auto-refresh after retraining)
     */
    async reload(): Promise<void> {
        console.log('🔄 Reloading deep learning model...');
        
        try {
            // Dispose old model
            if (this.model) {
                this.model.dispose();
            }
            
            // Reload
            await this.initialize();
            
            console.log('✅ Model reloaded successfully!');
            
        } catch (error: any) {
            console.error(`❌ Model reload failed: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Check if model is ready
     */
    isModelReady(): boolean {
        return this.isReady;
    }
    
    /**
     * Get model info
     */
    getModelInfo(): string {
        if (!this.model) return 'Not loaded';
        
        return `TensorFlow.js model ready (backend: ${tf.getBackend()})`;
    }
}

// Singleton instance
let instance: DeepLearningInference | null = null;

export function getDeepLearningInstance(): DeepLearningInference {
    if (!instance) {
        instance = new DeepLearningInference();
    }
    return instance;
}

export async function initializeDeepLearning(): Promise<void> {
    const dl = getDeepLearningInstance();
    await dl.initialize();
}
