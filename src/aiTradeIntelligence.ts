/**
 * AI Trade Intelligence System
 * Comprehensive AI-powered trading decision support using xAI Grok
 */

import axios from 'axios';

interface PositionInfo {
  tokenMint: string;
  symbol: string;
  entryPrice: number;
  currentPrice: number;
  amountSOL: number;
  tokenAmount: number;
  pnlPercent: number;
  pnl: number;
}

interface StrategySignals {
  candlestick?: number;
  martingale?: number;
  trendReversal?: number;
  dca?: number;
  combined: number;
}

interface MarketContext {
  tokenAddress: string;
  symbol: string;
  price: number;
  priceChange24h: number;
  volume24h: number;
  liquidity: number;
  rvol: number;
  holders?: number;
  age?: string;
}

interface TradeValidationResult {
  approved: boolean;
  confidence: number; // 0-1
  reasoning: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  warnings: string[];
}

interface ExitLevels {
  takeProfit: number; // Percentage
  stopLoss: number; // Percentage
  reasoning: string;
  trailingStop?: boolean;
}

interface MarketRegime {
  regime: 'BULL' | 'BEAR' | 'SIDEWAYS' | 'VOLATILE';
  riskAppetite: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE';
  confidence: number; // 0-1
  reasoning: string;
  recommendedPositionMultiplier: number; // 0.5-2.0
}

interface MultiTimeframeAnalysis {
  trend1m: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  trend5m: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  trend15m: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  trend1h: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  alignment: number; // 0-1, how aligned are timeframes
  strongestTimeframe: string;
  divergences: string[];
  recommendation: string;
}

interface TwitterSentiment {
  mentions24h: number;
  sentimentScore: number; // -1 to 1
  hypeLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME';
  rugRisk: number; // 0-1
  keyTopics: string[];
  recommendation: string;
}

interface PositionSizeRecommendation {
  solAmount: number;
  confidence: number;
  reasoning: string;
  riskAdjustment: number; // multiplier from base amount
}

interface PostTradeAnalysis {
  outcome: 'WIN' | 'LOSS';
  expectedVsActual: string;
  successFactors: string[];
  failureFactors: string[];
  lessonsLearned: string[];
  strategyAdjustments: {
    candlestick?: number;
    martingale?: number;
    trendReversal?: number;
    dca?: number;
  };
}

export class AITradeIntelligence {
  private grokApiKey: string;
  private apiUrl = 'https://api.x.ai/v1/chat/completions';
  private twitterBearerToken: string | null;
  private recentTrades: Array<{ win: boolean; profit: number; timestamp: number }> = [];

  constructor(grokApiKey: string, twitterBearerToken?: string) {
    this.grokApiKey = grokApiKey;
    this.twitterBearerToken = twitterBearerToken || null;
  }

  /**
   * 1. AI Trade Entry Validator - Final sanity check before executing trade
   */
  async validateTradeEntry(
    signals: StrategySignals,
    marketContext: MarketContext,
    currentPositions: number
  ): Promise<TradeValidationResult> {
    const prompt = `You are an expert crypto trader analyzing a potential trade entry. Review this data and decide if we should enter:

STRATEGY SIGNALS:
${signals.candlestick !== undefined ? `- Candlestick Strategy: ${(signals.candlestick * 100).toFixed(1)}%` : ''}
${signals.martingale !== undefined ? `- Anti-Martingale: ${(signals.martingale * 100).toFixed(1)}%` : ''}
${signals.trendReversal !== undefined ? `- Trend Reversal (RSI): ${(signals.trendReversal * 100).toFixed(1)}%` : ''}
${signals.dca !== undefined ? `- DCA Strategy: ${(signals.dca * 100).toFixed(1)}%` : ''}
- Combined Signal: ${(signals.combined * 100).toFixed(1)}%

MARKET CONTEXT:
- Token: ${marketContext.symbol} (${marketContext.tokenAddress})
- Price: $${marketContext.price}
- 24h Change: ${marketContext.priceChange24h > 0 ? '+' : ''}${marketContext.priceChange24h.toFixed(2)}%
- 24h Volume: $${(marketContext.volume24h / 1000000).toFixed(2)}M
- Liquidity: $${(marketContext.liquidity / 1000000).toFixed(2)}M
- RVOL: ${marketContext.rvol.toFixed(2)}x
${marketContext.holders ? `- Holders: ${marketContext.holders}` : ''}
${marketContext.age ? `- Token Age: ${marketContext.age}` : ''}

CURRENT STATE:
- Active Positions: ${currentPositions}

Respond in JSON format:
{
  "approved": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "detailed explanation of decision",
  "riskLevel": "LOW/MEDIUM/HIGH/EXTREME",
  "warnings": ["warning1", "warning2"]
}

Consider:
- Is liquidity sufficient to avoid slippage?
- Is RVOL confirming the signal?
- Are multiple strategies agreeing?
- Is this a quality setup or FOMO?
- Any red flags (low holders, new token, extreme price action)?`;

    try {
      const response = await axios.post(
        this.apiUrl,
        {
          model: 'grok-beta',
          messages: [
            {
              role: 'system',
              content: 'You are an expert crypto trading analyst. Always respond with valid JSON.',
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
        },
        {
          headers: {
            Authorization: `Bearer ${this.grokApiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const content = response.data.choices[0].message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in Grok response');
      }

      const result = JSON.parse(jsonMatch[0]);
      return result;
    } catch (error: any) {
      console.error('[AI Trade Validator] Error:', error.message);
      // Default to conservative response on error
      return {
        approved: false,
        confidence: 0,
        reasoning: `AI validation failed: ${error.message}`,
        riskLevel: 'EXTREME',
        warnings: ['AI system unavailable, rejecting trade for safety'],
      };
    }
  }

  /**
   * 2. AI Exit Optimizer - Dynamic stop loss and take profit levels
   */
  async optimizeExitLevels(
    position: PositionInfo,
    currentPrice: number,
    candles: any[]
  ): Promise<ExitLevels> {
    // Calculate volatility from recent candles
    const volatility = this.calculateVolatility(candles);
    const priceChange = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;

    const prompt = `You are an expert at setting optimal exit levels for crypto trades. Analyze this position:

POSITION:
- Entry Price: $${position.entryPrice}
- Current Price: $${currentPrice}
- Current P&L: ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(2)}%
- Size: ${position.amountSOL} SOL
- Token: ${position.symbol}

MARKET CONDITIONS:
- Recent Volatility (ATR%): ${volatility.toFixed(2)}%
- Candle Data: ${candles.length} recent candles available

CANDLE ANALYSIS:
${candles.slice(-5).map((c: any, i: number) => 
  `${i + 1}. O:$${c.open} H:$${c.high} L:$${c.low} C:$${c.close} Vol:${(c.volume / 1000).toFixed(1)}k`
).join('\n')}

Respond in JSON format:
{
  "takeProfit": percentage (e.g., 15.5 for 15.5%),
  "stopLoss": percentage (negative, e.g., -8.0 for -8%),
  "reasoning": "detailed explanation",
  "trailingStop": true/false
}

Consider:
- Current volatility (wider stops in volatile markets)
- Support/resistance from candle wicks
- Risk/reward ratio (aim for at least 2:1)
- Current profit (can tighten stop if already profitable)
- Momentum (trailing stop if strong trend)`;

    try {
      const response = await axios.post(
        this.apiUrl,
        {
          model: 'grok-beta',
          messages: [
            {
              role: 'system',
              content: 'You are an expert crypto trading analyst. Always respond with valid JSON.',
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
        },
        {
          headers: {
            Authorization: `Bearer ${this.grokApiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const content = response.data.choices[0].message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in Grok response');
      }

      return JSON.parse(jsonMatch[0]);
    } catch (error: any) {
      console.error('[AI Exit Optimizer] Error:', error.message);
      // Default to conservative levels
      return {
        takeProfit: 12,
        stopLoss: -6,
        reasoning: `AI optimizer failed, using default 2:1 R/R: ${error.message}`,
        trailingStop: false,
      };
    }
  }

  /**
   * 3. AI Market Regime Detector - Overall market conditions
   */
  async detectMarketRegime(recentPerformance: {
    winRate: number;
    avgProfit: number;
    trades24h: number;
  }): Promise<MarketRegime> {
    // Get BTC and SOL recent price action as market indicators
    const prompt = `You are an expert at reading crypto market conditions. Analyze current regime:

RECENT BOT PERFORMANCE:
- Win Rate (24h): ${(recentPerformance.winRate * 100).toFixed(1)}%
- Average Profit: ${recentPerformance.avgProfit > 0 ? '+' : ''}${recentPerformance.avgProfit.toFixed(2)}%
- Trades Executed: ${recentPerformance.trades24h}

ANALYSIS NEEDED:
Based on the bot's recent performance, determine the current market regime.

A high win rate + positive avg profit = BULL market (favorable for aggressive trading)
Low win rate + negative avg profit = BEAR market (be conservative)
Mixed signals = SIDEWAYS or VOLATILE (reduce position sizes)

Respond in JSON format:
{
  "regime": "BULL/BEAR/SIDEWAYS/VOLATILE",
  "riskAppetite": "CONSERVATIVE/MODERATE/AGGRESSIVE",
  "confidence": 0.0-1.0,
  "reasoning": "detailed explanation",
  "recommendedPositionMultiplier": 0.5-2.0 (multiply base position size by this)
}

Consider:
- Win rate trend
- Average profit/loss
- Trading volume/activity
- Recommend CONSERVATIVE (0.5x) in BEAR, AGGRESSIVE (1.5-2.0x) in BULL`;

    try {
      const response = await axios.post(
        this.apiUrl,
        {
          model: 'grok-beta',
          messages: [
            {
              role: 'system',
              content: 'You are an expert crypto market analyst. Always respond with valid JSON.',
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
        },
        {
          headers: {
            Authorization: `Bearer ${this.grokApiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const content = response.data.choices[0].message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in Grok response');
      }

      return JSON.parse(jsonMatch[0]);
    } catch (error: any) {
      console.error('[AI Market Regime] Error:', error.message);
      return {
        regime: 'SIDEWAYS',
        riskAppetite: 'MODERATE',
        confidence: 0.5,
        reasoning: `AI regime detection failed, defaulting to neutral: ${error.message}`,
        recommendedPositionMultiplier: 1.0,
      };
    }
  }

  /**
   * 4. Multi-Timeframe Analyzer
   */
  async analyzeMultipleTimeframes(
    tokenAddress: string,
    symbol: string
  ): Promise<MultiTimeframeAnalysis> {
    // Fetch candles for multiple timeframes from DexScreener
    const timeframes = ['1m', '5m', '15m', '1h'];
    const candleData: any = {};

    try {
      for (const tf of timeframes) {
        const candles = await this.fetchCandlesForTimeframe(tokenAddress, tf);
        candleData[tf] = candles;
      }

      const prompt = `You are an expert at multi-timeframe analysis. Analyze this token across all timeframes:

TOKEN: ${symbol}

1-MINUTE CANDLES (last 5):
${this.formatCandles(candleData['1m']?.slice(-5) || [])}

5-MINUTE CANDLES (last 5):
${this.formatCandles(candleData['5m']?.slice(-5) || [])}

15-MINUTE CANDLES (last 5):
${this.formatCandles(candleData['15m']?.slice(-5) || [])}

1-HOUR CANDLES (last 5):
${this.formatCandles(candleData['1h']?.slice(-5) || [])}

Respond in JSON format:
{
  "trend1m": "BULLISH/BEARISH/NEUTRAL",
  "trend5m": "BULLISH/BEARISH/NEUTRAL",
  "trend15m": "BULLISH/BEARISH/NEUTRAL",
  "trend1h": "BULLISH/BEARISH/NEUTRAL",
  "alignment": 0.0-1.0 (how aligned are trends),
  "strongestTimeframe": "1m/5m/15m/1h",
  "divergences": ["list any timeframe divergences"],
  "recommendation": "detailed trading recommendation"
}

Consider:
- Are higher timeframes confirming lower timeframes?
- Any divergences (e.g., 1m bullish but 1h bearish)?
- Which timeframe shows strongest momentum?
- Should we trade with or against the divergence?`;

      const response = await axios.post(
        this.apiUrl,
        {
          model: 'grok-beta',
          messages: [
            {
              role: 'system',
              content: 'You are an expert crypto trader. Always respond with valid JSON.',
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
        },
        {
          headers: {
            Authorization: `Bearer ${this.grokApiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const content = response.data.choices[0].message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in Grok response');
      }

      return JSON.parse(jsonMatch[0]);
    } catch (error: any) {
      console.error('[Multi-Timeframe Analyzer] Error:', error.message);
      return {
        trend1m: 'NEUTRAL',
        trend5m: 'NEUTRAL',
        trend15m: 'NEUTRAL',
        trend1h: 'NEUTRAL',
        alignment: 0.5,
        strongestTimeframe: 'UNKNOWN',
        divergences: [`Analysis failed: ${error.message}`],
        recommendation: 'Insufficient data for multi-timeframe analysis',
      };
    }
  }

  /**
   * 5. Twitter Sentiment Monitor
   */
  async analyzeTwitterSentiment(tokenSymbol: string, tokenAddress: string): Promise<TwitterSentiment> {
    if (!this.twitterBearerToken) {
      return {
        mentions24h: 0,
        sentimentScore: 0,
        hypeLevel: 'LOW',
        rugRisk: 0.5,
        keyTopics: [],
        recommendation: 'Twitter integration not configured',
      };
    }

    try {
      // Search for recent tweets about the token
      const query = `${tokenSymbol} OR ${tokenAddress} -is:retweet lang:en`;
      const tweets = await this.fetchRecentTweets(query);

      if (tweets.length === 0) {
        return {
          mentions24h: 0,
          sentimentScore: 0,
          hypeLevel: 'LOW',
          rugRisk: 0.3,
          keyTopics: ['No recent mentions'],
          recommendation: 'Low social activity - proceed with caution',
        };
      }

      // Send tweets to Grok for sentiment analysis
      const tweetText = tweets.map((t: any) => t.text).join('\n---\n');

      const prompt = `You are an expert at analyzing crypto Twitter sentiment. Analyze these recent tweets about ${tokenSymbol}:

TWEETS (last 24h):
${tweetText}

Respond in JSON format:
{
  "mentions24h": ${tweets.length},
  "sentimentScore": -1.0 to 1.0 (negative to positive),
  "hypeLevel": "LOW/MODERATE/HIGH/EXTREME",
  "rugRisk": 0.0-1.0 (probability this is a pump and dump),
  "keyTopics": ["topic1", "topic2"],
  "recommendation": "detailed trading recommendation based on sentiment"
}

Consider:
- Genuine excitement vs coordinated shilling
- Quality of accounts posting (bots vs real users)
- Language used (FOMO indicators, emojis, caps)
- Red flags: "100x", "moon", "gem", coordinated messaging
- Green flags: Technical discussion, real use cases, organic growth`;

      const response = await axios.post(
        this.apiUrl,
        {
          model: 'grok-beta',
          messages: [
            {
              role: 'system',
              content: 'You are an expert at detecting crypto scams and market manipulation. Always respond with valid JSON.',
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
        },
        {
          headers: {
            Authorization: `Bearer ${this.grokApiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const content = response.data.choices[0].message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in Grok response');
      }

      return JSON.parse(jsonMatch[0]);
    } catch (error: any) {
      console.error('[Twitter Sentiment] Error:', error.message);
      return {
        mentions24h: 0,
        sentimentScore: 0,
        hypeLevel: 'LOW',
        rugRisk: 0.5,
        keyTopics: [],
        recommendation: `Sentiment analysis failed: ${error.message}`,
      };
    }
  }

  /**
   * 6. AI Position Sizer - Dynamic position sizing
   */
  async recommendPositionSize(
    baseAmount: number,
    signals: StrategySignals,
    marketRegime: MarketRegime,
    winRate: number
  ): Promise<PositionSizeRecommendation> {
    const prompt = `You are an expert at position sizing for crypto trades. Recommend optimal position size:

BASE POSITION: ${baseAmount} SOL

STRATEGY SIGNALS:
- Combined Signal Strength: ${(signals.combined * 100).toFixed(1)}%
- Individual Signals: ${JSON.stringify(signals, null, 2)}

MARKET REGIME:
- Current Regime: ${marketRegime.regime}
- Risk Appetite: ${marketRegime.riskAppetite}
- Recommended Multiplier: ${marketRegime.recommendedPositionMultiplier}x

BOT PERFORMANCE:
- Recent Win Rate: ${(winRate * 100).toFixed(1)}%

Respond in JSON format:
{
  "solAmount": final SOL amount to use,
  "confidence": 0.0-1.0,
  "reasoning": "detailed explanation",
  "riskAdjustment": multiplier from base (0.5-2.0)
}

Consider:
- Stronger signals = larger position (up to 2x base)
- Weaker signals = smaller position (down to 0.5x base)
- Bull market regime = increase size
- Bear market regime = decrease size
- High win rate = can be more aggressive
- Low win rate = reduce size until performance improves`;

    try {
      const response = await axios.post(
        this.apiUrl,
        {
          model: 'grok-beta',
          messages: [
            {
              role: 'system',
              content: 'You are an expert crypto risk manager. Always respond with valid JSON.',
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
        },
        {
          headers: {
            Authorization: `Bearer ${this.grokApiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const content = response.data.choices[0].message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in Grok response');
      }

      const result = JSON.parse(jsonMatch[0]);
      
      // Safety bounds
      result.solAmount = Math.max(baseAmount * 0.5, Math.min(result.solAmount, baseAmount * 2));
      
      return result;
    } catch (error: any) {
      console.error('[AI Position Sizer] Error:', error.message);
      return {
        solAmount: baseAmount,
        confidence: 0.5,
        reasoning: `AI sizing failed, using base amount: ${error.message}`,
        riskAdjustment: 1.0,
      };
    }
  }

  /**
   * 7. Post-Trade Analyzer - Learn from each trade
   */
  async analyzeCompletedTrade(
    position: PositionInfo,
    entrySignals: StrategySignals,
    exitPrice: number,
    exitReason: string
  ): Promise<PostTradeAnalysis> {
    const profit = ((exitPrice - position.entryPrice) / position.entryPrice) * 100;
    const outcome = profit > 0 ? 'WIN' : 'LOSS';

    // Track recent trades
    this.recentTrades.push({
      win: outcome === 'WIN',
      profit,
      timestamp: Date.now(),
    });

    // Keep only last 50 trades
    if (this.recentTrades.length > 50) {
      this.recentTrades.shift();
    }

    const prompt = `You are an expert at analyzing trading performance. Review this completed trade:

TRADE OUTCOME: ${outcome}
- Entry Price: $${position.entryPrice}
- Exit Price: $${exitPrice}
- Profit/Loss: ${profit > 0 ? '+' : ''}${profit.toFixed(2)}%
- Exit Reason: ${exitReason}
- Token: ${position.symbol}

ENTRY SIGNALS:
${JSON.stringify(entrySignals, null, 2)}

RECENT PERFORMANCE:
- Last 10 trades: ${this.recentTrades.slice(-10).map(t => t.win ? 'W' : 'L').join(' ')}
- Win rate: ${this.getWinRate().toFixed(1)}%

Respond in JSON format:
{
  "outcome": "WIN/LOSS",
  "expectedVsActual": "comparison of what we expected vs what happened",
  "successFactors": ["factor1", "factor2"] (for wins),
  "failureFactors": ["factor1", "factor2"] (for losses),
  "lessonsLearned": ["lesson1", "lesson2"],
  "strategyAdjustments": {
    "candlestick": suggested weight adjustment (optional),
    "martingale": suggested weight adjustment (optional),
    "trendReversal": suggested weight adjustment (optional),
    "dca": suggested weight adjustment (optional)
  }
}

Consider:
- Which strategy signals were correct/incorrect?
- Did we exit too early/late?
- Was the setup actually as strong as signals suggested?
- Pattern recognition: What works in current market conditions?
- Strategy weight recommendations based on performance`;

    try {
      const response = await axios.post(
        this.apiUrl,
        {
          model: 'grok-beta',
          messages: [
            {
              role: 'system',
              content: 'You are an expert trading coach analyzing performance. Always respond with valid JSON.',
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
        },
        {
          headers: {
            Authorization: `Bearer ${this.grokApiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const content = response.data.choices[0].message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in Grok response');
      }

      return JSON.parse(jsonMatch[0]);
    } catch (error: any) {
      console.error('[Post-Trade Analyzer] Error:', error.message);
      return {
        outcome,
        expectedVsActual: 'Analysis unavailable',
        successFactors: [],
        failureFactors: [],
        lessonsLearned: [`AI analysis failed: ${error.message}`],
        strategyAdjustments: {},
      };
    }
  }

  // Helper methods
  private calculateVolatility(candles: any[]): number {
    if (candles.length < 2) return 0;

    const trueRanges = candles.map((c: any) => {
      const high = c.high;
      const low = c.low;
      return ((high - low) / low) * 100;
    });

    return trueRanges.reduce((a: number, b: number) => a + b, 0) / trueRanges.length;
  }

  private async fetchCandlesForTimeframe(tokenAddress: string, timeframe: string): Promise<any[]> {
    try {
      const response = await axios.get(
        `https://api.dexscreener.com/latest/dex/pairs/solana/${tokenAddress}`,
        { timeout: 10000 }
      );

      if (response.data?.pairs?.[0]) {
        // DexScreener doesn't have multi-timeframe, so we simulate by sampling
        // In production, you'd use a proper candle API
        return response.data.pairs[0].txns || [];
      }

      return [];
    } catch (error: any) {
      console.error(`[Fetch Candles ${timeframe}] Error:`, error.message);
      return [];
    }
  }

  private formatCandles(candles: any[]): string {
    if (!candles || candles.length === 0) return 'No data available';

    return candles
      .map(
        (c: any, i: number) =>
          `${i + 1}. O:$${c.open || 'N/A'} H:$${c.high || 'N/A'} L:$${c.low || 'N/A'} C:$${c.close || 'N/A'}`
      )
      .join('\n');
  }

  private async fetchRecentTweets(query: string): Promise<any[]> {
    try {
      const response = await axios.get('https://api.twitter.com/2/tweets/search/recent', {
        params: {
          query,
          max_results: 100,
          'tweet.fields': 'created_at,public_metrics',
        },
        headers: {
          Authorization: `Bearer ${this.twitterBearerToken}`,
        },
        timeout: 10000,
      });

      return response.data?.data || [];
    } catch (error: any) {
      console.error('[Twitter API] Error:', error.message);
      return [];
    }
  }

  private getWinRate(): number {
    if (this.recentTrades.length === 0) return 50;
    const wins = this.recentTrades.filter(t => t.win).length;
    return (wins / this.recentTrades.length) * 100;
  }

  public getRecentPerformance(): { winRate: number; avgProfit: number; trades24h: number } {
    const last24h = Date.now() - 24 * 60 * 60 * 1000;
    const recent = this.recentTrades.filter(t => t.timestamp > last24h);

    if (recent.length === 0) {
      return { winRate: 0.5, avgProfit: 0, trades24h: 0 };
    }

    const wins = recent.filter(t => t.win).length;
    const avgProfit = recent.reduce((sum, t) => sum + t.profit, 0) / recent.length;

    return {
      winRate: wins / recent.length,
      avgProfit,
      trades24h: recent.length,
    };
  }
}
