// Trend Reversal Strategy
// Identifies oversold conditions and potential reversal points using technical indicators

import { BaseStrategy, MarketSignal, TokenMetrics, PositionInfo, StrategyConfig } from './baseStrategy';

interface TrendReversalConfig {
  rsiOversoldThreshold: number;
  rsiOverboughtThreshold: number;
  volumeSpikeMultiplier: number;
  minLiquidityUSD: number;
  maxRugScore: number;
  profitTargetPercent: number;
  stopLossPercent: number;
}

export class TrendReversalStrategy extends BaseStrategy {
  private entryPoints: Map<string, { price: number; time: number }> = new Map();

  constructor(config: StrategyConfig) {
    super('TrendReversal', config);
  }

  async analyze(
    tokenAddress: string,
    metrics: TokenMetrics,
    existingPosition?: PositionInfo
  ): Promise<MarketSignal> {
    if (!this.validateMetrics(metrics)) {
      return { action: 'HOLD', confidence: 0, reason: 'Invalid metrics' };
    }

    const reversalParams: TrendReversalConfig = {
      rsiOversoldThreshold: 30,
      rsiOverboughtThreshold: 70,
      volumeSpikeMultiplier: 2.0,
      minLiquidityUSD: 50000,
      maxRugScore: 500,
      profitTargetPercent: 12,
      stopLossPercent: 8,
      ...this.config.params
    };

    const riskScore = this.calculateRiskScore(metrics);

    // Basic quality filters
    if (
      metrics.liquidity < reversalParams.minLiquidityUSD ||
      metrics.rugScore > reversalParams.maxRugScore ||
      riskScore > 0.6
    ) {
      return { 
        action: 'HOLD', 
        confidence: 0.2, 
        reason: 'TrendReversal: Token fails quality filters' 
      };
    }

    // Existing position management
    if (existingPosition) {
      return this.manageExistingPosition(existingPosition, reversalParams, tokenAddress);
    }

    // New entry logic
    return this.evaluateEntry(tokenAddress, metrics, reversalParams);
  }

  private async evaluateEntry(
    tokenAddress: string,
    metrics: TokenMetrics,
    params: TrendReversalConfig
  ): Promise<MarketSignal> {
    const signals = this.detectReversalSignals(metrics, params);
    
    if (signals.isOversold && signals.hasVolumespike && signals.showsDivergence) {
      this.entryPoints.set(tokenAddress, { 
        price: metrics.price, 
        time: Date.now() 
      });

      return {
        action: 'BUY',
        confidence: 0.8,
        reason: `TrendReversal: Strong reversal signals detected (RSI: ${metrics.rsi?.toFixed(1)}, Volume spike: ${signals.volumeSpike.toFixed(1)}x)`,
        metadata: {
          strategy: 'TrendReversal',
          rsi: metrics.rsi,
          volumeSpike: signals.volumeSpike,
          priceChange24h: metrics.priceChange24h,
          divergence: signals.showsDivergence
        }
      };
    }

    if (signals.isOversold && (signals.hasVolumespike || signals.showsDivergence)) {
      this.entryPoints.set(tokenAddress, { 
        price: metrics.price, 
        time: Date.now() 
      });

      return {
        action: 'BUY',
        confidence: 0.6,
        reason: `TrendReversal: Moderate reversal signals (RSI: ${metrics.rsi?.toFixed(1)})`,
        metadata: {
          strategy: 'TrendReversal',
          rsi: metrics.rsi,
          volumeSpike: signals.volumeSpike,
          priceChange24h: metrics.priceChange24h
        }
      };
    }

    return { 
      action: 'HOLD', 
      confidence: 0.3, 
      reason: 'TrendReversal: Waiting for reversal signals' 
    };
  }

  private manageExistingPosition(
    position: PositionInfo,
    params: TrendReversalConfig,
    tokenAddress: string
  ): MarketSignal {
    // Take profits
    if (position.pnlPercent >= params.profitTargetPercent) {
      this.entryPoints.delete(tokenAddress);
      return {
        action: 'SELL',
        confidence: 0.9,
        reason: `TrendReversal: Profit target reached (+${position.pnlPercent.toFixed(1)}%)`,
        metadata: {
          strategy: 'TrendReversal',
          profitTaking: true
        }
      };
    }

    // Stop loss
    if (position.pnlPercent <= -params.stopLossPercent) {
      this.entryPoints.delete(tokenAddress);
      return {
        action: 'SELL',
        confidence: 0.8,
        reason: `TrendReversal: Stop loss triggered (-${Math.abs(position.pnlPercent).toFixed(1)}%)`,
        metadata: {
          strategy: 'TrendReversal',
          stopLoss: true
        }
      };
    }

    // Time-based exit (if position is old and not profitable)
    if (position.ageMinutes > 120 && position.pnlPercent < 3) {
      this.entryPoints.delete(tokenAddress);
      return {
        action: 'SELL',
        confidence: 0.7,
        reason: `TrendReversal: Time exit (${position.ageMinutes}min, +${position.pnlPercent.toFixed(1)}%)`,
        metadata: {
          strategy: 'TrendReversal',
          timeExit: true,
          ageMinutes: position.ageMinutes
        }
      };
    }

    return { 
      action: 'HOLD', 
      confidence: 0.5, 
      reason: `TrendReversal: Monitoring position (+${position.pnlPercent.toFixed(1)}%)` 
    };
  }

  private detectReversalSignals(metrics: TokenMetrics, params: TrendReversalConfig) {
    // RSI oversold condition
    const isOversold = metrics.rsi !== undefined && metrics.rsi < params.rsiOversoldThreshold;
    
    // Volume spike detection
    const avgVolumeHour = metrics.volume24h / 24;
    const volumeSpike = avgVolumeHour > 0 ? metrics.volume1h / avgVolumeHour : 0;
    const hasVolumespike = volumeSpike >= params.volumeSpikeMultiplier;
    
    // Price divergence (price falling while volume increasing)
    const showsDivergence = metrics.priceChange24h < -5 && hasVolumespike;
    
    // MACD bullish divergence (if available)
    const macdBullish = metrics.macd !== undefined && metrics.macd > 0;
    
    // Bollinger Bands oversold (if available)
    const bollingerOversold = metrics.bollingerBands && 
      metrics.price < metrics.bollingerBands.lower;

    return {
      isOversold,
      hasVolumespike,
      showsDivergence,
      volumeSpike,
      macdBullish,
      bollingerOversold
    };
  }

  public resetPosition(tokenAddress: string): void {
    this.entryPoints.delete(tokenAddress);
  }

  // Calculate additional technical indicators if not provided
  public static calculateRSI(prices: number[], period: number = 14): number {
    if (prices.length < period + 1) return 50; // Default neutral

    let gains = 0;
    let losses = 0;

    // Calculate initial average gain/loss
    for (let i = 1; i <= period; i++) {
      const change = prices[i] - prices[i - 1];
      if (change >= 0) gains += change;
      else losses -= change;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    // Calculate RSI for remaining periods
    for (let i = period + 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      const gain = change >= 0 ? change : 0;
      const loss = change < 0 ? -change : 0;

      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }
}