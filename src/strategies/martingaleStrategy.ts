// Martingale Strategy
// Doubles down on losing positions (HIGH RISK - use with strict limits)

import { BaseStrategy, MarketSignal, TokenMetrics, PositionInfo, StrategyConfig } from './baseStrategy';

interface MartingaleConfig {
  maxDoublings: number;
  maxLossThreshold: number; // Max loss % before stopping
  minProfitTarget: number;
  baseBetSize: number;
  qualityThreshold: number; // Only apply to high-quality tokens
}

export class MartingaleStrategy extends BaseStrategy {
  private doublingCounts: Map<string, number> = new Map();
  private originalInvestments: Map<string, number> = new Map();

  constructor(config: StrategyConfig) {
    super('Martingale', config);
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
      maxDoublings: 2, // Conservative: only double down twice max
      maxLossThreshold: 25, // Stop at 25% loss
      minProfitTarget: 8, // Target 8% profit
      baseBetSize: 0.003, // 0.003 SOL base bet
      qualityThreshold: 0.7, // Only apply to high-quality tokens
      ...this.config.params
    };

    const riskScore = this.calculateRiskScore(metrics);
    const qualityScore = this.calculateQualityScore(metrics);
    const doublingCount = this.doublingCounts.get(tokenAddress) || 0;

    // Only apply martingale to high-quality tokens
    if (qualityScore < martingaleParams.qualityThreshold) {
      return { 
        action: 'HOLD', 
        confidence: 0.3, 
        reason: 'Martingale: Token quality too low for strategy' 
      };
    }

    // Initial entry conditions
    if (!existingPosition) {
      if (
        metrics.liquidity > 100000 &&
        metrics.volume24h > 100000 &&
        riskScore < 0.3 &&
        this.isTrendingDown(metrics) // Enter when price is declining
      ) {
        this.originalInvestments.set(tokenAddress, martingaleParams.baseBetSize);
        this.doublingCounts.set(tokenAddress, 0);

        return {
          action: 'BUY',
          confidence: 0.7,
          reason: 'Martingale: Initial entry on quality dip',
          amount: martingaleParams.baseBetSize,
          metadata: {
            strategy: 'Martingale',
            doublingCount: 0,
            originalInvestment: martingaleParams.baseBetSize
          }
        };
      }
      return { action: 'HOLD', confidence: 0.4, reason: 'Martingale: Waiting for entry opportunity' };
    }

    // Existing position logic
    const lossPct = -existingPosition.pnlPercent;

    // Take profits
    if (existingPosition.pnlPercent >= martingaleParams.minProfitTarget) {
      this.resetPosition(tokenAddress);
      return {
        action: 'SELL',
        confidence: 0.8,
        reason: `Martingale: Profit target reached (+${existingPosition.pnlPercent.toFixed(1)}%)`,
        metadata: {
          strategy: 'Martingale',
          profitTaking: true,
          doublingCount
        }
      };
    }

    // Stop loss
    if (lossPct >= martingaleParams.maxLossThreshold) {
      this.resetPosition(tokenAddress);
      return {
        action: 'SELL',
        confidence: 0.9,
        reason: `Martingale: Stop loss triggered (-${lossPct.toFixed(1)}%)`,
        metadata: {
          strategy: 'Martingale',
          stopLoss: true,
          doublingCount
        }
      };
    }

    // Double down conditions
    if (
      doublingCount < martingaleParams.maxDoublings &&
      lossPct >= 5 + (doublingCount * 5) && // -5%, -10%, -15% thresholds
      this.isGoodDoubleDownOpportunity(metrics)
    ) {
      const doubleAmount = martingaleParams.baseBetSize * Math.pow(2, doublingCount + 1);
      this.doublingCounts.set(tokenAddress, doublingCount + 1);

      return {
        action: 'BUY',
        confidence: 0.6 - (doublingCount * 0.15), // Lower confidence with each doubling
        reason: `Martingale: Doubling down #${doublingCount + 1} at -${lossPct.toFixed(1)}%`,
        amount: doubleAmount,
        metadata: {
          strategy: 'Martingale',
          doublingCount: doublingCount + 1,
          totalLoss: lossPct
        }
      };
    }

    return { 
      action: 'HOLD', 
      confidence: 0.5, 
      reason: `Martingale: Monitoring position (-${lossPct.toFixed(1)}%)` 
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

  private isTrendingDown(metrics: TokenMetrics): boolean {
    return metrics.priceChange24h < -2 && metrics.priceChange24h > -15;
  }

  private isGoodDoubleDownOpportunity(metrics: TokenMetrics): boolean {
    // Only double down if token maintains good fundamentals
    return (
      metrics.liquidity > 50000 &&
      metrics.volume24h > 25000 &&
      metrics.txCount5m > 1 &&
      metrics.rugScore < 500
    );
  }

  public resetPosition(tokenAddress: string): void {
    this.doublingCounts.delete(tokenAddress);
    this.originalInvestments.delete(tokenAddress);
  }
}