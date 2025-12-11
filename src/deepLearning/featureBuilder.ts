/**
 * Feature Builder for Deep Learning Inference
 * Extracts 100 candles + 18 features (context + indicators + EmperorBTC patterns)
 */

import axios from 'axios';

const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY || '';

interface CandleData {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface TokenData {
    address: string;
    symbol: string;
    liquidity: number;
    marketCap: number;
    holders: number;
    age: number;  // hours since creation
    volume24h: number;
}

interface ModelInput {
    candles: number[][];  // 100 x 5 [open, high, low, close, volume]
    context: number[];    // 5: [liquidity, marketCap, holders, age_hours, volume24h]
    indicators: number[]; // 5: [rsi, macd, ema_fast, ema_slow, bbands_width]
    patterns: number[];   // 8: EmperorBTC patterns
}

export class FeatureBuilder {
    
    constructor() {
        // No connection needed - we fetch candles from Birdeye API
    }
    
    /**
     * Build complete feature set for a token
     */
    async buildFeatures(token: TokenData): Promise<ModelInput | null> {
        try {
            // 1. Fetch 100 x 5-minute candles
            const candles = await this.fetchCandles(token.address, '5m', 100);
            
            if (!candles || candles.length < 50) {
                console.log(`❌ Insufficient candles: ${candles?.length}/100 - skipping ML prediction`);
                return null;
            }
            
            // Pad if needed (new tokens might have <100 candles)
            const paddedCandles = this.padCandles(candles, 100);
            
            // 2. Calculate indicators
            const indicators = this.calculateIndicators(paddedCandles);
            
            // 3. Detect EmperorBTC patterns
            const patterns = this.detectCandlestickPatterns(paddedCandles, token);
            
            // 4. Build context
            const context = [
                token.liquidity || 0,
                token.marketCap || 0,
                token.holders || 0,
                token.age || 0,
                token.volume24h || 0
            ];
            
            // 5. Convert candles to array format
            const candleArray = paddedCandles.map(c => [c.open, c.high, c.low, c.close, c.volume]);
            
            return {
                candles: candleArray,
                context,
                indicators: [
                    indicators.rsi,
                    indicators.macd,
                    indicators.ema_fast,
                    indicators.ema_slow,
                    indicators.bbands_width
                ],
                patterns: [
                    patterns.has_bullish_pin ? 1 : 0,
                    patterns.has_bearish_pin ? 1 : 0,
                    patterns.has_bullish_engulfing ? 1 : 0,
                    patterns.has_bearish_engulfing ? 1 : 0,
                    patterns.wick_rejection_ratio,
                    patterns.body_to_range_ratio,
                    patterns.pattern_confidence,
                    patterns.context_score
                ]
            };
        } catch (error: any) {
            console.error(`❌ Failed to build features: ${error.message}`);
            return null;
        }
    }
    
    /**
     * Fetch OHLCV candles from Birdeye
     */
    private async fetchCandles(tokenAddress: string, timeframe: string, count: number): Promise<CandleData[]> {
        if (!BIRDEYE_API_KEY) {
            console.warn('⚠️ BIRDEYE_API_KEY not set, cannot fetch candles');
            return [];
        }
        
        try {
            const response = await axios.get(`https://public-api.birdeye.so/defi/ohlcv`, {
                headers: { 'X-API-KEY': BIRDEYE_API_KEY },
                params: {
                    address: tokenAddress,
                    type: timeframe,
                    time_from: Math.floor(Date.now() / 1000) - (count * 5 * 60), // count x 5-min candles
                    time_to: Math.floor(Date.now() / 1000),
                },
                timeout: 5000
            });
            
            if (!response.data?.data?.items) {
                return [];
            }
            
            return response.data.data.items.map((item: any) => ({
                time: item.unixTime,
                open: item.o,
                high: item.h,
                low: item.l,
                close: item.c,
                volume: item.v,
            })).sort((a: CandleData, b: CandleData) => a.time - b.time); // Sort chronologically
        } catch (error: any) {
            console.error(`❌ Failed to fetch candles: ${error.message}`);
            return [];
        }
    }
    
    /**
     * Pad candles to target length (for new tokens with <100 candles)
     */
    private padCandles(candles: CandleData[], targetLength: number): CandleData[] {
        if (candles.length >= targetLength) {
            return candles.slice(-targetLength); // Take last N candles
        }
        
        // Zero-pad at the beginning
        const padding: CandleData[] = [];
        const firstCandle = candles[0];
        
        for (let i = 0; i < targetLength - candles.length; i++) {
            padding.push({
                time: firstCandle.time - (i + 1) * 300, // 5 minutes = 300 seconds
                open: firstCandle.open,
                high: firstCandle.high,
                low: firstCandle.low,
                close: firstCandle.close,
                volume: 0 // Zero volume for padding
            });
        }
        
        return [...padding.reverse(), ...candles];
    }
    
    /**
     * Calculate technical indicators
     */
    private calculateIndicators(candles: CandleData[]) {
        const closes = candles.map(c => c.close);
        
        return {
            rsi: this.calculateRSI(closes, 14),
            macd: this.calculateMACD(closes),
            ema_fast: this.calculateEMA(closes, 9),
            ema_slow: this.calculateEMA(closes, 21),
            bbands_width: this.calculateBollingerWidth(closes, 20),
        };
    }
    
    /**
     * Detect EmperorBTC candlestick patterns
     */
    private detectCandlestickPatterns(candles: CandleData[], token: TokenData) {
        const lastCandle = candles[candles.length - 1];
        const prevCandle = candles.length > 1 ? candles[candles.length - 2] : lastCandle;
        
        // Calculate candle metrics
        const body = Math.abs(lastCandle.close - lastCandle.open);
        const upperWick = lastCandle.high - Math.max(lastCandle.close, lastCandle.open);
        const lowerWick = Math.min(lastCandle.close, lastCandle.open) - lastCandle.low;
        const totalRange = lastCandle.high - lastCandle.low;
        
        const isBullish = lastCandle.close > lastCandle.open;
        const isBearish = lastCandle.close < lastCandle.open;
        
        const bodyToRange = totalRange > 0 ? body / totalRange : 0;
        const wickRejectionRatio = body > 0 ? Math.max(upperWick, lowerWick) / body : 0;
        
        // Pattern detection
        const MIN_WICK_TO_BODY_RATIO = 2.0;
        let hasBullishPin = false;
        let hasBearishPin = false;
        let hasBullishEngulfing = false;
        let hasBearishEngulfing = false;
        let patternConfidence = 0;
        
        // 1. BULLISH PIN BAR
        if (lowerWick > body * MIN_WICK_TO_BODY_RATIO && isBullish) {
            hasBullishPin = true;
            const wickStrength = (lowerWick / totalRange) * 100;
            patternConfidence = Math.max(patternConfidence, Math.min(60 + wickStrength * 0.3, 80) / 100);
        }
        
        // 2. BEARISH PIN BAR
        if (upperWick > body * MIN_WICK_TO_BODY_RATIO && isBearish) {
            hasBearishPin = true;
            const wickStrength = (upperWick / totalRange) * 100;
            patternConfidence = Math.max(patternConfidence, Math.min(60 + wickStrength * 0.3, 80) / 100);
        }
        
        // 3. BULLISH ENGULFING
        const prevBody = Math.abs(prevCandle.close - prevCandle.open);
        const engulfsPrevious = body > prevBody * 0.6;
        
        if (isBullish && engulfsPrevious && bodyToRange > 0.6) {
            hasBullishEngulfing = true;
            patternConfidence = Math.max(patternConfidence, 0.65);
        }
        
        // 4. BEARISH ENGULFING
        if (isBearish && engulfsPrevious && bodyToRange > 0.6) {
            hasBearishEngulfing = true;
            patternConfidence = Math.max(patternConfidence, 0.65);
        }
        
        // Calculate context score
        const contextScore = this.calculateContextScore(candles, token);
        
        return {
            has_bullish_pin: hasBullishPin,
            has_bearish_pin: hasBearishPin,
            has_bullish_engulfing: hasBullishEngulfing,
            has_bearish_engulfing: hasBearishEngulfing,
            wick_rejection_ratio: Math.min(wickRejectionRatio, 10),
            body_to_range_ratio: bodyToRange,
            pattern_confidence: patternConfidence,
            context_score: contextScore,
        };
    }
    
    /**
     * Calculate market context score (EmperorBTC methodology)
     */
    private calculateContextScore(candles: CandleData[], token: TokenData): number {
        let score = 0;
        
        // 1. Trend analysis
        if (candles.length >= 20) {
            const recentCandles = candles.slice(-20);
            const firstPrice = recentCandles[0].close;
            const lastPrice = recentCandles[recentCandles.length - 1].close;
            const priceChange = ((lastPrice - firstPrice) / firstPrice) * 100;
            
            if (priceChange > 10) score += 0.30;
            else if (priceChange > 0) score += 0.15;
            else if (priceChange < -10) score += 0.10;
        }
        
        // 2. Support/Resistance
        if (candles.length >= 20) {
            const recentCandles = candles.slice(-20);
            const highs = recentCandles.map(c => c.high);
            const lows = recentCandles.map(c => c.low);
            const recentHigh = Math.max(...highs);
            const recentLow = Math.min(...lows);
            const currentPrice = candles[candles.length - 1].close;
            
            const pricePosition = (currentPrice - recentLow) / (recentHigh - recentLow);
            
            if (pricePosition < 0.20) score += 0.25;
            else if (pricePosition > 0.90) score += 0.20;
        }
        
        // 3. Liquidity context
        if (token.liquidity > 500000) score += 0.20;
        else if (token.liquidity > 100000) score += 0.10;
        
        return Math.min(score, 1.0);
    }
    
    // ==================== Technical Indicators ====================
    
    private calculateRSI(prices: number[], period: number = 14): number {
        if (prices.length < period + 1) return 50;
        
        let gains = 0;
        let losses = 0;
        
        for (let i = prices.length - period; i < prices.length; i++) {
            const change = prices[i] - prices[i - 1];
            if (change > 0) gains += change;
            else losses += Math.abs(change);
        }
        
        const avgGain = gains / period;
        const avgLoss = losses / period;
        
        if (avgLoss === 0) return 100;
        const rs = avgGain / avgLoss;
        return 100 - (100 / (1 + rs));
    }
    
    private calculateMACD(prices: number[]): number {
        const ema12 = this.calculateEMA(prices, 12);
        const ema26 = this.calculateEMA(prices, 26);
        return ema12 - ema26;
    }
    
    private calculateEMA(prices: number[], period: number): number {
        if (prices.length === 0) return 0;
        
        const k = 2 / (period + 1);
        let ema = prices[0];
        
        for (let i = 1; i < prices.length; i++) {
            ema = prices[i] * k + ema * (1 - k);
        }
        
        return ema;
    }
    
    private calculateBollingerWidth(prices: number[], period: number = 20): number {
        if (prices.length < period) return 0;
        
        const recentPrices = prices.slice(-period);
        const mean = recentPrices.reduce((a, b) => a + b, 0) / period;
        const variance = recentPrices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / period;
        const stdDev = Math.sqrt(variance);
        
        return (stdDev * 2) / mean; // Width as % of mean
    }
}
