/**
 * AI Adaptive Learning System V2 - Enhanced with Reinforcement Learning
 * 
 * Key improvements over V1:
 * 1. Temporal Difference (TD) Learning - weights recent outcomes higher
 * 2. Epsilon-Greedy Exploration - balances exploitation vs exploration
 * 3. Q-Learning inspired action-value tracking per market state
 * 4. Exponential Moving Averages instead of simple averages
 * 5. Regret tracking to measure opportunity cost
 * 6. Multi-Armed Bandit for strategy selection
 */

import * as fs from 'fs';

interface TradeOutcome {
  tokenAddress: string;
  symbol: string;
  timestamp: number;
  entryPrice: number;
  exitPrice: number;
  profit: number;
  profitPercent: number;
  holdTime: number; // minutes
  volume24h: number;
  liquidity: number;
  priceChange24h: number;
  rvol: number;
  candlestickPattern?: string;
  marketRegime: string;
  aiConfidence: number;
  signals: {
    candlestick?: number;
    martingale?: number;
    trendReversal?: number;
    dca?: number;
  };
}

interface PatternStats {
  pattern: string;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  avgProfit: number;
  avgLoss: number;
  avgHoldTime: number;
  
  // RL Enhancements
  qValue: number; // Q-Learning: Expected cumulative reward
  explorationCount: number; // How many times explored recently
  lastExploredTimestamp: number;
  emaWinRate: number; // Exponential Moving Average of win rate
  emaProfit: number; // EMA of profit
  confidence: number;
  regret: number; // Cumulative regret vs best alternative
  
  bestTimeOfDay?: number;
  lastSeen: number;
}

interface MarketState {
  regime: string; // BULL, BEAR, SIDEWAYS
  rvolBucket: string; // LOW (1-2x), MEDIUM (2-5x), HIGH (5x+)
  liquidityBucket: string; // LOW (<100K), MEDIUM (100K-500K), HIGH (500K+)
}

interface StateActionValue {
  state: MarketState;
  action: string; // pattern name
  qValue: number;
  visits: number;
  lastReward: number;
  emaReward: number;
}

interface MarketConditionStats {
  regime: string;
  totalTrades: number;
  wins: number;
  winRate: number;
  avgProfit: number;
  preferredPatterns: string[];
  optimalRvol: { min: number; max: number };
  optimalLiquidity: { min: number; max: number };
}

interface AdaptiveInsights {
  hotPatterns: PatternStats[];
  coldPatterns: PatternStats[];
  currentRegimePreference: string;
  confidenceAdjustments: Map<string, number>;
  riskAppetiteModifier: number;
  optimalEntryConditions: {
    minRvol: number;
    minLiquidity: number;
    preferredTimeWindows: number[];
  };
  explorationRate: number; // Current epsilon value
  bestQValues: Map<string, number>; // Best Q-value per state
}

export class AIAdaptiveLearningV2 {
  private static instance: AIAdaptiveLearningV2 | null = null;
  
  private learningDataPath = './learningData_v2.json';
  private tradeHistory: TradeOutcome[] = [];
  private patternStats = new Map<string, PatternStats>();
  private regimeStats = new Map<string, MarketConditionStats>();
  private stateActionValues = new Map<string, StateActionValue>();
  
  // RL Hyperparameters
  private learningWindowDays = 14; // Increased from 7 for more data
  private minSampleSize = 3; // Reduced from 5 for faster learning
  private discountFactor = 0.95; // γ (gamma) - how much we value future rewards
  private learningRate = 0.1; // α (alpha) - how fast we update Q-values
  private emaAlpha = 0.3; // Smoothing factor for exponential moving averages
  private baseExplorationRate = 0.15; // ε (epsilon) - 15% exploration
  private explorationDecay = 0.995; // Reduce exploration over time
  private currentExplorationRate = this.baseExplorationRate;

  constructor() {
    this.loadLearningData();
  }

  /**
   * Get singleton instance - ensures all systems share same learning data
   */
  public static getInstance(): AIAdaptiveLearningV2 {
    if (!AIAdaptiveLearningV2.instance) {
      AIAdaptiveLearningV2.instance = new AIAdaptiveLearningV2();
      console.log('📚 [Adaptive Learning V2] Singleton instance created');
    }
    return AIAdaptiveLearningV2.instance;
  }

  /**
   * Record a completed trade for learning with TD-Learning update
   */
  recordTrade(outcome: TradeOutcome) {
    this.tradeHistory.push(outcome);
    
    // Update pattern statistics with EMA
    if (outcome.candlestickPattern) {
      this.updatePatternStatsWithTD(outcome);
    }
    
    // Update Q-values for state-action pairs
    this.updateQValues(outcome);
    
    // Update regime statistics
    this.updateRegimeStats(outcome);
    
    // Calculate and update regret
    this.updateRegret(outcome);
    
    // Decay exploration rate
    this.currentExplorationRate *= this.explorationDecay;
    this.currentExplorationRate = Math.max(0.05, this.currentExplorationRate); // Min 5%
    
    // Keep only recent history (14 days)
    const cutoff = Date.now() - this.learningWindowDays * 24 * 60 * 60 * 1000;
    this.tradeHistory = this.tradeHistory.filter(t => t.timestamp > cutoff);
    
    // Save to disk
    this.saveLearningData();
    
    console.log(`📚 [Adaptive Learning V2] Recorded trade: ${outcome.symbol} (${outcome.profitPercent > 0 ? 'WIN' : 'LOSS'}, ${outcome.profitPercent.toFixed(2)}%) - Exploration rate: ${(this.currentExplorationRate * 100).toFixed(1)}%`);
  }

  /**
   * Update pattern stats using Temporal Difference Learning
   */
  private updatePatternStatsWithTD(outcome: TradeOutcome) {
    const pattern = outcome.candlestickPattern!;
    
    if (!this.patternStats.has(pattern)) {
      this.patternStats.set(pattern, {
        pattern,
        totalTrades: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        avgProfit: 0,
        avgLoss: 0,
        avgHoldTime: 0,
        qValue: 0,
        explorationCount: 0,
        lastExploredTimestamp: Date.now(),
        emaWinRate: 0.5, // Start neutral
        emaProfit: 0,
        confidence: 0.3, // Start with low confidence
        regret: 0,
        lastSeen: Date.now(),
      });
    }

    const stats = this.patternStats.get(pattern)!;
    stats.totalTrades++;
    stats.lastSeen = outcome.timestamp;
    
    // Normalize profit to 0-1 range for reward signal (assume max ±50% profit)
    const reward = (outcome.profitPercent + 50) / 100; // Maps -50% to 0, +50% to 1
    
    // Update Q-value using TD-Learning formula:
    // Q(s,a) = Q(s,a) + α * [reward + γ * max(Q(s',a')) - Q(s,a)]
    // Simplified: Q(s,a) = Q(s,a) + α * [reward - Q(s,a)]
    const tdError = reward - stats.qValue;
    stats.qValue += this.learningRate * tdError;
    
    // Update EMA win rate
    const isWin = outcome.profit > 0 ? 1 : 0;
    stats.emaWinRate = this.emaAlpha * isWin + (1 - this.emaAlpha) * stats.emaWinRate;
    
    // Update EMA profit
    stats.emaProfit = this.emaAlpha * outcome.profitPercent + (1 - this.emaAlpha) * stats.emaProfit;
    
    // Traditional stats
    if (outcome.profit > 0) {
      stats.wins++;
      stats.avgProfit = ((stats.avgProfit * (stats.wins - 1)) + outcome.profitPercent) / stats.wins;
    } else {
      stats.losses++;
      stats.avgLoss = ((stats.avgLoss * (stats.losses - 1)) + Math.abs(outcome.profitPercent)) / stats.losses;
    }

    stats.winRate = stats.wins / stats.totalTrades;
    stats.avgHoldTime = ((stats.avgHoldTime * (stats.totalTrades - 1)) + outcome.holdTime) / stats.totalTrades;
    
    // Update confidence based on sample size and EMA win rate
    const sampleFactor = Math.min(1, stats.totalTrades / 15); // Full confidence at 15 trades
    stats.confidence = sampleFactor * stats.emaWinRate;

    // Detect best time of day
    const hour = new Date(outcome.timestamp).getHours();
    if (outcome.profit > 0) {
      stats.bestTimeOfDay = hour;
    }
  }

  /**
   * Update Q-values for state-action pairs (Q-Learning)
   */
  private updateQValues(outcome: TradeOutcome) {
    const state = this.getMarketState(outcome);
    const action = outcome.candlestickPattern || 'NO_PATTERN';
    const stateActionKey = this.getStateActionKey(state, action);
    
    if (!this.stateActionValues.has(stateActionKey)) {
      this.stateActionValues.set(stateActionKey, {
        state,
        action,
        qValue: 0,
        visits: 0,
        lastReward: 0,
        emaReward: 0,
      });
    }

    const sa = this.stateActionValues.get(stateActionKey)!;
    const reward = outcome.profitPercent / 100; // Normalize to roughly -1 to +1
    
    // Q-Learning update: Q(s,a) = Q(s,a) + α[r + γ * max Q(s',a') - Q(s,a)]
    // Simplified for terminal state: Q(s,a) = Q(s,a) + α[r - Q(s,a)]
    sa.qValue += this.learningRate * (reward - sa.qValue);
    sa.visits++;
    sa.lastReward = reward;
    sa.emaReward = this.emaAlpha * reward + (1 - this.emaAlpha) * sa.emaReward;
  }

  /**
   * Calculate regret - difference between chosen action and best possible action
   */
  private updateRegret(outcome: TradeOutcome) {
    if (!outcome.candlestickPattern) return;
    
    const pattern = outcome.candlestickPattern;
    const stats = this.patternStats.get(pattern)!;
    
    // Find best pattern's Q-value at this time
    const allPatterns = Array.from(this.patternStats.values())
      .filter(p => p.totalTrades >= 3);
    
    if (allPatterns.length === 0) return;
    
    const bestPattern = allPatterns.reduce((best, current) => 
      current.qValue > best.qValue ? current : best
    );
    
    // Regret = reward of best action - reward of chosen action
    const regret = (bestPattern.qValue - stats.qValue);
    stats.regret += Math.max(0, regret); // Cumulative regret
  }

  /**
   * Get market state discretization for Q-Learning
   */
  private getMarketState(outcome: TradeOutcome): MarketState {
    let rvolBucket: string;
    if (outcome.rvol < 2) rvolBucket = 'LOW';
    else if (outcome.rvol < 5) rvolBucket = 'MEDIUM';
    else rvolBucket = 'HIGH';

    let liquidityBucket: string;
    if (outcome.liquidity < 100000) liquidityBucket = 'LOW';
    else if (outcome.liquidity < 500000) liquidityBucket = 'MEDIUM';
    else liquidityBucket = 'HIGH';

    return {
      regime: outcome.marketRegime,
      rvolBucket,
      liquidityBucket,
    };
  }

  private getStateActionKey(state: MarketState, action: string): string {
    return `${state.regime}_${state.rvolBucket}_${state.liquidityBucket}_${action}`;
  }

  /**
   * Epsilon-Greedy Action Selection
   * Returns whether to explore (try new pattern) vs exploit (use best known)
   */
  shouldExplore(): boolean {
    return Math.random() < this.currentExplorationRate;
  }

  /**
   * Get pattern to explore (Multi-Armed Bandit with UCB1)
   * Upper Confidence Bound: balance exploration of uncertain patterns vs exploitation of known good ones
   */
  getExplorationPattern(): string | null {
    const patterns = Array.from(this.patternStats.values());
    if (patterns.length === 0) return null;

    const totalVisits = patterns.reduce((sum, p) => sum + p.totalTrades, 0);
    
    // UCB1 formula: Q(a) + c * sqrt(ln(N) / n(a))
    // where Q(a) = estimated value, N = total visits, n(a) = visits to this action, c = exploration constant
    const ucbScores = patterns.map(p => {
      const exploitValue = p.qValue;
      const exploreBonus = p.totalTrades > 0 
        ? 2 * Math.sqrt(Math.log(totalVisits + 1) / p.totalTrades)
        : Infinity; // Infinite bonus for never-tried patterns
      return {
        pattern: p.pattern,
        score: exploitValue + exploreBonus,
      };
    });

    const best = ucbScores.reduce((best, current) => 
      current.score > best.score ? current : best
    );

    const stats = this.patternStats.get(best.pattern)!;
    stats.explorationCount++;
    stats.lastExploredTimestamp = Date.now();

    return best.pattern;
  }

  /**
   * Get adaptive insights enhanced with RL metrics
   */
  getAdaptiveInsights(_currentRegime: string): AdaptiveInsights {
    const recentTrades = this.getRecentTrades(24);
    const recentWinRate = recentTrades.length > 0 
      ? recentTrades.filter(t => t.profit > 0).length / recentTrades.length 
      : 0.5;

    // Risk appetite based on recent EMA performance
    let riskModifier = 0;
    if (recentTrades.length >= 3) {
      if (recentWinRate > 0.7) {
        riskModifier = 0.15; // Increased from 0.1
      } else if (recentWinRate < 0.3) {
        riskModifier = -0.2; // More conservative when losing
      }
    }

    // Find hot and cold patterns using EMA win rate
    const allPatterns = Array.from(this.patternStats.values())
      .filter(p => p.totalTrades >= this.minSampleSize);
    
    const hotPatterns = allPatterns
      .filter(p => p.emaWinRate > 0.6 && p.qValue > 0 && this.isPatternRecent(p))
      .sort((a, b) => b.qValue - a.qValue) // Sort by Q-value instead of win rate
      .slice(0, 5);
    
    const coldPatterns = allPatterns
      .filter(p => p.emaWinRate < 0.4 || p.qValue < 0)
      .sort((a, b) => a.qValue - b.qValue)
      .slice(0, 5);

    // Confidence adjustments based on Q-values
    const confidenceAdjustments = new Map<string, number>();
    hotPatterns.forEach(p => {
      // Q-value typically ranges -0.5 to +0.5, scale to confidence adjustment
      const boost = Math.min(0.3, Math.max(0, p.qValue * 0.6));
      confidenceAdjustments.set(p.pattern, boost);
    });
    coldPatterns.forEach(p => {
      const penalty = Math.max(-0.3, Math.min(0, p.qValue * 0.6));
      confidenceAdjustments.set(p.pattern, penalty);
    });

    // Calculate optimal entry conditions from successful recent trades
    const winningTrades = recentTrades.filter(t => t.profit > 0);
    const optimalEntryConditions = this.calculateOptimalConditions(winningTrades);

    // Build best Q-values map per state
    const bestQValues = new Map<string, number>();
    Array.from(this.stateActionValues.entries()).forEach(([_key, value]) => {
      const stateKey = `${value.state.regime}_${value.state.rvolBucket}_${value.state.liquidityBucket}`;
      const current = bestQValues.get(stateKey) || -Infinity;
      if (value.qValue > current) {
        bestQValues.set(stateKey, value.qValue);
      }
    });

    return {
      hotPatterns,
      coldPatterns,
      currentRegimePreference: this.getBestRegime(),
      confidenceAdjustments,
      riskAppetiteModifier: riskModifier,
      optimalEntryConditions,
      explorationRate: this.currentExplorationRate,
      bestQValues,
    };
  }

  /**
   * Adjust AI confidence with RL-enhanced logic
   */
  adjustConfidence(
    baseConfidence: number,
    pattern: string | undefined,
    marketRegime: string,
    marketContext: {
      rvol: number;
      liquidity: number;
      volume24h: number;
    }
  ): { adjustedConfidence: number; reasoning: string[] } {
    const insights = this.getAdaptiveInsights(marketRegime);
    let adjusted = baseConfidence;
    const reasoning: string[] = [];

    // Check if we should explore instead of exploit
    if (this.shouldExplore()) {
      reasoning.push(`🔬 EXPLORATION MODE (${(this.currentExplorationRate * 100).toFixed(1)}% rate) - Testing less-proven patterns`);
    }

    // Apply Q-value based adjustment
    if (pattern && insights.confidenceAdjustments.has(pattern)) {
      const adjustment = insights.confidenceAdjustments.get(pattern)!;
      adjusted += adjustment;
      
      const stats = this.patternStats.get(pattern);
      if (stats) {
        if (adjustment > 0) {
          reasoning.push(`🔥 ${pattern} HIGH Q-VALUE: ${stats.qValue.toFixed(3)} (EMA WR: ${(stats.emaWinRate * 100).toFixed(0)}%, ${stats.wins}W/${stats.losses}L)`);
        } else {
          reasoning.push(`❄️ ${pattern} LOW Q-VALUE: ${stats.qValue.toFixed(3)} - Reducing confidence`);
        }
        
        // Show regret if significant
        if (stats.regret > 0.1) {
          reasoning.push(`⚠️ Cumulative regret: ${stats.regret.toFixed(3)} (could have done better)`);
        }
      }
    }

    // Check learned optimal conditions
    const optimal = insights.optimalEntryConditions;
    if (marketContext.rvol >= optimal.minRvol) {
      reasoning.push(`✅ RVOL ${marketContext.rvol.toFixed(1)}x >= learned optimal (${optimal.minRvol.toFixed(1)}x)`);
    } else {
      adjusted -= 0.12;
      reasoning.push(`⚠️ RVOL ${marketContext.rvol.toFixed(1)}x < learned optimal (${optimal.minRvol.toFixed(1)}x)`);
    }

    if (marketContext.liquidity >= optimal.minLiquidity) {
      reasoning.push(`✅ Liquidity $${(marketContext.liquidity / 1000000).toFixed(2)}M >= threshold`);
    } else {
      adjusted -= 0.18;
      reasoning.push(`⚠️ Liquidity $${(marketContext.liquidity / 1000000).toFixed(2)}M < optimal ($${(optimal.minLiquidity / 1000000).toFixed(2)}M)`);
    }

    // Time-based adjustment
    const currentHour = new Date().getHours();
    if (optimal.preferredTimeWindows.includes(currentHour)) {
      adjusted += 0.08;
      reasoning.push(`⏰ Time ${currentHour}:00 in high-success window`);
    }

    // Risk appetite from recent performance
    if (insights.riskAppetiteModifier !== 0) {
      adjusted += insights.riskAppetiteModifier;
      if (insights.riskAppetiteModifier > 0) {
        reasoning.push(`🚀 Win streak detected - increasing risk appetite (+${(insights.riskAppetiteModifier * 100).toFixed(0)}%)`);
      } else {
        reasoning.push(`🛡️ Loss streak - being conservative (${(insights.riskAppetiteModifier * 100).toFixed(0)}%)`);
      }
    }

    // Clamp to 0-1 range
    adjusted = Math.max(0, Math.min(1, adjusted));

    return { adjustedConfidence: adjusted, reasoning };
  }

  /**
   * Get trend insights with RL metrics
   */
  getTrendInsights(): string {
    const insights = this.getAdaptiveInsights('UNKNOWN');
    const recentTrades = this.getRecentTrades(24);
    
    if (recentTrades.length === 0) {
      return 'No recent trades to analyze. Exploration rate: ' + (this.currentExplorationRate * 100).toFixed(1) + '%';
    }

    const winRate = recentTrades.filter(t => t.profit > 0).length / recentTrades.length;
    const avgProfit = recentTrades.reduce((sum, t) => sum + t.profitPercent, 0) / recentTrades.length;

    let summary = `📊 Last 24h: ${recentTrades.length} trades, ${(winRate * 100).toFixed(0)}% WR, avg ${avgProfit > 0 ? '+' : ''}${avgProfit.toFixed(2)}%\n`;
    summary += `🔬 Exploration: ${(this.currentExplorationRate * 100).toFixed(1)}% (learning new patterns)\n\n`;

    if (insights.hotPatterns.length > 0) {
      summary += `🔥 HIGH Q-VALUE Patterns:\n`;
      insights.hotPatterns.slice(0, 3).forEach(p => {
        summary += `  • ${p.pattern}: Q=${p.qValue.toFixed(3)}, EMA WR=${(p.emaWinRate * 100).toFixed(0)}% (${p.wins}W/${p.losses}L)\n`;
      });
    }

    if (insights.coldPatterns.length > 0) {
      summary += `\n❄️ LOW Q-VALUE Patterns (avoiding):\n`;
      insights.coldPatterns.slice(0, 3).forEach(p => {
        summary += `  • ${p.pattern}: Q=${p.qValue.toFixed(3)}, EMA WR=${(p.emaWinRate * 100).toFixed(0)}%\n`;
      });
    }

    summary += `\n🎯 Learned Optimal Conditions:\n`;
    summary += `  • Min RVOL: ${insights.optimalEntryConditions.minRvol.toFixed(1)}x\n`;
    summary += `  • Min Liquidity: $${(insights.optimalEntryConditions.minLiquidity / 1000000).toFixed(2)}M\n`;
    
    if (insights.optimalEntryConditions.preferredTimeWindows.length > 0) {
      const hours = insights.optimalEntryConditions.preferredTimeWindows.map(h => `${h}:00`).join(', ');
      summary += `  • Best times: ${hours}\n`;
    }

    // Show total cumulative regret
    const totalRegret = Array.from(this.patternStats.values())
      .reduce((sum, p) => sum + p.regret, 0);
    if (totalRegret > 0.5) {
      summary += `\n⚠️ Cumulative Regret: ${totalRegret.toFixed(2)} (room for improvement)\n`;
    }

    return summary;
  }

  // ... (keep all the helper methods from V1, plus update regime stats)
  
  private updateRegimeStats(outcome: TradeOutcome) {
    const regime = outcome.marketRegime;
    
    if (!this.regimeStats.has(regime)) {
      this.regimeStats.set(regime, {
        regime,
        totalTrades: 0,
        wins: 0,
        winRate: 0,
        avgProfit: 0,
        preferredPatterns: [],
        optimalRvol: { min: 1, max: 10 },
        optimalLiquidity: { min: 50000, max: 10000000 },
      });
    }

    const stats = this.regimeStats.get(regime)!;
    stats.totalTrades++;
    if (outcome.profit > 0) {
      stats.wins++;
    }
    stats.winRate = stats.wins / stats.totalTrades;
    stats.avgProfit = ((stats.avgProfit * (stats.totalTrades - 1)) + outcome.profitPercent) / stats.totalTrades;
  }

  private isPatternRecent(pattern: PatternStats): boolean {
    const daysSinceLastSeen = (Date.now() - pattern.lastSeen) / (1000 * 60 * 60 * 24);
    return daysSinceLastSeen <= 3;
  }

  private getRecentTrades(hours: number): TradeOutcome[] {
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    return this.tradeHistory.filter(t => t.timestamp > cutoff);
  }

  private getBestRegime(): string {
    const regimes = Array.from(this.regimeStats.values())
      .filter(r => r.totalTrades >= 3)
      .sort((a, b) => b.winRate - a.winRate);
    
    return regimes.length > 0 ? regimes[0].regime : 'UNKNOWN';
  }

  private calculateOptimalConditions(winningTrades: TradeOutcome[]) {
    if (winningTrades.length === 0) {
      return {
        minRvol: 1.5,
        minLiquidity: 100000,
        preferredTimeWindows: [],
      };
    }

    const rvols = winningTrades.map(t => t.rvol).sort((a, b) => a - b);
    const liquidities = winningTrades.map(t => t.liquidity).sort((a, b) => a - b);
    
    const minRvol = rvols[Math.floor(rvols.length * 0.25)];
    const minLiquidity = liquidities[Math.floor(liquidities.length * 0.25)];

    const hourCounts = new Map<number, { wins: number; total: number }>();
    winningTrades.forEach(t => {
      const hour = new Date(t.timestamp).getHours();
      if (!hourCounts.has(hour)) {
        hourCounts.set(hour, { wins: 0, total: 0 });
      }
      hourCounts.get(hour)!.wins++;
      hourCounts.get(hour)!.total++;
    });

    const preferredTimeWindows = Array.from(hourCounts.entries())
      .filter(([_, stats]) => stats.total >= 2 && stats.wins / stats.total > 0.6)
      .map(([hour, _]) => hour)
      .sort((a, b) => a - b);

    return {
      minRvol: Math.max(1.2, minRvol),
      minLiquidity: Math.max(50000, minLiquidity),
      preferredTimeWindows,
    };
  }

  private loadLearningData() {
    try {
      if (fs.existsSync(this.learningDataPath)) {
        const data = JSON.parse(fs.readFileSync(this.learningDataPath, 'utf-8'));
        this.tradeHistory = data.tradeHistory || [];
        this.currentExplorationRate = data.explorationRate || this.baseExplorationRate;
        
        // Rebuild stats
        this.tradeHistory.forEach(trade => {
          if (trade.candlestickPattern) {
            this.updatePatternStatsWithTD(trade);
          }
          this.updateQValues(trade);
          this.updateRegimeStats(trade);
        });
        
        console.log(`📚 [Adaptive Learning V2] Loaded ${this.tradeHistory.length} trades`);
        console.log(`📊 Tracking ${this.patternStats.size} patterns, ${this.regimeStats.size} regimes`);
        console.log(`🔬 Exploration rate: ${(this.currentExplorationRate * 100).toFixed(1)}%`);
      } else {
        console.log(`📚 [Adaptive Learning V2] Starting fresh - no historical data`);
      }
    } catch (error) {
      console.error('Failed to load learning data:', error);
    }
  }

  private saveLearningData() {
    try {
      const data = {
        tradeHistory: this.tradeHistory,
        explorationRate: this.currentExplorationRate,
        lastUpdated: Date.now(),
      };
      fs.writeFileSync(this.learningDataPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to save learning data:', error);
    }
  }

  getStatsSummary(): string {
    const totalTrades = this.tradeHistory.length;
    const wins = this.tradeHistory.filter(t => t.profit > 0).length;
    const winRate = totalTrades > 0 ? wins / totalTrades : 0;
    const totalRegret = Array.from(this.patternStats.values())
      .reduce((sum, p) => sum + p.regret, 0);

    return `📚 Adaptive Learning V2 (RL-Enhanced):
  • Total trades: ${totalTrades}
  • Win rate: ${(winRate * 100).toFixed(1)}%
  • Patterns tracked: ${this.patternStats.size}
  • State-action pairs: ${this.stateActionValues.size}
  • Exploration rate: ${(this.currentExplorationRate * 100).toFixed(1)}%
  • Cumulative regret: ${totalRegret.toFixed(2)}
  • Learning window: ${this.learningWindowDays} days
  • Discount factor (γ): ${this.discountFactor}
  • Learning rate (α): ${this.learningRate}`;
  }
}
