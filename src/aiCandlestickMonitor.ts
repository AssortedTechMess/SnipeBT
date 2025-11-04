import axios from 'axios';

/**
 * AI Candlestick Monitor
 * Supports: xAI Grok, OpenAI, Groq
 */

interface CandleOHLC {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface AIAnalysis {
  pattern: string;
  confidence: number; // 0-100
  action: 'BUY' | 'SELL' | 'HOLD';
  reasoning: string;
  wickAnalysis: string;
  volumeConfirmation: boolean;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

/**
 * AI Candlestick Monitor
 * 
 * Uses OpenAI GPT-4 to analyze real-time candlestick patterns
 * Combines EmperorBTC methodology with AI pattern recognition
 */
export class AICandlestickMonitor {
  private apiKey: string;
  private apiEndpoint: string = 'https://api.x.ai/v1/chat/completions'; // xAI Grok endpoint
  private monitoringTokens: Map<string, NodeJS.Timeout> = new Map();
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
    console.log('[AI Monitor] Initialized with xAI Grok');
  }

  /**
   * Fetch real-time candles from DexScreener
   */
  private async fetchCandles(tokenAddress: string, _interval: '5m' | '15m' | '1h' = '5m'): Promise<CandleOHLC[]> {
    try {
      const response = await axios.get(
        `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
        { timeout: 5000 }
      );

      const pair = response.data.pairs?.[0];
      if (!pair) {
        throw new Error('No pair data found');
      }

      // DexScreener doesn't provide OHLC, so we'll construct from txns
      // For production, you'd use a proper OHLC data source like Birdeye API
      const candles = await this.constructCandlesFromTxns(tokenAddress, pair);
      return candles;
      
    } catch (error) {
      console.error(`[AI Monitor] Error fetching candles for ${tokenAddress}:`, error);
      return [];
    }
  }

  /**
   * Construct candles from recent transactions (simplified)
   * In production, use Birdeye API or Jupiter OHLC endpoints
   */
  private async constructCandlesFromTxns(_tokenAddress: string, pairData: any): Promise<CandleOHLC[]> {
    const currentPrice = parseFloat(pairData.priceUsd);
    const priceChange5m = pairData.priceChange?.m5 || 0;
    const priceChange1h = pairData.priceChange?.h1 || 0;
    const volume = pairData.volume?.h24 || 0;

    // Construct last 3 candles (simplified approximation)
    const now = Date.now();
    const candles: CandleOHLC[] = [];

    // Current 5m candle
    const open5m = currentPrice / (1 + priceChange5m / 100);
    candles.push({
      timestamp: now,
      open: open5m,
      high: Math.max(currentPrice, open5m) * 1.02,
      low: Math.min(currentPrice, open5m) * 0.98,
      close: currentPrice,
      volume: volume / 288 // Approximate 5m volume
    });

    // Previous 5m candle
    const prevPrice = currentPrice / (1 + priceChange1h / 100);
    candles.push({
      timestamp: now - 5 * 60 * 1000,
      open: prevPrice * 0.99,
      high: prevPrice * 1.01,
      low: prevPrice * 0.97,
      close: open5m,
      volume: volume / 288
    });

    return candles.reverse(); // Oldest first
  }

  /**
   * Analyze candlestick patterns using OpenAI GPT-4
   */
  async analyzeWithAI(
    tokenAddress: string,
    candles: CandleOHLC[],
    context?: {
      liquidity: number;
      rvol: number;
      trend24h: number;
      support?: number;
      resistance?: number;
    }
  ): Promise<AIAnalysis> {
    try {
      // Prepare candle data for AI analysis
      const candleText = candles.map((c, i) => {
        const body = Math.abs(c.close - c.open);
        const upperWick = c.high - Math.max(c.close, c.open);
        const lowerWick = Math.min(c.close, c.open) - c.low;
        const isBullish = c.close > c.open;
        
        return `Candle ${i + 1} (${new Date(c.timestamp).toISOString()}):
  Open: $${c.open.toFixed(8)}
  High: $${c.high.toFixed(8)}
  Low: $${c.low.toFixed(8)}
  Close: $${c.close.toFixed(8)}
  Type: ${isBullish ? 'BULLISH' : 'BEARISH'}
  Body: $${body.toFixed(8)}
  Upper Wick: $${upperWick.toFixed(8)} (${((upperWick/body)*100).toFixed(1)}% of body)
  Lower Wick: $${lowerWick.toFixed(8)} (${((lowerWick/body)*100).toFixed(1)}% of body)
  Volume: $${c.volume.toFixed(0)}`;
      }).join('\n\n');

      const contextText = context ? `
Market Context:
- Liquidity: $${context.liquidity.toLocaleString()}
- RVOL: ${context.rvol.toFixed(2)}x
- 24h Trend: ${context.trend24h > 0 ? '+' : ''}${context.trend24h.toFixed(2)}%
- Support Level: ${context.support ? '$' + context.support.toFixed(8) : 'Unknown'}
- Resistance Level: ${context.resistance ? '$' + context.resistance.toFixed(8) : 'Unknown'}
` : '';

      // Call OpenAI with EmperorBTC methodology prompt
      const prompt = `You are an expert crypto trader trained in EmperorBTC candlestick methodology. Analyze these candlesticks and provide a trading recommendation.

${candleText}

${contextText}

EmperorBTC Rules:
1. WICK REJECTION is the PRIMARY signal (wick > 2x body = strong)
2. CONTEXT matters MORE than pattern (50% of decision)
3. VOLUME CONFIRMATION is MANDATORY (RVOL must be 1.5x+)
4. PIN BARS are most reliable (long wick = price rejection)
5. Pattern WITHOUT context = NO TRADE

Analyze and provide:
1. Pattern name (e.g., "Bullish Pin Bar", "Bearish Engulfing", "Wick Rejection")
2. Confidence score (0-100)
3. Action (BUY/SELL/HOLD)
4. Detailed reasoning (2-3 sentences)
5. Wick analysis (what the wicks tell us)
6. Volume confirmation status
7. Risk level (LOW/MEDIUM/HIGH)

Respond in this exact JSON format:
{
  "pattern": "pattern name",
  "confidence": 75,
  "action": "BUY",
  "reasoning": "explanation here",
  "wickAnalysis": "wick interpretation",
  "volumeConfirmation": true,
  "riskLevel": "MEDIUM"
}`;

      // Call xAI Grok API with EmperorBTC methodology prompt
      const response = await axios.post(
        this.apiEndpoint,
        {
          model: 'grok-3',
          messages: [
            {
              role: 'system',
              content: 'You are an expert crypto trader specializing in EmperorBTC candlestick analysis. Always respond with valid JSON only.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3,
          max_tokens: 500,
          response_format: { type: 'json_object' }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      const analysis = JSON.parse(response.data.choices[0].message.content || '{}') as AIAnalysis;
      
      console.log(`[AI Analysis] ${tokenAddress}:`, {
        pattern: analysis.pattern,
        confidence: analysis.confidence,
        action: analysis.action,
        volumeOk: analysis.volumeConfirmation
      });

      return analysis;

    } catch (error) {
      console.error('[AI Monitor] xAI Grok analysis error:', error);
      return {
        pattern: 'Analysis Error',
        confidence: 0,
        action: 'HOLD',
        reasoning: 'Failed to analyze pattern',
        wickAnalysis: 'Error',
        volumeConfirmation: false,
        riskLevel: 'HIGH'
      };
    }
  }

  /**
   * Start monitoring a token with AI analysis
   */
  async startMonitoring(
    tokenAddress: string,
    callback: (analysis: AIAnalysis) => void,
    intervalMs: number = 60000 // Check every 1 minute
  ): Promise<void> {
    // Stop existing monitoring if any
    this.stopMonitoring(tokenAddress);

    console.log(`[AI Monitor] Starting AI monitoring for ${tokenAddress}`);

    // Immediate first analysis
    await this.performAnalysis(tokenAddress, callback);

    // Set up interval
    const timer = setInterval(async () => {
      await this.performAnalysis(tokenAddress, callback);
    }, intervalMs);

    this.monitoringTokens.set(tokenAddress, timer);
  }

  /**
   * Perform single analysis cycle
   */
  private async performAnalysis(
    tokenAddress: string,
    callback: (analysis: AIAnalysis) => void
  ): Promise<void> {
    try {
      // Fetch candles
      const candles = await this.fetchCandles(tokenAddress, '5m');
      if (candles.length === 0) {
        console.log(`[AI Monitor] No candles available for ${tokenAddress}`);
        return;
      }

      // Get market context
      const context = await this.getMarketContext(tokenAddress);

      // Analyze with AI
      const analysis = await this.analyzeWithAI(tokenAddress, candles, context);

      // Callback with results
      callback(analysis);

    } catch (error) {
      console.error(`[AI Monitor] Error analyzing ${tokenAddress}:`, error);
    }
  }

  /**
   * Get market context for analysis
   */
  private async getMarketContext(tokenAddress: string): Promise<{
    liquidity: number;
    rvol: number;
    trend24h: number;
  }> {
    try {
      const response = await axios.get(
        `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
        { timeout: 5000 }
      );

      const pair = response.data.pairs?.[0];
      if (!pair) {
        throw new Error('No pair data');
      }

      return {
        liquidity: pair.liquidity?.usd || 0,
        rvol: this.calculateRVOL(pair),
        trend24h: pair.priceChange?.h24 || 0
      };

    } catch (error) {
      console.error(`[AI Monitor] Error fetching context for ${tokenAddress}:`, error);
      return { liquidity: 0, rvol: 0, trend24h: 0 };
    }
  }

  /**
   * Calculate RVOL from volume data
   */
  private calculateRVOL(pairData: any): number {
    const volume1h = pairData.volume?.h1 || 0;
    const volume24h = pairData.volume?.h24 || 0;
    const avgHourly = volume24h / 24;
    return avgHourly > 0 ? volume1h / avgHourly : 0;
  }

  /**
   * Stop monitoring a token
   */
  stopMonitoring(tokenAddress: string): void {
    const timer = this.monitoringTokens.get(tokenAddress);
    if (timer) {
      clearInterval(timer);
      this.monitoringTokens.delete(tokenAddress);
      console.log(`[AI Monitor] Stopped monitoring ${tokenAddress}`);
    }
  }

  /**
   * Stop all monitoring
   */
  stopAll(): void {
    for (const [address, timer] of this.monitoringTokens) {
      clearInterval(timer);
      console.log(`[AI Monitor] Stopped monitoring ${address}`);
    }
    this.monitoringTokens.clear();
  }

  /**
   * Get list of currently monitored tokens
   */
  getMonitoredTokens(): string[] {
    return Array.from(this.monitoringTokens.keys());
  }

  /**
   * Analyze candlestick pattern for a single position (for exit decisions)
   * Returns AI analysis of reversal patterns
   */
  async analyzePattern(
    tokenAddress: string,
    currentPrice: number,
    context?: {
      entryPrice?: number;
      profitPercent?: number;
      holdTimeMinutes?: number;
    }
  ): Promise<AIAnalysis> {
    try {
      // Fetch recent candles
      const candles = await this.fetchCandles(tokenAddress, '5m');
      if (candles.length === 0) {
        return {
          pattern: 'No Data',
          confidence: 0,
          action: 'HOLD',
          reasoning: 'No candlestick data available',
          wickAnalysis: 'N/A',
          volumeConfirmation: false,
          riskLevel: 'HIGH'
        };
      }

      // Get market context
      const marketContext = await this.getMarketContext(tokenAddress);

      // Enhanced prompt for EXIT analysis (looking for reversal patterns)
      const lastCandle = candles[candles.length - 1];
      const body = Math.abs(lastCandle.close - lastCandle.open);
      const upperWick = lastCandle.high - Math.max(lastCandle.close, lastCandle.open);
      const lowerWick = Math.min(lastCandle.close, lastCandle.open) - lastCandle.low;
      const isBullish = lastCandle.close > lastCandle.open;

      const positionContext = context ? `
Position Context:
- Entry Price: $${context.entryPrice?.toFixed(8) || 'N/A'}
- Current Price: $${currentPrice.toFixed(8)}
- Profit/Loss: ${context.profitPercent ? (context.profitPercent * 100).toFixed(2) + '%' : 'N/A'}
- Hold Time: ${context.holdTimeMinutes?.toFixed(0) || 'N/A'} minutes
` : '';

      const prompt = `You are analyzing a current position for EXIT signals. Look for REVERSAL patterns that indicate the trend is ending.

Current Candle:
  Type: ${isBullish ? 'BULLISH' : 'BEARISH'}
  Body: $${body.toFixed(8)}
  Upper Wick: $${upperWick.toFixed(8)} (${body > 0 ? ((upperWick/body)*100).toFixed(1) : 'N/A'}% of body)
  Lower Wick: $${lowerWick.toFixed(8)} (${body > 0 ? ((lowerWick/body)*100).toFixed(1) : 'N/A'}% of body)
  Close: $${lastCandle.close.toFixed(8)}

${positionContext}

Market Context:
- RVOL: ${marketContext.rvol.toFixed(2)}x
- 24h Trend: ${marketContext.trend24h > 0 ? '+' : ''}${marketContext.trend24h.toFixed(2)}%

REVERSAL PATTERNS TO DETECT:
1. SHOOTING STAR (long upper wick after rally = top signal)
2. BEARISH ENGULFING (large bearish candle engulfs previous bullish)
3. DOJI AT TOP (indecision after rally = possible reversal)
4. WICK REJECTION UP (price tried to go higher, got rejected)
5. VOLUME EXHAUSTION (RVOL dropping = pump ending)

Respond in JSON format:
{
  "pattern": "pattern name or 'No Reversal'",
  "confidence": 0-100,
  "action": "SELL" or "HOLD",
  "reasoning": "why this is/isn't a reversal",
  "wickAnalysis": "what the wicks tell us",
  "volumeConfirmation": true/false,
  "riskLevel": "LOW/MEDIUM/HIGH"
}`;

      const response = await axios.post(
        this.apiEndpoint,
        {
          model: 'grok-beta',
          messages: [
            {
              role: 'system',
              content: 'You are an expert at detecting reversal patterns for exit timing. Always respond with valid JSON only.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3,
          max_tokens: 400,
          response_format: { type: 'json_object' }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );

      const analysis = JSON.parse(response.data.choices[0].message.content || '{}') as AIAnalysis;
      
      console.log(`[AI Pattern Analysis] ${tokenAddress}: ${analysis.pattern} - ${analysis.action} (${analysis.confidence}% confidence)`);
      
      return analysis;

    } catch (error) {
      console.error('[AI Monitor] Pattern analysis error:', error);
      return {
        pattern: 'Analysis Error',
        confidence: 0,
        action: 'HOLD',
        reasoning: 'Failed to analyze pattern',
        wickAnalysis: 'Error',
        volumeConfirmation: false,
        riskLevel: 'HIGH'
      };
    }
  }
}

export default AICandlestickMonitor;

