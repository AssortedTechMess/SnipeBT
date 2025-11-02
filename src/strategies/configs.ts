// Strategy Configuration Examples
// Default configurations for different strategy combinations

import { StrategyManagerConfig } from './strategyManager';

export const STRATEGY_CONFIGS = {
  // EmperorBTC Mode - Pure EmperorBTC Trading Manual principles
  emperorBTC: {
    decisionMode: 'conservative' as const,
    minConfidenceThreshold: 0.8, // Very high threshold
    maxConcurrentStrategies: 1,
    strategies: {
      emperorBTC: {
        enabled: true,
        weight: 1.0,
        params: {
          maxRiskPerTrade: 0.03,
          minProfitThreshold: 0.005,
          stopLossPercent: 20,
          takeProfitPercent: 1.5,
          minLiquidityUSD: 25000, // Lowered from 50k for more opportunities
          minVolume24hUSD: 15000, // Lowered from 25k
          maxRugScore: 500, // Raised from 100 for more opportunities
          minTransactions5m: 5,
          maxConcurrentPositions: 5,
          requireMultipleConfirmations: true,
          avoidPumpFun: true,
          profitTargetMultiplier: 4,
          noAutoStop: true
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

  // Aggressive approach - higher risk/reward with all strategies active
  aggressive: {
    decisionMode: 'best' as const,
    minConfidenceThreshold: 0.5,
    maxConcurrentStrategies: 3,
    strategies: {
      dca: {
        enabled: true,
        weight: 0.3,
        params: {
          maxPositions: 12,
          buyIntervalMinutes: 30,
          maxInvestmentPerToken: 0.015, // Increased from 0.012
          incrementSize: 0.002,
          volumeThreshold: 30000, // Lowered from 50k
          liquidityThreshold: 15000 // Lowered from 25k
        }
      },
      martingale: {
        enabled: true,
        weight: 0.4,
        params: {
          maxDoublings: 3,
          maxLossThreshold: 30,
          minProfitTarget: 15,
          baseBetSize: 0.004,
          qualityThreshold: 0.5
        }
      },
      trendReversal: {
        enabled: true,
        weight: 0.3,
        params: {
          rsiOversoldThreshold: 35,
          rsiOverboughtThreshold: 65,
          volumeSpikeMultiplier: 2.0,
          minLiquidityUSD: 25000, // Lowered from 50k
          maxRugScore: 1000, // Raised from 750 for aggressive mode
          profitTargetPercent: 18,
          stopLossPercent: 12
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