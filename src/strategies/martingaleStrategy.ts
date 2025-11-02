// Anti-Martingale Strategy (Reverse Martingale)
// Doubles position size on WINS, cuts on LOSSES - "let winners run, cut losers early"
// MUCH SAFER than classic Martingale - works in momentum-driven crypto markets

import { BaseStrategy, MarketSignal, TokenMetrics, PositionInfo, StrategyConfig } from './baseStrategy';

interface MartingaleConfig {
  maxDoublings: number; // Max times to double winning positions
  minWinThreshold: number; // Min profit % to trigger doubling
  stopLossPercent: number; // Cut losers at this %
  baseBetSize: number;
  qualityThreshold: number; // Only apply to high-quality tokens
}

export class MartingaleStrategy extends BaseStrategy {
  private doublingCounts: Map<string, number> = new Map(); // Track wins in a row
  private originalInvestments: Map<string, number> = new Map();

  constructor(config: StrategyConfig) {
    super('Anti-Martingale', config);
  }

  async analyze(
    tokenAddress: string,
    metrics: TokenMetrics,
    existingPosition?: PositionInfo
  ): Promise<MarketSignal> {
    if (!this.validateMetrics(metrics)) {
      return { action: 'HOLD', confidence: 0, reason: 'Invalid metrics' };
    }

    const martingaleParams: MartingaleConfig = {
      maxDoublings: 3, // Conservative: max 3 doublings on wins (8x position)
      minWinThreshold: 2, // Double after 2% gain
      stopLossPercent: 8, // Cut losers at -8% (tight stop)
      baseBetSize: 0.003, // 0.003 SOL base bet
      qualityThreshold: 0.4, // With RVOL filter, can be more aggressive
      ...this.config.params
    };

    const riskScore = this.calculateRiskScore(metrics);
    const qualityScore = this.calculateQualityScore(metrics);
    const doublingCount = this.doublingCounts.get(tokenAddress) || 0;

    // Only apply anti-martingale to high-quality tokens
    if (qualityScore < martingaleParams.qualityThreshold) {
      return { 
        action: 'HOLD', 
        confidence: 0.3, 
        reason: 'Anti-Martingale: Token quality too low for momentum strategy' 
      };
    }

    // Initial entry conditions - enter on MOMENTUM (not dips!)
    if (!existingPosition) {
      if (
        metrics.liquidity > 100000 &&
        metrics.volume24h > 100000 &&
        riskScore < 0.3 &&
        this.isTrendingUp(metrics) // Enter on UPTREND (anti-martingale = ride momentum)
      ) {
        this.originalInvestments.set(tokenAddress, martingaleParams.baseBetSize);
        this.doublingCounts.set(tokenAddress, 0);

        return {
          action: 'BUY',
          confidence: 0.7,
          reason: 'Anti-Martingale: Initial entry on momentum uptrend',
          amount: martingaleParams.baseBetSize,
          metadata: {
            strategy: 'Anti-Martingale',
            doublingCount: 0,
            originalInvestment: martingaleParams.baseBetSize
          }
        };
      }
      return { action: 'HOLD', confidence: 0.4, reason: 'Anti-Martingale: Waiting for momentum entry' };
    }

    // Existing position logic
    const profitPct = existingPosition.pnlPercent;

    // ANTI-MARTINGALE: Double down on WINS (ride momentum!)
    if (
      profitPct >= martingaleParams.minWinThreshold &&
      doublingCount < martingaleParams.maxDoublings &&
      this.isMomentumContinuing(metrics) // Confirm momentum still strong
    ) {
      const doubleAmount = martingaleParams.baseBetSize * Math.pow(2, doublingCount + 1);
      this.doublingCounts.set(tokenAddress, doublingCount + 1);

      return {
        action: 'BUY',
        confidence: 0.7 + (doublingCount * 0.05), // HIGHER confidence with each win!
        reason: `Anti-Martingale: Doubling on win #${doublingCount + 1} at +${profitPct.toFixed(1)}% - ride momentum!`,
        amount: doubleAmount,
        metadata: {
          strategy: 'Anti-Martingale',
          doublingCount: doublingCount + 1,
          totalProfit: profitPct
        }
      };
    }

    // Take profits at high levels
    if (profitPct >= 10 + (doublingCount * 5)) { // 10%, 15%, 20% based on doublings
      this.resetPosition(tokenAddress);
      return {
        action: 'SELL',
        confidence: 0.9,
        reason: `Anti-Martingale: Profit target reached (+${profitPct.toFixed(1)}%) after ${doublingCount} doublings`,
        metadata: {
          strategy: 'Anti-Martingale',
          profitTaking: true,
          doublingCount
        }
      };
    }

    // STOP LOSS: Cut losers early (Anti-Martingale principle!)
    if (profitPct <= -martingaleParams.stopLossPercent) {
      this.resetPosition(tokenAddress);
      return {
        action: 'SELL',
        confidence: 0.9,
        reason: `Anti-Martingale: Stop loss triggered (-${Math.abs(profitPct).toFixed(1)}%) - cut losers early!`,
        metadata: {
          strategy: 'Anti-Martingale',
          stopLoss: true,
          doublingCount
        }
      };
    }

    return { 
      action: 'HOLD', 
      confidence: 0.5, 
      reason: profitPct > 0 
        ? `Anti-Martingale: Monitoring winning position (+${profitPct.toFixed(1)}%)`
        : `Anti-Martingale: Small loss, waiting for stop (-${Math.abs(profitPct).toFixed(1)}%)`
    };
  }

  private calculateQualityScore(metrics: TokenMetrics): number {
    let score = 0;
    
    // Liquidity score
    if (metrics.liquidity > 500000) score += 0.3;
    else if (metrics.liquidity > 100000) score += 0.2;
    else if (metrics.liquidity > 50000) score += 0.1;
    
    // Volume consistency
    const volumeRatio = metrics.volume1h / (metrics.volume24h / 24);
    if (volumeRatio > 0.5) score += 0.2;
    else if (volumeRatio > 0.2) score += 0.1;
    
    // Transaction activity
    if (metrics.txCount5m > 10) score += 0.2;
    else if (metrics.txCount5m > 5) score += 0.1;
    
    // Low rug score
    if (metrics.rugScore < 100) score += 0.3;
    else if (metrics.rugScore < 500) score += 0.1;
    
    return Math.min(score, 1.0);
  }

  private isTrendingUp(metrics: TokenMetrics): boolean {
    // Anti-Martingale enters on UPTREND (momentum), not dips
    return metrics.priceChange24h > 5 && metrics.priceChange24h < 50; // 5-50% gain
  }

  private isMomentumContinuing(metrics: TokenMetrics): boolean {
    // Check if momentum still strong for doubling
    return (
      metrics.liquidity > 50000 &&
      metrics.volume24h > 25000 &&
      metrics.txCount5m > 1 &&
      metrics.rugScore < 500 &&
      metrics.priceChange24h > 0 // Still positive momentum
    );
  }

  public resetPosition(tokenAddress: string): void {
    this.doublingCounts.delete(tokenAddress);
    this.originalInvestments.delete(tokenAddress);
  }
}