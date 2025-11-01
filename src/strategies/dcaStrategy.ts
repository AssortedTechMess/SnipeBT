// DCA (Dollar Cost Averaging) Strategy
// Gradually accumulates positions in promising tokens over time

import { BaseStrategy, MarketSignal, TokenMetrics, PositionInfo, StrategyConfig } from './baseStrategy';

interface DCAConfig {
  maxPositions: number;
  buyIntervalMinutes: number;
  maxInvestmentPerToken: number;
  incrementSize: number;
  volumeThreshold: number;
  liquidityThreshold: number;
}

export class DCAStrategy extends BaseStrategy {
  private lastBuyTimes: Map<string, number> = new Map();
  private positionSizes: Map<string, number> = new Map();

  constructor(config: StrategyConfig) {
    super('DCA', config);
  }

  async analyze(
    tokenAddress: string,
    metrics: TokenMetrics,
    existingPosition?: PositionInfo
  ): Promise<MarketSignal> {
    if (!this.validateMetrics(metrics)) {
      return { action: 'HOLD', confidence: 0, reason: 'Invalid metrics' };
    }

    const dcaParams: DCAConfig = {
      maxPositions: 10,
      buyIntervalMinutes: 30,
      maxInvestmentPerToken: 0.01, // 0.01 SOL max per token
      incrementSize: 0.002, // 0.002 SOL per buy
      volumeThreshold: 50000,
      liquidityThreshold: 25000,
      ...this.config.params
    };

    const riskScore = this.calculateRiskScore(metrics);
    const lastBuyTime = this.lastBuyTimes.get(tokenAddress) || 0;
    const timeSinceLastBuy = (Date.now() - lastBuyTime) / (1000 * 60); // minutes
    const currentPosition = this.positionSizes.get(tokenAddress) || 0;

    // DCA buy conditions
    if (
      metrics.liquidity >= dcaParams.liquidityThreshold &&
      metrics.volume24h >= dcaParams.volumeThreshold &&
      riskScore < 0.5 &&
      timeSinceLastBuy >= dcaParams.buyIntervalMinutes &&
      currentPosition < dcaParams.maxInvestmentPerToken
    ) {
      // Look for stable or slightly declining prices (good for accumulation)
      if (metrics.priceChange24h >= -10 && metrics.priceChange24h <= 5) {
        this.lastBuyTimes.set(tokenAddress, Date.now());
        this.positionSizes.set(tokenAddress, currentPosition + dcaParams.incrementSize);

        return {
          action: 'BUY',
          confidence: Math.max(0.3, 0.8 - riskScore),
          reason: `DCA: Accumulating position (${(currentPosition * 1000).toFixed(1)}/${(dcaParams.maxInvestmentPerToken * 1000).toFixed(1)}mSOL)`,
          amount: dcaParams.incrementSize,
          metadata: {
            strategy: 'DCA',
            riskScore,
            positionProgress: currentPosition / dcaParams.maxInvestmentPerToken
          }
        };
      }
    }

    // DCA sell conditions (take profits gradually)
    if (existingPosition && existingPosition.pnlPercent > 15) {
      const sellSize = existingPosition.amount * 0.25; // Sell 25% of position
      
      return {
        action: 'SELL',
        confidence: 0.6,
        reason: `DCA: Taking partial profits (+${existingPosition.pnlPercent.toFixed(1)}%)`,
        amount: sellSize,
        metadata: {
          strategy: 'DCA',
          profitTaking: true,
          sellPercentage: 25
        }
      };
    }

    return { 
      action: 'HOLD', 
      confidence: 0.5, 
      reason: 'DCA: Waiting for optimal accumulation conditions'
    };
  }

  // Reset position tracking (call when position is fully closed)
  public resetPosition(tokenAddress: string): void {
    this.positionSizes.delete(tokenAddress);
    this.lastBuyTimes.delete(tokenAddress);
  }
}