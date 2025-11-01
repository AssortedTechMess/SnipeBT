// EmperorBTC Trading Strategy - Conservative Risk Management
// Based on EmperorBTC Trading Manual principles: Quality over quantity, capital preservation

import { BaseStrategy, MarketSignal, TokenMetrics, PositionInfo, StrategyConfig } from './baseStrategy';

interface EmperorBTCConfig {
  // Core Principles
  maxRiskPerTrade: number; // 3% max per trade (EmperorBTC standard)
  minProfitThreshold: number; // 0.5% minimum profit to consider
  stopLossPercent: number; // 20% stop-loss
  takeProfitPercent: number; // 1.5% take-profit
  
  // Quality Filters (strict)
  minLiquidityUSD: number;
  minVolume24hUSD: number;
  maxRugScore: number;
  minTransactions5m: number;
  
  // Risk Management
  maxConcurrentPositions: number;
  requireMultipleConfirmations: boolean;
  avoidPumpFun: boolean; // Avoid pump.fun tokens (high risk)
  
  // Session Management
  profitTargetMultiplier: number; // 4x target
  noAutoStop: boolean; // Continue running toward target
}

export class EmperorBTCStrategy extends BaseStrategy {
  private sessionBaseline: number = 0;
  private sessionProfitTarget: number = 0;
  private currentPositions: number = 0;
  private positionEntries: Map<string, { time: number; price: number; size: number }> = new Map();

  constructor(config: StrategyConfig) {
    super('EmperorBTC', config);
  }

  public setSessionBaseline(baseline: number, multiplier: number = 4): void {
    this.sessionBaseline = baseline;
    this.sessionProfitTarget = baseline * multiplier;
    console.log(`📊 EmperorBTC Session: ${baseline} SOL → ${this.sessionProfitTarget} SOL (${multiplier}x)`);
  }

  async analyze(
    tokenAddress: string,
    metrics: TokenMetrics,
    existingPosition?: PositionInfo
  ): Promise<MarketSignal> {
    if (!this.validateMetrics(metrics)) {
      return { action: 'HOLD', confidence: 0, reason: 'EmperorBTC: Invalid metrics' };
    }

    const emperorParams: EmperorBTCConfig = {
      maxRiskPerTrade: 0.03, // 3%
      minProfitThreshold: 0.005, // 0.5%
      stopLossPercent: 20,
      takeProfitPercent: 1.5,
      minLiquidityUSD: 50000,
      minVolume24hUSD: 25000,
      maxRugScore: 100, // Very strict
      minTransactions5m: 5,
      maxConcurrentPositions: 5,
      requireMultipleConfirmations: true,
      avoidPumpFun: true,
      profitTargetMultiplier: 4,
      noAutoStop: true,
      ...this.config.params
    };

    // Existing position management (sell signals)
    if (existingPosition) {
      return this.manageExistingPosition(existingPosition, metrics, emperorParams, tokenAddress);
    }

    // New entry evaluation
    return this.evaluateEntry(tokenAddress, metrics, emperorParams);
  }

  private async evaluateEntry(
    tokenAddress: string,
    metrics: TokenMetrics,
    params: EmperorBTCConfig
  ): Promise<MarketSignal> {
    // EmperorBTC Principle 1: QUALITY OVER QUANTITY
    // Only enter high-quality tokens that pass ALL filters
    
    const qualityChecks = {
      liquidity: metrics.liquidity >= params.minLiquidityUSD,
      volume: metrics.volume24h >= params.minVolume24hUSD,
      rugScore: metrics.rugScore <= params.maxRugScore,
      transactions: metrics.txCount5m >= params.minTransactions5m,
      pumpFun: params.avoidPumpFun ? !this.isPumpFunToken(metrics) : true,
      priceStability: Math.abs(metrics.priceChange24h) <= 80, // Avoid extreme volatility
      volumeConsistency: this.hasConsistentVolume(metrics),
      positionLimit: this.currentPositions < params.maxConcurrentPositions
    };

    const failedChecks = Object.entries(qualityChecks)
      .filter(([_, passed]) => !passed)
      .map(([check]) => check);

    if (failedChecks.length > 0) {
      return {
        action: 'HOLD',
        confidence: 0.2,
        reason: `EmperorBTC: Failed quality checks [${failedChecks.join(', ')}]`,
        metadata: {
          strategy: 'EmperorBTC',
          failedChecks,
          qualityScore: this.calculateQualityScore(qualityChecks)
        }
      };
    }

    // EmperorBTC Principle 2: MULTIPLE CONFIRMATIONS
    if (params.requireMultipleConfirmations) {
      const confirmations = this.getEntryConfirmations(metrics);
      if (confirmations.count < 2) {
        return {
          action: 'HOLD',
          confidence: 0.4,
          reason: `EmperorBTC: Insufficient confirmations (${confirmations.count}/3)`,
          metadata: {
            strategy: 'EmperorBTC',
            confirmations: confirmations.signals
          }
        };
      }
    }

    // EmperorBTC Principle 3: CALCULATED RISK
    const riskScore = this.calculateRiskScore(metrics);
    if (riskScore > 0.3) {
      return {
        action: 'HOLD',
        confidence: 0.3,
        reason: `EmperorBTC: Risk score too high (${(riskScore * 100).toFixed(1)}%)`,
        metadata: {
          strategy: 'EmperorBTC',
          riskScore
        }
      };
    }

    // All checks passed - ENTER POSITION
    this.currentPositions++;
    this.positionEntries.set(tokenAddress, {
      time: Date.now(),
      price: metrics.price,
      size: params.maxRiskPerTrade
    });

    return {
      action: 'BUY',
      confidence: 0.85, // High confidence when all checks pass
      reason: 'EmperorBTC: Quality token passed all filters (conservative entry)',
      amount: params.maxRiskPerTrade,
      metadata: {
        strategy: 'EmperorBTC',
        riskScore,
        qualityScore: 1.0,
        confirmations: this.getEntryConfirmations(metrics).count,
        sessionProgress: this.sessionBaseline > 0 
          ? `${((this.sessionBaseline / this.sessionProfitTarget) * 100).toFixed(1)}%`
          : 'N/A'
      }
    };
  }

  private manageExistingPosition(
    position: PositionInfo,
    metrics: TokenMetrics,
    params: EmperorBTCConfig,
    tokenAddress: string
  ): MarketSignal {
    const pnl = position.pnlPercent;

    // EmperorBTC Principle 4: PROTECT CAPITAL (Stop-Loss)
    if (pnl <= -params.stopLossPercent) {
      this.currentPositions--;
      this.positionEntries.delete(tokenAddress);
      
      return {
        action: 'SELL',
        confidence: 0.95,
        reason: `EmperorBTC: Stop-loss triggered (-${Math.abs(pnl).toFixed(1)}%, protecting capital)`,
        metadata: {
          strategy: 'EmperorBTC',
          stopLoss: true,
          pnl
        }
      };
    }

    // EmperorBTC Principle 5: SECURE PROFITS (Take-Profit)
    if (pnl >= params.takeProfitPercent) {
      this.currentPositions--;
      this.positionEntries.delete(tokenAddress);
      
      return {
        action: 'SELL',
        confidence: 0.9,
        reason: `EmperorBTC: Take-profit target reached (+${pnl.toFixed(1)}%, securing gains)`,
        metadata: {
          strategy: 'EmperorBTC',
          takeProfit: true,
          pnl,
          profitSecured: true
        }
      };
    }

    // EmperorBTC Principle 6: TRAILING PROFITS
    // If position is profitable but hasn't hit TP, check for deteriorating conditions
    if (pnl > 0.5) {
      const deteriorating = this.isPositionDeteriorating(metrics, position);
      if (deteriorating) {
        this.currentPositions--;
        this.positionEntries.delete(tokenAddress);
        
        return {
          action: 'SELL',
          confidence: 0.75,
          reason: `EmperorBTC: Conditions deteriorating, securing profit (+${pnl.toFixed(1)}%)`,
          metadata: {
            strategy: 'EmperorBTC',
            trailingExit: true,
            pnl
          }
        };
      }
    }

    // EmperorBTC Principle 7: TIME-BASED EXIT
    // If position is old and not moving, exit to free up capital
    if (position.ageMinutes > 180 && pnl < 0.3) {
      this.currentPositions--;
      this.positionEntries.delete(tokenAddress);
      
      return {
        action: 'SELL',
        confidence: 0.7,
        reason: `EmperorBTC: Time exit (${position.ageMinutes}min, +${pnl.toFixed(1)}%, freeing capital)`,
        metadata: {
          strategy: 'EmperorBTC',
          timeExit: true,
          ageMinutes: position.ageMinutes,
          pnl
        }
      };
    }

    return {
      action: 'HOLD',
      confidence: 0.6,
      reason: `EmperorBTC: Monitoring position (+${pnl.toFixed(1)}%, ${position.ageMinutes}min)`,
      metadata: {
        strategy: 'EmperorBTC',
        pnl,
        ageMinutes: position.ageMinutes
      }
    };
  }

  // Helper methods
  private isPumpFunToken(metrics: TokenMetrics): boolean {
    // Check if token is from pump.fun or similar high-risk DEXes
    return metrics.dexId?.toLowerCase().includes('pump') || false;
  }

  private hasConsistentVolume(metrics: TokenMetrics): boolean {
    // Volume should be reasonably consistent (1h vs 24h average)
    const avgVolumePerHour = metrics.volume24h / 24;
    const volumeRatio = metrics.volume1h / Math.max(avgVolumePerHour, 1);
    
    // Ratio should be between 0.2x and 5x (not too dead, not too spiky)
    return volumeRatio >= 0.2 && volumeRatio <= 5.0;
  }

  private getEntryConfirmations(metrics: TokenMetrics): { count: number; signals: string[] } {
    const signals: string[] = [];

    // Confirmation 1: Strong liquidity
    if (metrics.liquidity > 100000) {
      signals.push('High liquidity');
    }

    // Confirmation 2: Active trading
    if (metrics.txCount5m > 10 || metrics.volume1h > 50000) {
      signals.push('Active trading');
    }

    // Confirmation 3: Low risk
    if (metrics.rugScore < 50) {
      signals.push('Low rug risk');
    }

    // Confirmation 4: Price momentum (RSI if available)
    if (metrics.rsi && metrics.rsi < 40 && metrics.rsi > 20) {
      signals.push('Oversold RSI');
    }

    // Confirmation 5: Volume spike
    if (this.hasVolumespike(metrics)) {
      signals.push('Volume spike');
    }

    return { count: signals.length, signals };
  }

  private hasVolumespike(metrics: TokenMetrics): boolean {
    const avgVolumePerHour = metrics.volume24h / 24;
    return metrics.volume1h > avgVolumePerHour * 2;
  }

  private isPositionDeteriorating(metrics: TokenMetrics, _position: PositionInfo): boolean {
    // Position is deteriorating if:
    // 1. Volume dropping significantly
    const volumeRatio = metrics.volume1h / (metrics.volume24h / 24);
    if (volumeRatio < 0.3) return true;

    // 2. Rug score increasing (if we tracked entry rug score)
    if (metrics.rugScore > 500) return true;

    // 3. Liquidity dropping
    if (metrics.liquidity < 25000) return true;

    return false;
  }

  private calculateQualityScore(checks: Record<string, boolean>): number {
    const passed = Object.values(checks).filter(v => v).length;
    const total = Object.values(checks).length;
    return passed / total;
  }

  public getSessionProgress(): { baseline: number; current: number; target: number; progress: number } | null {
    if (this.sessionBaseline === 0) return null;
    
    return {
      baseline: this.sessionBaseline,
      current: this.sessionBaseline, // Would need actual balance update
      target: this.sessionProfitTarget,
      progress: (this.sessionBaseline / this.sessionProfitTarget) * 100
    };
  }

  public resetPosition(tokenAddress: string): void {
    this.positionEntries.delete(tokenAddress);
    if (this.currentPositions > 0) this.currentPositions--;
  }
}