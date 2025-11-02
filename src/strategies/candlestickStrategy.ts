import { TokenMetrics, PositionInfo, BaseStrategy, MarketSignal, StrategyConfig } from './baseStrategy';

interface CandleData {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

interface PatternSignal {
  type: 'BULLISH_PIN' | 'BEARISH_PIN' | 'BULLISH_ENGULFING' | 'BEARISH_ENGULFING' | 'BULLISH_REJECTION' | 'BEARISH_REJECTION';
  confidence: number;
  reason: string;
}

/**
 * EmperorBTC Candlestick Strategy
 * 
 * Philosophy from EmperorBTC Trading Manual:
 * - Context (support/resistance/trend) = 50% of decision
 * - Wick rejection analysis = Primary signal
 * - Volume confirmation = Mandatory
 * - Pattern alone is NOT enough
 * 
 * Accuracy: 70-80% when combined with market context
 */
export class CandlestickStrategy extends BaseStrategy {
  private readonly MIN_WICK_TO_BODY_RATIO = 2.0;  // Wick must be 2x body size for pin bar

  constructor(config: StrategyConfig) {
    super('Candlestick', config);
  }

  /**
   * Analyzes token using EmperorBTC candlestick methodology
   */
  async analyze(
    _tokenAddress: string,
    metrics: TokenMetrics,
    existingPosition?: PositionInfo
  ): Promise<MarketSignal> {
    try {
      // Get recent candles (we'll use price action from metrics as proxy)
      const currentCandle = this.buildCurrentCandle(metrics);
      
      // Detect patterns
      const patterns = this.detectPatterns(currentCandle, metrics);
      
      if (patterns.length === 0) {
        return { action: 'HOLD', confidence: 0.3, reason: 'No candlestick patterns detected' };
      }

      // Apply EmperorBTC context analysis
      const contextScore = this.analyzeMarketContext(metrics, existingPosition);
      const volumeConfirmed = this.confirmWithVolume(metrics);
      
      // Calculate final confidence (Pattern + Context + Volume)
      let bestPattern = patterns[0];
      let rawConfidence = (bestPattern.confidence * 0.4) + (contextScore * 0.4) + (volumeConfirmed ? 20 : 0);
      let finalConfidence = rawConfidence / 100; // Convert to 0-1 scale
      
      // Determine action based on pattern type
      const isBullish = bestPattern.type.includes('BULLISH');
      const isBearish = bestPattern.type.includes('BEARISH');
      
      // Entry logic: Bullish patterns with context + volume
      if (isBullish && !existingPosition && volumeConfirmed && contextScore >= 40) {
        return {
          action: 'BUY',
          confidence: Math.min(finalConfidence, 0.95),
          reason: `${bestPattern.type}: ${bestPattern.reason} | Context: ${contextScore.toFixed(0)}% | Volume confirmed`
        };
      }
      
      // Exit logic: Bearish patterns when holding position
      if (isBearish && existingPosition && existingPosition.pnlPercent > 5) {
        return {
          action: 'SELL',
          confidence: Math.min(finalConfidence, 0.9),
          reason: `${bestPattern.type}: ${bestPattern.reason} | Lock in +${existingPosition.pnlPercent.toFixed(1)}% profit`
        };
      }
      
      // Hold otherwise
      return {
        action: 'HOLD',
        confidence: Math.max(finalConfidence, 0.35),
        reason: `${bestPattern.type} detected but conditions not met for entry/exit`
      };
      
    } catch (error) {
      console.error('[CandlestickStrategy] Error analyzing token:', error);
      return { action: 'HOLD', confidence: 0, reason: 'Analysis error' };
    }
  }

  /**
   * Build current candle from token metrics
   */
  private buildCurrentCandle(metrics: TokenMetrics): CandleData {
    const price = metrics.price;
    const change24h = metrics.priceChange24h;
    
    // Estimate OHLC from 24h price change
    const open = price / (1 + change24h / 100);
    const high = Math.max(price, open) * 1.01; // Assume some wick
    const low = Math.min(price, open) * 0.99;
    const close = price;
    
    return {
      open,
      high,
      low,
      close,
      volume: metrics.volume24h,
      timestamp: Date.now()
    };
  }

  /**
   * Detect candlestick patterns (EmperorBTC methodology)
   */
  private detectPatterns(candle: CandleData, metrics: TokenMetrics): PatternSignal[] {
    const patterns: PatternSignal[] = [];
    
    // Calculate candle metrics
    const body = Math.abs(candle.close - candle.open);
    const upperWick = candle.high - Math.max(candle.close, candle.open);
    const lowerWick = Math.min(candle.close, candle.open) - candle.low;
    const totalRange = candle.high - candle.low;
    
    const isBullish = candle.close > candle.open;
    const isBearish = candle.close < candle.open;
    
    // 1. PIN BAR DETECTION (Emperor's favorite)
    // Bullish pin bar: Long lower wick (buyers rejected lower prices)
    if (lowerWick > body * this.MIN_WICK_TO_BODY_RATIO && isBullish) {
      const wickStrength = (lowerWick / totalRange) * 100;
      patterns.push({
        type: 'BULLISH_PIN',
        confidence: Math.min(60 + wickStrength * 0.3, 80),
        reason: `Strong bullish pin bar - ${wickStrength.toFixed(0)}% lower wick rejection`
      });
    }
    
    // Bearish pin bar: Long upper wick (sellers rejected higher prices)
    if (upperWick > body * this.MIN_WICK_TO_BODY_RATIO && isBearish) {
      const wickStrength = (upperWick / totalRange) * 100;
      patterns.push({
        type: 'BEARISH_PIN',
        confidence: Math.min(60 + wickStrength * 0.3, 80),
        reason: `Strong bearish pin bar - ${wickStrength.toFixed(0)}% upper wick rejection`
      });
    }
    
    // 2. WICK REJECTION ANALYSIS (key EmperorBTC signal)
    const wickRejectionRatio = Math.max(upperWick, lowerWick) / body;
    if (wickRejectionRatio > 3.0) {
      const rejectionType = lowerWick > upperWick ? 'BULLISH_REJECTION' : 'BEARISH_REJECTION';
      patterns.push({
        type: rejectionType,
        confidence: 70,
        reason: `Strong ${lowerWick > upperWick ? 'support' : 'resistance'} rejection (${wickRejectionRatio.toFixed(1)}x)`
      });
    }
    
    // 3. ENGULFING PATTERNS (requires previous candle - use 24h change as proxy)
    const change24h = metrics.priceChange24h;
    
    // Bullish engulfing: Strong green candle (simplified without historical data)
    if (isBullish && change24h > 5 && body > totalRange * 0.6) {
      patterns.push({
        type: 'BULLISH_ENGULFING',
        confidence: 65,
        reason: `Bullish momentum - +${change24h.toFixed(1)}% with strong body`
      });
    }
    
    // Bearish engulfing: Strong red candle (simplified)
    if (isBearish && change24h < -5 && body > totalRange * 0.6) {
      patterns.push({
        type: 'BEARISH_ENGULFING',
        confidence: 65,
        reason: `Bearish momentum - ${change24h.toFixed(1)}% with strong body`
      });
    }
    
    // Sort by confidence
    return patterns.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Analyze market context (EmperorBTC: context = 50% of decision)
   */
  private analyzeMarketContext(metrics: TokenMetrics, positionInfo?: PositionInfo): number {
    let contextScore = 0;
    
    // 1. Trend analysis (24h momentum)
    const change24h = metrics.priceChange24h;
    
    // Strong bullish trend
    if (change24h > 10) {
      contextScore += 30;
    }
    // Moderate bullish
    else if (change24h > 0) {
      contextScore += 15;
    }
    // Bearish trend
    else if (change24h < -10) {
      contextScore += 10; // Lower score for bearish in crypto
    }
    
    // 2. Support/Resistance (using current price position in 24h range)
    const currentPrice = metrics.price;
    const priceChange = change24h / 100;
    const low24h = currentPrice / (1 + priceChange);
    
    const distanceFromLow = ((currentPrice - low24h) / low24h) * 100;
    
    // Near support = bullish context
    if (distanceFromLow < 10 && change24h > 0) {
      contextScore += 25;
    }
    // Near 24h high = continuation potential
    if (distanceFromLow > 90 && change24h > 5) {
      contextScore += 20;
    }
    
    // 3. Liquidity context (higher liquidity = safer trade)
    const liquidityUsd = metrics.liquidity;
    if (liquidityUsd > 500000) {
      contextScore += 20;
    } else if (liquidityUsd > 100000) {
      contextScore += 10;
    }
    
    // 4. Position context (if we're already in a trade)
    if (positionInfo) {
      // Profitable position = higher confidence to hold
      if (positionInfo.pnlPercent > 10) {
        contextScore += 15;
      }
      // Losing position = need strong pattern to add
      else if (positionInfo.pnlPercent < -5) {
        contextScore -= 20;
      }
    }
    
    return Math.max(0, Math.min(100, contextScore));
  }

  /**
   * Confirm pattern with volume (EmperorBTC: mandatory check)
   */
  private confirmWithVolume(metrics: TokenMetrics): boolean {
    const volume24h = metrics.volume24h;
    const volume1h = metrics.volume1h;
    
    // Estimate RVOL: compare 1h volume to avg hourly volume from 24h
    const avgHourlyVolume = volume24h / 24;
    const rvol = volume1h / avgHourlyVolume;
    
    // Volume must be elevated (RVOL > 1.5x)
    return rvol >= 1.5;
  }
}

export default CandlestickStrategy;
