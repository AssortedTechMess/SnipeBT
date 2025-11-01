// Strategy Manager - Coordinates multiple trading strategies
// Combines signals from different strategies to make final trading decisions

import { BaseStrategy, MarketSignal, TokenMetrics, PositionInfo, StrategyConfig } from './baseStrategy';
import { DCAStrategy } from './dcaStrategy';
import { MartingaleStrategy } from './martingaleStrategy';
import { TrendReversalStrategy } from './trendReversalStrategy';
import { EmperorBTCStrategy } from './emperorBTCStrategy';

export interface EnsembleDecision {
  finalAction: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reason: string;
  amount?: number;
  strategyBreakdown: {
    strategy: string;
    signal: MarketSignal;
    weight: number;
  }[];
  metadata: Record<string, any>;
}

export interface StrategyManagerConfig {
  decisionMode: 'ensemble' | 'consensus' | 'best' | 'conservative';
  minConfidenceThreshold: number;
  maxConcurrentStrategies: number;
  strategies: {
    emperorBTC?: StrategyConfig;
    dca: StrategyConfig;
    martingale: StrategyConfig;
    trendReversal: StrategyConfig;
  };
}

export class StrategyManager {
  private strategies: Map<string, BaseStrategy> = new Map();
  private config: StrategyManagerConfig;

  constructor(config: StrategyManagerConfig) {
    this.config = config;
    this.initializeStrategies();
  }

  private initializeStrategies(): void {
    // Initialize strategies based on config
    if (this.config.strategies.emperorBTC?.enabled) {
      this.strategies.set('emperorBTC', new EmperorBTCStrategy(this.config.strategies.emperorBTC));
    }
    
    if (this.config.strategies.dca.enabled) {
      this.strategies.set('dca', new DCAStrategy(this.config.strategies.dca));
    }
    
    if (this.config.strategies.martingale.enabled) {
      this.strategies.set('martingale', new MartingaleStrategy(this.config.strategies.martingale));
    }
    
    if (this.config.strategies.trendReversal.enabled) {
      this.strategies.set('trendReversal', new TrendReversalStrategy(this.config.strategies.trendReversal));
    }
  }

  public async analyzeToken(
    tokenAddress: string,
    metrics: TokenMetrics,
    existingPosition?: PositionInfo
  ): Promise<EnsembleDecision> {
    const signals: Array<{ strategy: string; signal: MarketSignal; weight: number }> = [];

    // Collect signals from all enabled strategies
    for (const [name, strategy] of this.strategies) {
      if (strategy.isEnabled()) {
        try {
          const signal = await strategy.analyze(tokenAddress, metrics, existingPosition);
          signals.push({
            strategy: name,
            signal,
            weight: strategy.getWeight()
          });
        } catch (error) {
          console.error(`Strategy ${name} analysis failed:`, error);
        }
      }
    }

    if (signals.length === 0) {
      return {
        finalAction: 'HOLD',
        confidence: 0,
        reason: 'No strategies enabled or all failed',
        strategyBreakdown: [],
        metadata: { error: 'No strategy signals' }
      };
    }

    // Make ensemble decision based on configured mode
    return this.makeEnsembleDecision(signals, tokenAddress, metrics);
  }

  private makeEnsembleDecision(
    signals: Array<{ strategy: string; signal: MarketSignal; weight: number }>,
    tokenAddress: string,
    metrics: TokenMetrics
  ): EnsembleDecision {
    switch (this.config.decisionMode) {
      case 'ensemble':
        return this.ensembleVoting(signals, tokenAddress, metrics);
      case 'consensus':
        return this.consensusDecision(signals, tokenAddress, metrics);
      case 'best':
        return this.bestStrategyDecision(signals, tokenAddress, metrics);
      case 'conservative':
        return this.conservativeDecision(signals, tokenAddress, metrics);
      default:
        return this.ensembleVoting(signals, tokenAddress, metrics);
    }
  }

  private ensembleVoting(
    signals: Array<{ strategy: string; signal: MarketSignal; weight: number }>,
    tokenAddress: string,
    metrics: TokenMetrics
  ): EnsembleDecision {
    let buyScore = 0;
    let sellScore = 0;
    let holdScore = 0;
    let totalWeight = 0;
    let weightedAmount = 0;
    let reasons: string[] = [];

    for (const { strategy, signal, weight } of signals) {
      const weightedConfidence = signal.confidence * weight;
      totalWeight += weight;

      switch (signal.action) {
        case 'BUY':
          buyScore += weightedConfidence;
          if (signal.amount) weightedAmount += signal.amount * weight;
          break;
        case 'SELL':
          sellScore += weightedConfidence;
          if (signal.amount) weightedAmount += signal.amount * weight;
          break;
        case 'HOLD':
          holdScore += weightedConfidence;
          break;
      }

      reasons.push(`${strategy}: ${signal.reason}`);
    }

    // Normalize scores
    if (totalWeight > 0) {
      buyScore /= totalWeight;
      sellScore /= totalWeight;
      holdScore /= totalWeight;
      weightedAmount /= totalWeight;
    }

    // Determine final action
    let finalAction: 'BUY' | 'SELL' | 'HOLD';
    let confidence: number;

    if (buyScore > sellScore && buyScore > holdScore) {
      finalAction = 'BUY';
      confidence = buyScore;
    } else if (sellScore > buyScore && sellScore > holdScore) {
      finalAction = 'SELL';
      confidence = sellScore;
    } else {
      finalAction = 'HOLD';
      confidence = holdScore;
    }

    // Apply minimum confidence threshold
    if (confidence < this.config.minConfidenceThreshold) {
      finalAction = 'HOLD';
      confidence = 0.3;
      reasons.push(`Below confidence threshold (${this.config.minConfidenceThreshold})`);
    }

    return {
      finalAction,
      confidence,
      reason: `Ensemble: ${reasons.join(' | ')}`,
      amount: weightedAmount > 0 ? weightedAmount : undefined,
      strategyBreakdown: signals,
      metadata: {
        decisionMode: 'ensemble',
        scores: { buy: buyScore, sell: sellScore, hold: holdScore },
        totalWeight,
        tokenAddress,
        rugScore: metrics.rugScore
      }
    };
  }

  private consensusDecision(
    signals: Array<{ strategy: string; signal: MarketSignal; weight: number }>,
    tokenAddress: string,
    _metrics: TokenMetrics
  ): EnsembleDecision {
    const actions = signals.map(s => s.signal.action);
    const uniqueActions = [...new Set(actions)];

    // If all strategies agree
    if (uniqueActions.length === 1) {
      const action = uniqueActions[0];
      const avgConfidence = signals.reduce((sum, s) => sum + s.signal.confidence, 0) / signals.length;
      const reasons = signals.map(s => `${s.strategy}: ${s.signal.reason}`);

      return {
        finalAction: action,
        confidence: Math.min(avgConfidence * 1.2, 1.0), // Boost confidence for consensus
        reason: `Consensus (${action}): ${reasons.join(' | ')}`,
        strategyBreakdown: signals,
        metadata: {
          decisionMode: 'consensus',
          unanimous: true,
          tokenAddress
        }
      };
    }

    // No consensus - be conservative
    return {
      finalAction: 'HOLD',
      confidence: 0.4,
      reason: `No consensus: ${actions.join(', ')}`,
      strategyBreakdown: signals,
      metadata: {
        decisionMode: 'consensus',
        unanimous: false,
        conflictingActions: uniqueActions,
        tokenAddress
      }
    };
  }

  private bestStrategyDecision(
    signals: Array<{ strategy: string; signal: MarketSignal; weight: number }>,
    tokenAddress: string,
    _metrics: TokenMetrics
  ): EnsembleDecision {
    // Find the signal with highest confidence
    const bestSignal = signals.reduce((best, current) => 
      current.signal.confidence > best.signal.confidence ? current : best
    );

    return {
      finalAction: bestSignal.signal.action,
      confidence: bestSignal.signal.confidence,
      reason: `Best strategy (${bestSignal.strategy}): ${bestSignal.signal.reason}`,
      amount: bestSignal.signal.amount,
      strategyBreakdown: signals,
      metadata: {
        decisionMode: 'best',
        winningStrategy: bestSignal.strategy,
        tokenAddress
      }
    };
  }

  private conservativeDecision(
    signals: Array<{ strategy: string; signal: MarketSignal; weight: number }>,
    tokenAddress: string,
    _metrics: TokenMetrics
  ): EnsembleDecision {
    const buySignals = signals.filter(s => s.signal.action === 'BUY');
    const sellSignals = signals.filter(s => s.signal.action === 'SELL');

    // Conservative approach: require high confidence and multiple strategy agreement
    if (buySignals.length >= 2 && buySignals.every(s => s.signal.confidence > 0.7)) {
      const avgConfidence = buySignals.reduce((sum, s) => sum + s.signal.confidence, 0) / buySignals.length;
      return {
        finalAction: 'BUY',
        confidence: avgConfidence * 0.8, // Reduce confidence for conservative approach
        reason: `Conservative BUY: ${buySignals.length} high-confidence strategies agree`,
        strategyBreakdown: signals,
        metadata: {
          decisionMode: 'conservative',
          agreeingStrategies: buySignals.length,
          tokenAddress
        }
      };
    }

    if (sellSignals.length >= 1 && sellSignals.some(s => s.signal.confidence > 0.8)) {
      return {
        finalAction: 'SELL',
        confidence: 0.9,
        reason: 'Conservative SELL: High-confidence exit signal',
        strategyBreakdown: signals,
        metadata: {
          decisionMode: 'conservative',
          tokenAddress
        }
      };
    }

    return {
      finalAction: 'HOLD',
      confidence: 0.6,
      reason: 'Conservative HOLD: Insufficient agreement or confidence',
      strategyBreakdown: signals,
      metadata: {
        decisionMode: 'conservative',
        tokenAddress
      }
    };
  }

  public updateConfig(newConfig: Partial<StrategyManagerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.initializeStrategies(); // Reinitialize strategies with new config
  }

  public getActiveStrategies(): string[] {
    return Array.from(this.strategies.keys()).filter(name => 
      this.strategies.get(name)?.isEnabled()
    );
  }

  public getStrategySignalHistory(_tokenAddress: string): any {
    // Could implement signal history tracking here
    return {};
  }
}