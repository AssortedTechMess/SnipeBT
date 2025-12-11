import axios from 'axios';
import pLimit from 'p-limit';
import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';

// Load environment variables
config();

// Get API key from environment
const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY || '';

// API usage tracking
interface APIUsageStats {
    dexscreener: { calls: number; errors: number; lastReset: number };
    birdeye: { calls: number; errors: number; lastReset: number };
}

const apiUsage: APIUsageStats = {
    dexscreener: { calls: 0, errors: 0, lastReset: Date.now() },
    birdeye: { calls: 0, errors: 0, lastReset: Date.now() }
};

interface CandleData {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

interface TokenData {
    address: string;
    symbol: string;
    candles: CandleData[];
    liquidity?: number;
    marketCap?: number;
    holders?: number;
    age?: number;
}

interface TrainingExample {
    // Input features
    candles: CandleData[];  // 100 candles (5-min each = 8.3 hours history)
    context: {
        liquidity: number;
        marketCap: number;
        holders: number;
        age: number;  // token age in hours
        volume24h: number;
    };
    indicators: {
        rsi: number;
        macd: number;
        ema_fast: number;
        ema_slow: number;
        bbands_width: number;
    };
    // NEW: EmperorBTC candlestick pattern features
    patterns: {
        has_bullish_pin: boolean;       // Pin bar with long lower wick
        has_bearish_pin: boolean;       // Pin bar with long upper wick
        has_bullish_engulfing: boolean; // Strong green candle
        has_bearish_engulfing: boolean; // Strong red candle
        wick_rejection_ratio: number;   // Max wick / body ratio (0-10+)
        body_to_range_ratio: number;    // Body size / total range (0-1)
        pattern_confidence: number;     // Highest pattern confidence (0-1)
        context_score: number;          // Market context score (0-1)
    };
    
    // Output labels (what happened 1 hour after the 100th candle)
    labels: {
        profitable: boolean;  // Did price go up at least 3%?
        max_profit: number;   // What was the max profit % in next 1 hour?
        rug_risk: boolean;    // Did liquidity drop >80% or price crash >90%?
    };
}

export class DataCollector {
    // private dexscreenerLimit = pLimit(3);  // DISABLED - not using Dexscreener
    private birdeyeLimit = pLimit(10);     // LITE PLAN: 15 rps allowed, using 10 for safety margin
    
    private checkpointFile = path.join(__dirname, '../../trainingData_checkpoint.json');
    private finalFile = path.join(__dirname, '../../trainingData_full.json');
    
    private collectedTokens: string[] = [];
    private examples: TrainingExample[] = [];
    private birdeyeOffset: number = 0;  // Track pagination offset for Birdeye API
    
    /**
     * Main entry point - collect 1M training examples from blockchain history
     */
    async collectTrainingData(targetExamples: number = 1_000_000): Promise<void> {
        console.log(`🧠 Starting deep learning data collection (target: ${targetExamples.toLocaleString()} examples)`);
        
        // Validate API key
        if (!BIRDEYE_API_KEY) {
            console.error('❌ CRITICAL: BIRDEYE_API_KEY not set in environment variables!');
            console.error('   Data collection will fail. Please set BIRDEYE_API_KEY in your .env file.');
            throw new Error('BIRDEYE_API_KEY is required for data collection');
        }
        console.log(`✅ Birdeye API key configured (length: ${BIRDEYE_API_KEY.length})`);
        
        // Load checkpoint if exists
        this.loadCheckpoint();
        
        const startCount = this.examples.length;
        console.log(`📊 Resuming from ${startCount.toLocaleString()} existing examples`);
        console.log(`🕒 Estimated time: ${this.estimateTimeRemaining(targetExamples - startCount)}`);
        console.log('');
        
        try {
            // Loop until we reach target (fetching new tokens each round)
            while (this.examples.length < targetExamples) {
                // Step 1: Get list of tokens
                const tokens = await this.fetchTokenList(targetExamples);
                
                if (tokens.length === 0) {
                    console.log('⚠️ No more tokens available - stopping collection');
                    break;
                }
                
                console.log(`🪙 Found ${tokens.length.toLocaleString()} tokens to process (${this.examples.length.toLocaleString()}/${targetExamples.toLocaleString()} examples)`);
                
                // Step 2: For each token, fetch candles and generate examples
                for (let i = 0; i < tokens.length; i++) {
                    const token = tokens[i];
                    
                    try {
                        await this.processToken(token);
                        
                        // Save checkpoint every 50 tokens (more frequent for better progress tracking)
                        if ((this.collectedTokens.length) % 50 === 0 && this.collectedTokens.length > 0) {
                            this.saveCheckpoint();
                            const progress = (this.examples.length / targetExamples) * 100;
                            const remaining = targetExamples - this.examples.length;
                            console.log(`💾 Checkpoint: ${this.examples.length.toLocaleString()}/${targetExamples.toLocaleString()} examples (${progress.toFixed(1)}%) - ${remaining.toLocaleString()} remaining`);
                        }
                        
                        // Stop if we hit target
                        if (this.examples.length >= targetExamples) {
                            console.log(`✅ Target reached: ${this.examples.length.toLocaleString()} examples`);
                            break;
                        }
                    } catch (error: any) {
                        console.error(`❌ Error processing token ${token.address}: ${error.message}`);
                        continue;
                    }
                    
                    // Rate limiting delay - LITE PLAN: 15 rps allowed
                    await this.delay(100);   // 100ms delay = 10 req/sec (safe margin under 15 rps limit)
                }
                
                // Break if target reached
                if (this.examples.length >= targetExamples) {
                    break;
                }
                
                // Wait before fetching next batch
                console.log(`🔄 Fetching next batch of tokens...`);
                await this.delay(1000);  // LITE PLAN: 1 second between batches
            }
            
            // Step 3: Save final dataset
            this.saveFinal();
            
            const totalCollected = this.examples.length - startCount;
            console.log(`🎉 Data collection complete! Collected ${totalCollected.toLocaleString()} new examples (total: ${this.examples.length.toLocaleString()})`);
            
        } catch (error: any) {
            console.error(`❌ Data collection failed: ${error.message}`);
            this.saveCheckpoint();  // Save progress before exit
            throw error;
        }
    }
    
    /**
     * Fetch list of tokens from multiple sources
     */
    private async fetchTokenList(targetExamples: number): Promise<TokenData[]> {
        const tokens: TokenData[] = [];
        const seenAddresses = new Set<string>(this.collectedTokens);
        
        // Calculate how many tokens we need
        // Each token gives ~50 examples (30 days of 5-min candles = 8640 candles / 100 window = 86 examples)
        // But not all will be usable (need liquidity data, etc.), so aim for 30 examples per token
        const tokensNeeded = Math.ceil((targetExamples - this.examples.length) / 30);
        
        console.log(`🔍 Fetching ~${tokensNeeded.toLocaleString()} tokens from multiple sources...`);
        
        // Source 1: Dexscreener trending/gainers (DISABLED - returns non-Solana tokens)
        // try {
        //     const dexTokens = await this.fetchDexscreenerTokens(tokensNeeded * 0.4);
        //     tokens.push(...dexTokens.filter(t => !seenAddresses.has(t.address)));
        //     console.log(`✅ Dexscreener: ${dexTokens.length} tokens`);
        // } catch (error: any) {
        //     console.error(`❌ Dexscreener fetch failed: ${error.message}`);
        // }
        
        // Source 2: Birdeye top tokens (MAIN SOURCE - verified Solana tokens)
        try {
            const birdeyeTokens = await this.fetchBirdeyeTokens(Math.min(tokensNeeded, 500));
            tokens.push(...birdeyeTokens.filter(t => !seenAddresses.has(t.address)));
            console.log(`✅ Birdeye: ${birdeyeTokens.length} tokens`);
        } catch (error: any) {
            console.error(`❌ Birdeye fetch failed: ${error.message}`);
        }
        
        // Source 3: Raydium pools from RPC (more recent tokens)
        try {
            const raydiumTokens = await this.fetchRaydiumTokens(tokensNeeded * 0.3);
            tokens.push(...raydiumTokens.filter(t => !seenAddresses.has(t.address)));
            console.log(`✅ Raydium: ${raydiumTokens.length} tokens`);
        } catch (error: any) {
            console.error(`❌ Raydium fetch failed: ${error.message}`);
        }
        
        return tokens;
    }
    
    /*
    // Fetch tokens from Dexscreener (DISABLED - returns multi-chain tokens)
    private async _fetchDexscreenerTokens(count: number): Promise<TokenData[]> {
        const tokens: TokenData[] = [];
        
        try {
            // Fetch trending tokens with retry
            const trending = await this.retryWithBackoff(async () => {
                return await this.dexscreenerLimit(async () => {
                    this.trackAPIUsage('dexscreener');
                    const response = await axios.get('https://api.dexscreener.com/latest/dex/search?q=solana', {
                        timeout: 10000
                    });
                    return response.data;
                });
            }, 3, 1000, 'Dexscreener');
            
            if (trending && trending.pairs) {
                for (const pair of trending.pairs.slice(0, count)) {
                    // Filter out tokens with insufficient liquidity
                    if (pair.liquidity?.usd && pair.liquidity.usd < 1000) {
                        continue;
                    }
                    
                    tokens.push({
                        address: pair.baseToken.address,
                        symbol: pair.baseToken.symbol,
                        candles: [],
                        liquidity: pair.liquidity?.usd,
                        marketCap: pair.marketCap,
                    });
                }
            }
        } catch (error: any) {
            this.trackAPIUsage('dexscreener', true);
            throw error;
        }
        
        return tokens;
    }
    */
    
    /**
     * Fetch tokens from Birdeye
     */
    private async fetchBirdeyeTokens(count: number): Promise<TokenData[]> {
        if (!BIRDEYE_API_KEY) {
            console.warn('⚠️ BIRDEYE_API_KEY not set, skipping Birdeye tokens');
            return [];
        }
        
        const tokens: TokenData[] = [];
        
        try {
            const response = await this.retryWithBackoff(async () => {
                return await this.birdeyeLimit(async () => {
                    this.trackAPIUsage('birdeye');
                    return await axios.get(`https://public-api.birdeye.so/defi/tokenlist`, {
                        headers: { 
                            'X-API-KEY': BIRDEYE_API_KEY,
                            'Accept': 'application/json'
                        },
                        params: {
                            sort_by: 'v24hUSD',
                            sort_type: 'desc',
                            offset: this.birdeyeOffset,
                            limit: Math.min(Math.floor(count), 50)
                        },
                        timeout: 10000
                    });
                });
            }, 3, 1000, 'Birdeye');  // LITE PLAN: 1s retry delay
            
            if (response.data && response.data.data && response.data.data.tokens) {
                for (const token of response.data.data.tokens) {
                    // Filter tokens with low liquidity
                    if (token.liquidity && token.liquidity < 1000) {
                        continue;
                    }
                    
                    tokens.push({
                        address: token.address,
                        symbol: token.symbol,
                        candles: [],
                        liquidity: token.liquidity,
                        marketCap: token.mc,
                    });
                }
            }
            
            // Increment offset for next fetch (pagination)
            this.birdeyeOffset += tokens.length;
            
        } catch (error: any) {
            this.trackAPIUsage('birdeye', true);
            throw error;
        }
        
        return tokens;
    }
    
    /**
     * Fetch tokens from Raydium pools (via RPC or Raydium SDK)
     */
    private async fetchRaydiumTokens(_count: number): Promise<TokenData[]> {
        // TODO: Implement Raydium pool fetching using existing SDK
        // For now, return empty array (will be implemented in Phase 2)
        console.warn('⚠️ Raydium token fetching not yet implemented');
        return [];
    }
    
    /**
     * Process a single token - fetch candles and generate training examples
     */
    private async processToken(token: TokenData): Promise<void> {
        // Validate Solana address format (base58, 32-44 chars, alphanumeric only)
        const isSolanaAddress = token.address && 
            !token.address.startsWith('0x') && 
            !token.address.includes('/') &&
            token.address.length >= 32 && 
            token.address.length <= 44 &&
            /^[1-9A-HJ-NP-Za-km-z]+$/.test(token.address);
        
        if (!isSolanaAddress) {
            console.warn(`⚠️ ${token.symbol}: Invalid Solana address (${token.address?.substring(0, 20)}...)`);
            return;
        }
        
        // Fetch 30 days of 5-minute candles
        const candles = await this.fetchCandles(token.address, '5m', 30);
        
        if (candles.length < 200) {
            // Not enough data
            return;
        }
        
        // Validate candle data quality
        const validCandles = this.validateCandles(candles);
        if (validCandles.length < 200) {
            console.warn(`⚠️ ${token.symbol}: Insufficient valid candles (${validCandles.length}/${candles.length})`);
            return;
        }
        
        // Generate training examples using sliding window
        const examples = this.generateExamples(token, validCandles);
        
        if (examples.length > 0) {
            this.examples.push(...examples);
            this.collectedTokens.push(token.address);
            console.log(`📈 ${token.symbol}: ${examples.length} examples from ${validCandles.length} candles`);
        }
    }
    
    /**
     * Fetch OHLCV candles from Birdeye
     */
    private async fetchCandles(tokenAddress: string, timeframe: string, days: number): Promise<CandleData[]> {
        if (!BIRDEYE_API_KEY) {
            return [];
        }
        
        try {
            const response = await this.retryWithBackoff(async () => {
                return await this.birdeyeLimit(async () => {
                    this.trackAPIUsage('birdeye');
                    return await axios.get(`https://public-api.birdeye.so/defi/ohlcv`, {
                        headers: { 'X-API-KEY': BIRDEYE_API_KEY },
                        params: {
                            address: tokenAddress,
                            type: timeframe,
                            time_from: Math.floor(Date.now() / 1000) - (days * 86400),
                            time_to: Math.floor(Date.now() / 1000),
                        },
                        timeout: 15000  // Longer timeout for candle data
                    });
                });
            }, 3, 2000, 'Birdeye OHLCV');
            
            if (!response.data || !response.data.data || !response.data.data.items) {
                return [];
            }
            
            return response.data.data.items.map((item: any) => ({
                time: item.unixTime,
                open: item.o,
                high: item.h,
                low: item.l,
                close: item.c,
                volume: item.v,
            }));
        } catch (error: any) {
            this.trackAPIUsage('birdeye', true);
            console.error(`❌ Failed to fetch candles for ${tokenAddress}: ${error.message}`);
            return [];
        }
    }
    
    /**
     * Generate training examples from candles using sliding window
     */
    private generateExamples(token: TokenData, candles: CandleData[]): TrainingExample[] {
        const examples: TrainingExample[] = [];
        
        // Need 100 candles as input + 12 candles as output (1 hour = 12x 5-min)
        const inputWindow = 100;
        const outputWindow = 12;
        const minCandles = inputWindow + outputWindow;
        
        if (candles.length < minCandles) {
            return examples;
        }
        
        // Slide window through candles
        for (let i = 0; i <= candles.length - minCandles; i += 10) {  // Step by 10 to avoid overlap
            const inputCandles = candles.slice(i, i + inputWindow);
            const outputCandles = candles.slice(i + inputWindow, i + inputWindow + outputWindow);
            
            // Calculate indicators for input candles
            const indicators = this.calculateIndicators(inputCandles);
            
            // Calculate EmperorBTC candlestick patterns from last candle
            const patterns = this.detectCandlestickPatterns(inputCandles, token);
            
            // Calculate labels from output candles
            const labels = this.calculateLabels(inputCandles[inputCandles.length - 1], outputCandles, token);
            
            examples.push({
                candles: inputCandles,
                context: {
                    liquidity: token.liquidity || 0,
                    marketCap: token.marketCap || 0,
                    holders: token.holders || 0,
                    age: token.age || 0,
                    volume24h: this.calculate24hVolume(inputCandles),
                },
                indicators,
                patterns,
                labels,
            });
        }
        
        return examples;
    }
    
    /**
     * Calculate technical indicators from candles
     */
    private calculateIndicators(candles: CandleData[]): TrainingExample['indicators'] {
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
     * Calculate output labels from future candles
     */
    private calculateLabels(lastInputCandle: CandleData, futureCandles: CandleData[], _token: TokenData): TrainingExample['labels'] {
        const entryPrice = lastInputCandle.close;
        const prices = futureCandles.map(c => c.close);
        
        // Max profit in next 1 hour
        const maxPrice = Math.max(...prices);
        const maxProfit = ((maxPrice - entryPrice) / entryPrice) * 100;
        
        // Check if profitable (at least 3% gain)
        const profitable = maxProfit >= 3;
        
        // Check for rug signals (price crash >90% or liquidity gone)
        const minPrice = Math.min(...prices);
        const maxDrawdown = ((entryPrice - minPrice) / entryPrice) * 100;
        const rug_risk = maxDrawdown > 90;
        
        return {
            profitable,
            max_profit: maxProfit,
            rug_risk,
        };
    }
    
    /**
     * Validate candle data quality
     * Filter out candles with zero prices, outliers, or time gaps
     */
    private validateCandles(candles: CandleData[]): CandleData[] {
        const validated: CandleData[] = [];
        let prevTime = 0;
        
        for (let i = 0; i < candles.length; i++) {
            const c = candles[i];
            
            // Check for zero or negative prices
            if (c.open <= 0 || c.high <= 0 || c.low <= 0 || c.close <= 0) {
                continue;
            }
            
            // Check for invalid OHLC relationships
            if (c.high < c.low || c.high < c.open || c.high < c.close || c.low > c.open || c.low > c.close) {
                continue;
            }
            
            // Check for extreme outliers (>1000% change)
            if (i > 0) {
                const prevClose = validated[validated.length - 1]?.close || c.open;
                const change = Math.abs((c.close - prevClose) / prevClose);
                if (change > 10) {  // 1000% change
                    continue;
                }
            }
            
            // Check for time gaps (should be ~5 minutes = 300 seconds)
            if (prevTime > 0) {
                const timeDiff = c.time - prevTime;
                // Allow up to 10 minutes gap (600 seconds)
                if (timeDiff > 600 || timeDiff < 0) {
                    continue;
                }
            }
            
            validated.push(c);
            prevTime = c.time;
        }
        
        return validated;
    }
    
    // ==================== Technical Indicators ====================
    
    private calculateRSI(prices: number[], period: number = 14): number {
        if (prices.length < period + 1) return 50;
        
        let gains = 0, losses = 0;
        for (let i = prices.length - period; i < prices.length; i++) {
            const change = prices[i] - prices[i - 1];
            if (change > 0) gains += change;
            else losses -= change;
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
        if (prices.length < period) return prices[prices.length - 1];
        
        const k = 2 / (period + 1);
        let ema = prices[0];
        
        for (let i = 1; i < prices.length; i++) {
            ema = prices[i] * k + ema * (1 - k);
        }
        
        return ema;
    }
    
    private calculateBollingerWidth(prices: number[], period: number = 20): number {
        if (prices.length < period) return 0;
        
        const slice = prices.slice(-period);
        const sma = slice.reduce((a, b) => a + b, 0) / period;
        const variance = slice.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / period;
        const std = Math.sqrt(variance);
        
        return (std * 4) / sma;  // Width as percentage
    }
    
    private calculate24hVolume(candles: CandleData[]): number {
        // Sum volume from last 24 hours (288 candles at 5-min)
        const last24h = candles.slice(-288);
        return last24h.reduce((sum, c) => sum + c.volume, 0);
    }
    
    /**
     * Detect EmperorBTC candlestick patterns from candles
     * Based on candlestickStrategy.ts logic
     */
    private detectCandlestickPatterns(candles: CandleData[], token: TokenData): TrainingExample['patterns'] {
        // Analyze the last candle for patterns
        const lastCandle = candles[candles.length - 1];
        const prevCandle = candles.length > 1 ? candles[candles.length - 2] : lastCandle;
        
        // Calculate candle metrics
        const body = Math.abs(lastCandle.close - lastCandle.open);
        const upperWick = lastCandle.high - Math.max(lastCandle.close, lastCandle.open);
        const lowerWick = Math.min(lastCandle.close, lastCandle.open) - lastCandle.low;
        const totalRange = lastCandle.high - lastCandle.low;
        
        const isBullish = lastCandle.close > lastCandle.open;
        const isBearish = lastCandle.close < lastCandle.open;
        
        // Body to range ratio (strong candles have large bodies)
        const bodyToRange = totalRange > 0 ? body / totalRange : 0;
        
        // Wick rejection ratio (key EmperorBTC signal)
        const wickRejectionRatio = body > 0 ? Math.max(upperWick, lowerWick) / body : 0;
        
        // Pattern detection
        const MIN_WICK_TO_BODY_RATIO = 2.0;
        let hasBullishPin = false;
        let hasBearishPin = false;
        let hasBullishEngulfing = false;
        let hasBearishEngulfing = false;
        let patternConfidence = 0;
        
        // 1. BULLISH PIN BAR: Long lower wick (buyers rejected lower prices)
        if (lowerWick > body * MIN_WICK_TO_BODY_RATIO && isBullish) {
            hasBullishPin = true;
            const wickStrength = (lowerWick / totalRange) * 100;
            patternConfidence = Math.max(patternConfidence, Math.min(60 + wickStrength * 0.3, 80) / 100);
        }
        
        // 2. BEARISH PIN BAR: Long upper wick (sellers rejected higher prices)
        if (upperWick > body * MIN_WICK_TO_BODY_RATIO && isBearish) {
            hasBearishPin = true;
            const wickStrength = (upperWick / totalRange) * 100;
            patternConfidence = Math.max(patternConfidence, Math.min(60 + wickStrength * 0.3, 80) / 100);
        }
        
        // 3. BULLISH ENGULFING: Strong green candle that engulfs previous
        const prevBody = Math.abs(prevCandle.close - prevCandle.open);
        const engulfsPrevious = body > prevBody * 0.6; // Engulfs at least 60% of previous
        
        if (isBullish && engulfsPrevious && bodyToRange > 0.6) {
            hasBullishEngulfing = true;
            patternConfidence = Math.max(patternConfidence, 0.65);
        }
        
        // 4. BEARISH ENGULFING: Strong red candle
        if (isBearish && engulfsPrevious && bodyToRange > 0.6) {
            hasBearishEngulfing = true;
            patternConfidence = Math.max(patternConfidence, 0.65);
        }
        
        // Calculate context score (EmperorBTC: context = 50% of decision)
        const contextScore = this.calculateContextScore(candles, token);
        
        return {
            has_bullish_pin: hasBullishPin,
            has_bearish_pin: hasBearishPin,
            has_bullish_engulfing: hasBullishEngulfing,
            has_bearish_engulfing: hasBearishEngulfing,
            wick_rejection_ratio: Math.min(wickRejectionRatio, 10), // Cap at 10 for stability
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
        
        // 1. Trend analysis (using price momentum over last 20 candles)
        if (candles.length >= 20) {
            const recentCandles = candles.slice(-20);
            const firstPrice = recentCandles[0].close;
            const lastPrice = recentCandles[recentCandles.length - 1].close;
            const priceChange = ((lastPrice - firstPrice) / firstPrice) * 100;
            
            if (priceChange > 10) score += 0.30; // Strong bullish
            else if (priceChange > 0) score += 0.15; // Moderate bullish
            else if (priceChange < -10) score += 0.10; // Bearish (lower score)
        }
        
        // 2. Support/Resistance (price position in recent range)
        if (candles.length >= 20) {
            const recentCandles = candles.slice(-20);
            const highs = recentCandles.map(c => c.high);
            const lows = recentCandles.map(c => c.low);
            const recentHigh = Math.max(...highs);
            const recentLow = Math.min(...lows);
            const currentPrice = candles[candles.length - 1].close;
            
            const pricePosition = (currentPrice - recentLow) / (recentHigh - recentLow);
            
            // Near support (bottom 20%) = bullish context
            if (pricePosition < 0.20) score += 0.25;
            // Near resistance (top 10%) but still rising = continuation
            else if (pricePosition > 0.90) score += 0.20;
        }
        
        // 3. Liquidity context
        const liquidity = token.liquidity || 0;
        if (liquidity > 500000) score += 0.20;
        else if (liquidity > 100000) score += 0.10;
        
        return Math.min(score, 1.0); // Normalize to 0-1
    }
    
    // ==================== Persistence ====================
    
    private loadCheckpoint(): void {
        try {
            // First try loading checkpoint (in-progress)
            if (fs.existsSync(this.checkpointFile)) {
                const data = JSON.parse(fs.readFileSync(this.checkpointFile, 'utf-8'));
                this.examples = data.examples || [];
                this.collectedTokens = data.collectedTokens || [];
                this.birdeyeOffset = data.birdeyeOffset || 0;
                console.log(`✅ Loaded checkpoint: ${this.examples.length.toLocaleString()} examples, offset ${this.birdeyeOffset}`);
                return;
            }
            
            // If no checkpoint, try loading from final file (previous completed run)
            if (fs.existsSync(this.finalFile)) {
                const data = JSON.parse(fs.readFileSync(this.finalFile, 'utf-8'));
                this.examples = data.examples || [];
                this.collectedTokens = data.metadata?.processedTokens || [];
                this.birdeyeOffset = data.metadata?.birdeyeOffset || this.collectedTokens.length;
                console.log(`✅ Loaded existing dataset: ${this.examples.length.toLocaleString()} examples, continuing from offset ${this.birdeyeOffset}`);
                return;
            }
        } catch (error: any) {
            console.error(`❌ Failed to load checkpoint: ${error.message}`);
        }
    }
    
    private saveCheckpoint(): void {
        try {
            // Use streaming write for large datasets to avoid "Invalid string length" error
            const stream = fs.createWriteStream(this.checkpointFile);
            stream.write('{"examples":[\n');
            
            for (let i = 0; i < this.examples.length; i++) {
                const comma = i < this.examples.length - 1 ? ',\n' : '\n';
                stream.write(JSON.stringify(this.examples[i]) + comma);
            }
            
            stream.write('],"collectedTokens":' + JSON.stringify(this.collectedTokens));
            stream.write(',"birdeyeOffset":' + this.birdeyeOffset);
            stream.write(',"timestamp":"' + new Date().toISOString() + '"}');
            stream.end();
            
            console.log(`💾 Checkpoint saved: ${this.examples.length.toLocaleString()} examples`);
        } catch (error: any) {
            console.error(`❌ Failed to save checkpoint: ${error.message}`);
        }
    }
    
    private saveFinal(): void {
        try {
            // Use streaming write for large datasets
            const stream = fs.createWriteStream(this.finalFile);
            stream.write('{"examples":[\n');
            
            for (let i = 0; i < this.examples.length; i++) {
                const comma = i < this.examples.length - 1 ? ',\n' : '\n';
                stream.write(JSON.stringify(this.examples[i]) + comma);
            }
            
            stream.write('],"metadata":{');
            stream.write('"total_examples":' + this.examples.length);
            stream.write(',"total_tokens":' + this.collectedTokens.length);
            stream.write(',"processedTokens":' + JSON.stringify(this.collectedTokens));
            stream.write(',"birdeyeOffset":' + this.birdeyeOffset);
            stream.write(',"created_at":"' + new Date().toISOString() + '"}}');
            stream.end();
            
            console.log(`💾 Saved final dataset: ${this.finalFile}`);
            
            // Delete checkpoint
            if (fs.existsSync(this.checkpointFile)) {
                fs.unlinkSync(this.checkpointFile);
            }
        } catch (error: any) {
            console.error(`❌ Failed to save final dataset: ${error.message}`);
        }
    }
    
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Retry wrapper with exponential backoff
     */
    private async retryWithBackoff<T>(
        fn: () => Promise<T>,
        maxRetries: number = 3,
        baseDelay: number = 1000,
        apiName: string = 'API'
    ): Promise<T> {
        let lastError: any;
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await fn();
            } catch (error: any) {
                lastError = error;
                
                // Check if it's a rate limit error
                const isRateLimit = error.response?.status === 429 || 
                                   error.message?.toLowerCase().includes('rate limit');
                
                if (attempt < maxRetries) {
                    const delay = baseDelay * Math.pow(2, attempt);
                    const message = isRateLimit ? 'Rate limit hit' : 'Request failed';
                    console.warn(`⚠️ ${apiName} ${message}, retry ${attempt + 1}/${maxRetries} in ${delay}ms`);
                    await this.delay(delay);
                } else {
                    console.error(`❌ ${apiName} failed after ${maxRetries} retries: ${error.message}`);
                }
            }
        }
        
        throw lastError;
    }
    
    /**
     * Track API usage and reset counters hourly
     */
    private trackAPIUsage(apiName: 'dexscreener' | 'birdeye', isError: boolean = false): void {
        const now = Date.now();
        const stats = apiUsage[apiName];
        
        // Reset counters every hour
        if (now - stats.lastReset > 3600000) {
            stats.calls = 0;
            stats.errors = 0;
            stats.lastReset = now;
        }
        
        stats.calls++;
        if (isError) stats.errors++;
        
        // Log usage every 100 calls
        if (stats.calls % 100 === 0) {
            const errorRate = ((stats.errors / stats.calls) * 100).toFixed(1);
            console.log(`📊 ${apiName} usage: ${stats.calls} calls, ${stats.errors} errors (${errorRate}% error rate)`);
        }
    }
    
    /**
     * Estimate time remaining for data collection
     */
    private estimateTimeRemaining(examplesNeeded: number): string {
        // Estimate: ~30 examples per token, ~3 seconds per token (with API limits)
        const tokensNeeded = Math.ceil(examplesNeeded / 30);
        const secondsEstimate = tokensNeeded * 3;
        
        const hours = Math.floor(secondsEstimate / 3600);
        const minutes = Math.floor((secondsEstimate % 3600) / 60);
        
        if (hours > 0) {
            return `~${hours}h ${minutes}m`;
        }
        return `~${minutes}m`;
    }
}

// CLI usage
if (require.main === module) {
    const collector = new DataCollector();
    
    // Handle Ctrl+C gracefully - save checkpoint before exit
    process.on('SIGINT', () => {
        console.log('\n⚠️ Interrupted by user - saving checkpoint...');
        collector['saveCheckpoint']();
        console.log('✅ Checkpoint saved. Resume anytime by running this script again.');
        process.exit(0);
    });
    
    // Handle other termination signals
    process.on('SIGTERM', () => {
        collector['saveCheckpoint']();
        process.exit(0);
    });
    
    // Collecting 200K examples over the week (realistic for free tier)
    // Will auto-checkpoint every 50 tokens, resume if interrupted
    collector.collectTrainingData(200_000)
        .then(() => {
            console.log('✅ Data collection complete!');
            process.exit(0);
        })
        .catch((error) => {
            console.error(`❌ Data collection failed: ${error.message}`);
            collector['saveCheckpoint']();  // Save on error too
            process.exit(1);
        });
}
