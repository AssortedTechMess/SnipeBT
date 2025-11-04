// Strategy Configuration Examples
// Default configurations for different strategy combinations

import { StrategyManagerConfig } from './strategyManager';

export const STRATEGY_CONFIGS = {
  // EmperorBTC Mode - Pure EmperorBTC Trading Manual principles
  emperorBTC: {
    decisionMode: 'conservative' as const,
    minConfidenceThreshold: 0.75, // LOWERED from 0.8 for more trades (still high quality)
    maxConcurrentStrategies: 1,
    strategies: {
      emperorBTC: {
        enabled: true,
        weight: 1.0,
        params: {
          maxRiskPerTrade: 0.03,
          minProfitThreshold: 0.10, // LOWERED to 10% (was 0.5%) for faster exits
          stopLossPercent: 7, // TIGHTENED to -7% (was -20%)
          takeProfitPercent: 12, // LOWERED to 12% (was 1.5%) for faster profit taking
          minLiquidityUSD: 50000, // INCREASED from 25k for better exit liquidity
          minVolume24hUSD: 25000, // INCREASED from 15k for active tokens
          maxRugScore: 600, // LOWERED from 500 for slightly more opportunities
          minTransactions5m: 8, // INCREASED from 5 for more active tokens
          maxConcurrentPositions: 8, // INCREASED from 5 for more diversification
          requireMultipleConfirmations: true,
          avoidPumpFun: true,
          profitTargetMultiplier: 3, // LOWERED from 4 for faster exits
          noAutoStop: false // CHANGED to false - enable auto stop-loss at -7%
        }
      },
      dca: {
        enabled: false,
        weight: 0.0,
        params: {}
      },
      martingale: {
        enabled: false,
        weight: 0.0,
        params: {}
      },
      trendReversal: {
        enabled: false,
        weight: 0.0,
        params: {}
      }
    }
  } as StrategyManagerConfig,

  // Conservative approach - emphasizes safety and risk management
  conservative: {
    decisionMode: 'conservative' as const,
    minConfidenceThreshold: 0.7,
    maxConcurrentStrategies: 2,
    strategies: {
      dca: {
        enabled: true,
        weight: 0.6,
        params: {
          maxPositions: 5,
          buyIntervalMinutes: 60,
          maxInvestmentPerToken: 0.005, // 0.005 SOL max
          incrementSize: 0.001, // 0.001 SOL per buy
          volumeThreshold: 100000,
          liquidityThreshold: 50000
        }
      },
      martingale: {
        enabled: false, // Disabled in conservative mode
        weight: 0.0,
        params: {}
      },
      trendReversal: {
        enabled: true,
        weight: 0.4,
        params: {
          rsiOversoldThreshold: 25, // More oversold
          rsiOverboughtThreshold: 75,
          volumeSpikeMultiplier: 3.0, // Higher volume requirement
          minLiquidityUSD: 100000,
          maxRugScore: 300,
          profitTargetPercent: 8,
          stopLossPercent: 5
        }
      }
    }
  } as StrategyManagerConfig,

  // Balanced approach - mix of all strategies with moderate risk
  balanced: {
    decisionMode: 'ensemble' as const,
    minConfidenceThreshold: 0.6,
    maxConcurrentStrategies: 3,
    strategies: {
      dca: {
        enabled: true,
        weight: 0.4,
        params: {
          maxPositions: 8,
          buyIntervalMinutes: 45,
          maxInvestmentPerToken: 0.008,
          incrementSize: 0.0015,
          volumeThreshold: 75000,
          liquidityThreshold: 35000
        }
      },
      martingale: {
        enabled: true,
        weight: 0.3,
        params: {
          maxDoublings: 2,
          maxLossThreshold: 20,
          minProfitTarget: 10,
          baseBetSize: 0.003,
          qualityThreshold: 0.6
        }
      },
      trendReversal: {
        enabled: true,
        weight: 0.3,
        params: {
          rsiOversoldThreshold: 30,
          rsiOverboughtThreshold: 70,
          volumeSpikeMultiplier: 2.5,
          minLiquidityUSD: 75000,
          maxRugScore: 500,
          profitTargetPercent: 12,
          stopLossPercent: 8
        }
      }
    }
  } as StrategyManagerConfig,

  // Aggressive approach - optimized for crypto with RVOL protection + Candlestick Analysis
  // OPTIMIZED FOR SMALL CAPITAL (< 1 SOL) - targets smaller liquidity pools
  aggressive: {
    decisionMode: 'best' as const,
    minConfidenceThreshold: 0.4, // 40% threshold with RVOL filtering protection
    maxConcurrentStrategies: 4,
    strategies: {
      candlestick: {
        enabled: true,
        weight: 0.3, // NEW: EmperorBTC candlestick pattern analysis
        params: {
          minWickRatio: 2.0, // Wick must be 2x body for pin bar signal
          minVolumeConfirmation: 1.5, // LOWERED to 1.5x RVOL (was 2.5x) - more opportunities for small capital
          minContextScore: 40, // LOWERED to 40% (was 50%) - allow more early entries
          minPatternConfidence: 60 // LOWERED to 60% (was 65%) - slightly more aggressive
        }
      },
      dca: {
        enabled: false, // DISABLED - DCA not ideal for fast memecoin profits
        weight: 0.0,
        params: {}
      },
      martingale: {
        enabled: true,
        weight: 0.40, // Increased weight - good for scaling winners
        params: {
          maxDoublings: 3, // Max 3 doublings on wins (8x final position)
          minWinThreshold: 2, // Double after 2% profit
          stopLossPercent: 7, // TIGHTER stop at -7% (was -8%)
          baseBetSize: 0.004,
          qualityThreshold: 0.4 // Lower threshold with RVOL 1.5x protection
        }
      },
      trendReversal: {
        enabled: true,
        weight: 0.30,
        params: {
          rsiOversoldThreshold: 30,
          rsiOverboughtThreshold: 70,
          volumeSpikeMultiplier: 1.5, // LOWERED to 1.5x (was 2.5x) - catch more early pumps
          minLiquidityUSD: 15000, // LOWERED to $15K (was $50K) - perfect for 0.15 SOL trades
          maxRugScore: 800, // Keep at 800 for safety
          profitTargetPercent: 12, // Keep at 12% for faster exits
          stopLossPercent: 7 // Keep tight at -7%
        }
      }
    }
  } as StrategyManagerConfig,

  // DCA-only approach - pure accumulation strategy
  dcaOnly: {
    decisionMode: 'consensus' as const,
    minConfidenceThreshold: 0.5,
    maxConcurrentStrategies: 1,
    strategies: {
      dca: {
        enabled: true,
        weight: 1.0,
        params: {
          maxPositions: 15,
          buyIntervalMinutes: 20,
          maxInvestmentPerToken: 0.015,
          incrementSize: 0.001,
          volumeThreshold: 25000,
          liquidityThreshold: 15000
        }
      },
      martingale: {
        enabled: false,
        weight: 0.0,
        params: {}
      },
      trendReversal: {
        enabled: false,
        weight: 0.0,
        params: {}
      }
    }
  } as StrategyManagerConfig,

  // Scalping approach - quick in/out with trend reversal focus
  scalping: {
    decisionMode: 'ensemble' as const,
    minConfidenceThreshold: 0.65,
    maxConcurrentStrategies: 2,
    strategies: {
      dca: {
        enabled: false,
        weight: 0.0,
        params: {}
      },
      martingale: {
        enabled: true,
        weight: 0.3,
        params: {
          maxDoublings: 1, // Quick exit
          maxLossThreshold: 15,
          minProfitTarget: 6,
          baseBetSize: 0.005,
          qualityThreshold: 0.7
        }
      },
      trendReversal: {
        enabled: true,
        weight: 0.7,
        params: {
          rsiOversoldThreshold: 28,
          rsiOverboughtThreshold: 72,
          volumeSpikeMultiplier: 2.5,
          minLiquidityUSD: 80000,
          maxRugScore: 400,
          profitTargetPercent: 8, // Quick profits
          stopLossPercent: 6
        }
      }
    }
  } as StrategyManagerConfig
};

export function getStrategyConfig(mode: keyof typeof STRATEGY_CONFIGS): StrategyManagerConfig {
  return STRATEGY_CONFIGS[mode];
}

export function createCustomConfig(
  baseMode: keyof typeof STRATEGY_CONFIGS,
  overrides: Partial<StrategyManagerConfig>
): StrategyManagerConfig {
  const baseConfig = STRATEGY_CONFIGS[baseMode];
  return {
    ...baseConfig,
    ...overrides,
    strategies: {
      ...baseConfig.strategies,
      ...overrides.strategies
    }
  };
}