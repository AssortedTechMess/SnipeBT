/**
 * AI Adaptive Learning System
 * Learns from market patterns and adjusts trading behavior dynamically
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
  // Risk management tracking
  positionSizePercent?: number; // % of portfolio in this position
  maxDrawdown?: number; // Worst drawdown during hold
  enteredAtExtendedLevel?: boolean; // Was price >50% up on 24h?
  doublingCount?: number; // How many times doubled into this position
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
  bestTimeOfDay?: number; // Hour 0-23
  confidence: number; // How reliable this pattern is
  lastSeen: number;
}

interface MarketConditionStats {
  regime: string; // BULL, BEAR, SIDEWAYS
  totalTrades: number;
  wins: number;
  winRate: number;
  avgProfit: number;
  preferredPatterns: string[];
  optimalRvol: { min: number; max: number };
  optimalLiquidity: { min: number; max: number };
}

interface AdaptiveInsights {
  hotPatterns: PatternStats[]; // Currently working well
  coldPatterns: PatternStats[]; // Currently underperforming
  currentRegimePreference: string;
  confidenceAdjustments: Map<string, number>; // Pattern -> confidence modifier (-0.3 to +0.3)
  riskAppetiteModifier: number; // -0.2 to +0.2 based on recent performance
  optimalEntryConditions: {
    minRvol: number;
    minLiquidity: number;
    preferredTimeWindows: number[]; // Hours of day
  };
  // Risk management insights
  riskLessons: {
    avoidExtendedLevels: boolean; // Don't buy tokens >50% up
    maxSafePositionSize: number; // Learned optimal position size
    doublingDangerThreshold: number; // Max safe doublings
    extendedLevelWinRate: number; // Win rate when entering extended levels
  };
}

interface RiskMetrics {
  extendedLevelTrades: number;
  extendedLevelWins: number;
  extendedLevelWinRate: number;
  avgDrawdownOnLosses: number;
  largePositionTrades: number; // >30% of portfolio
  largePositionWinRate: number;
  doublingSuccessRate: number;
}

export class AIAdaptiveLearning {
  private learningDataPath = './learningData.json';
  private tradeHistory: TradeOutcome[] = [];
  private patternStats = new Map<string, PatternStats>();
  private regimeStats = new Map<string, MarketConditionStats>();
  private riskMetrics: RiskMetrics = {
    extendedLevelTrades: 0,
    extendedLevelWins: 0,
    extendedLevelWinRate: 0,
    avgDrawdownOnLosses: 0,
    largePositionTrades: 0,
    largePositionWinRate: 0,
    doublingSuccessRate: 0,
  };
  private learningWindowDays = 7; // Learn from last 7 days
  private minSampleSize = 5; // Minimum trades needed to trust a pattern

  constructor() {
    this.loadLearningData();
  }

  /**
   * Record a completed trade for learning
   */
  recordTrade(outcome: TradeOutcome) {
    this.tradeHistory.push(outcome);
    
    // Update pattern statistics
    if (outcome.candlestickPattern) {
      this.updatePatternStats(outcome);
    }
    
    // Update regime statistics
    this.updateRegimeStats(outcome);
    
    // Update risk metrics - LEARN FROM MISTAKES
    this.updateRiskMetrics(outcome);
    
    // Keep only recent history (7 days)
    const cutoff = Date.now() - this.learningWindowDays * 24 * 60 * 60 * 1000;
    this.tradeHistory = this.tradeHistory.filter(t => t.timestamp > cutoff);
    
    // Save to disk
    this.saveLearningData();
    
    console.log(`📚 [Adaptive Learning] Recorded trade: ${outcome.symbol} (${outcome.profitPercent > 0 ? 'WIN' : 'LOSS'}, ${outcome.profitPercent.toFixed(2)}%)`);
  }

  /**
   * Get adaptive insights for current market conditions
   */
  getAdaptiveInsights(_currentRegime: string): AdaptiveInsights {
    const recentTrades = this.getRecentTrades(24); // Last 24 hours
    const recentWinRate = recentTrades.length > 0 
      ? recentTrades.filter(t => t.profit > 0).length / recentTrades.length 
      : 0.5;

    // Calculate risk appetite modifier based on recent performance
    let riskModifier = 0;
    if (recentTrades.length >= 5) {
      if (recentWinRate > 0.7) {
        riskModifier = 0.1; // Increase risk when winning
      } else if (recentWinRate < 0.3) {
        riskModifier = -0.15; // Decrease risk when losing
      }
    }

    // Find hot and cold patterns
    const allPatterns = Array.from(this.patternStats.values())
      .filter(p => p.totalTrades >= this.minSampleSize);
    
    const hotPatterns = allPatterns
      .filter(p => p.winRate > 0.6 && this.isPatternRecent(p))
      .sort((a, b) => b.winRate - a.winRate)
      .slice(0, 5);
    
    const coldPatterns = allPatterns
      .filter(p => p.winRate < 0.4 && this.isPatternRecent(p))
      .sort((a, b) => a.winRate - b.winRate)
      .slice(0, 5);

    // Calculate confidence adjustments
    const confidenceAdjustments = new Map<string, number>();
    hotPatterns.forEach(p => {
      const boost = Math.min(0.3, (p.winRate - 0.5) * 0.6); // Up to +0.3
      confidenceAdjustments.set(p.pattern, boost);
    });
    coldPatterns.forEach(p => {
      const penalty = Math.max(-0.3, (p.winRate - 0.5) * 0.6); // Up to -0.3
      confidenceAdjustments.set(p.pattern, penalty);
    });

    // Calculate optimal entry conditions from successful recent trades
    const winningTrades = recentTrades.filter(t => t.profit > 0);
    const optimalEntryConditions = this.calculateOptimalConditions(winningTrades);

    // Calculate risk lessons from trade history
    const riskLessons = this.calculateRiskLessons();

    return {
      hotPatterns,
      coldPatterns,
      currentRegimePreference: this.getBestRegime(),
      confidenceAdjustments,
      riskAppetiteModifier: riskModifier,
      optimalEntryConditions,
      riskLessons,
    };
  }

  /**
   * Adjust AI confidence based on learned patterns
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

    // Apply pattern-based adjustment
    if (pattern && insights.confidenceAdjustments.has(pattern)) {
      const adjustment = insights.confidenceAdjustments.get(pattern)!;
      adjusted += adjustment;
      
      if (adjustment > 0) {
        const stats = this.patternStats.get(pattern);
        reasoning.push(`🔥 ${pattern} is HOT: ${(stats!.winRate * 100).toFixed(0)}% win rate (${stats!.wins}W/${stats!.losses}L)`);
      } else {
        const stats = this.patternStats.get(pattern);
        reasoning.push(`❄️ ${pattern} is COLD: ${(stats!.winRate * 100).toFixed(0)}% win rate recently - reducing confidence`);
      }
    }

    // Check if conditions match optimal learned conditions
    const optimal = insights.optimalEntryConditions;
    if (marketContext.rvol >= optimal.minRvol) {
      reasoning.push(`✅ RVOL ${marketContext.rvol.toFixed(1)}x matches learned optimal (${optimal.minRvol.toFixed(1)}x+)`);
    } else {
      adjusted -= 0.1;
      reasoning.push(`⚠️ RVOL ${marketContext.rvol.toFixed(1)}x below learned optimal (${optimal.minRvol.toFixed(1)}x+)`);
    }

    if (marketContext.liquidity >= optimal.minLiquidity) {
      reasoning.push(`✅ Liquidity $${(marketContext.liquidity / 1000000).toFixed(2)}M meets learned threshold`);
    } else {
      adjusted -= 0.15;
      reasoning.push(`⚠️ Liquidity low vs learned optimal ($${(optimal.minLiquidity / 1000000).toFixed(2)}M+)`);
    }

    // Time-based adjustment
    const currentHour = new Date().getHours();
    if (optimal.preferredTimeWindows.includes(currentHour)) {
      adjusted += 0.05;
      reasoning.push(`⏰ Current time (${currentHour}:00) is in learned high-success window`);
    }

    // Risk appetite adjustment based on recent performance
    if (insights.riskAppetiteModifier !== 0) {
      adjusted += insights.riskAppetiteModifier;
      if (insights.riskAppetiteModifier > 0) {
        reasoning.push(`🚀 Recent win streak - increasing confidence by ${(insights.riskAppetiteModifier * 100).toFixed(0)}%`);
      } else {
        reasoning.push(`🛡️ Recent losses - being more conservative (${(insights.riskAppetiteModifier * 100).toFixed(0)}%)`);
      }
    }

    // CRITICAL: Apply learned risk lessons
    const riskLessons = insights.riskLessons;
    if (riskLessons.avoidExtendedLevels && marketContext.volume24h /* proxy for price action */) {
      // This check will be done by riskManager, but AI should also learn
      reasoning.push(`🧠 LEARNED: Avoid extended price levels (${(riskLessons.extendedLevelWinRate * 100).toFixed(0)}% win rate when buying tops)`);
    }

    // Clamp to 0-1 range
    adjusted = Math.max(0, Math.min(1, adjusted));

    return { adjustedConfidence: adjusted, reasoning };
  }

  /**
   * Get trend insights for market summary
   */
  getTrendInsights(): string {
    const insights = this.getAdaptiveInsights('UNKNOWN');
    const recentTrades = this.getRecentTrades(24);
    
    if (recentTrades.length === 0) {
      return 'No recent trades to analyze trends.';
    }

    const winRate = recentTrades.filter(t => t.profit > 0).length / recentTrades.length;
    const avgProfit = recentTrades.reduce((sum, t) => sum + t.profitPercent, 0) / recentTrades.length;

    let summary = `📊 Last 24h: ${recentTrades.length} trades, ${(winRate * 100).toFixed(0)}% win rate, avg ${avgProfit > 0 ? '+' : ''}${avgProfit.toFixed(2)}%\n\n`;

    if (insights.hotPatterns.length > 0) {
      summary += `🔥 HOT Patterns:\n`;
      insights.hotPatterns.slice(0, 3).forEach(p => {
        summary += `  • ${p.pattern}: ${(p.winRate * 100).toFixed(0)}% WR (${p.wins}W/${p.losses}L)\n`;
      });
    }

    if (insights.coldPatterns.length > 0) {
      summary += `\n❄️ COLD Patterns (avoiding):\n`;
      insights.coldPatterns.slice(0, 3).forEach(p => {
        summary += `  • ${p.pattern}: ${(p.winRate * 100).toFixed(0)}% WR\n`;
      });
    }

    summary += `\n🎯 Learned Optimal Conditions:\n`;
    summary += `  • Min RVOL: ${insights.optimalEntryConditions.minRvol.toFixed(1)}x\n`;
    summary += `  • Min Liquidity: $${(insights.optimalEntryConditions.minLiquidity / 1000000).toFixed(2)}M\n`;
    
    if (insights.optimalEntryConditions.preferredTimeWindows.length > 0) {
      const hours = insights.optimalEntryConditions.preferredTimeWindows.map(h => `${h}:00`).join(', ');
      summary += `  • Best times: ${hours}\n`;
    }

    // Show learned risk management lessons
    const riskLessons = insights.riskLessons;
    summary += `\n🛡️ Risk Management Lessons:\n`;
    
    if (riskLessons.avoidExtendedLevels) {
      summary += `  • ⚠️ AVOID buying tokens >50% up (${(riskLessons.extendedLevelWinRate * 100).toFixed(0)}% win rate)\n`;
    } else {
      summary += `  • ✅ Extended levels OK (${(riskLessons.extendedLevelWinRate * 100).toFixed(0)}% win rate)\n`;
    }
    
    summary += `  • Max safe position size: ${(riskLessons.maxSafePositionSize * 100).toFixed(0)}%\n`;
    summary += `  • Safe doubling limit: ${riskLessons.doublingDangerThreshold}x\n`;
    
    if (this.riskMetrics.largePositionWinRate > 0) {
      summary += `  • Large positions (>30%) win rate: ${(this.riskMetrics.largePositionWinRate * 100).toFixed(0)}%\n`;
    }

    return summary;
  }

  /**
   * Private helper methods
   */

  private updatePatternStats(outcome: TradeOutcome) {
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
        confidence: 0.5,
        lastSeen: Date.now(),
      });
    }

    const stats = this.patternStats.get(pattern)!;
    stats.totalTrades++;
    stats.lastSeen = outcome.timestamp;
    
    if (outcome.profit > 0) {
      stats.wins++;
      stats.avgProfit = ((stats.avgProfit * (stats.wins - 1)) + outcome.profitPercent) / stats.wins;
    } else {
      stats.losses++;
      stats.avgLoss = ((stats.avgLoss * (stats.losses - 1)) + Math.abs(outcome.profitPercent)) / stats.losses;
    }

    stats.winRate = stats.wins / stats.totalTrades;
    stats.avgHoldTime = ((stats.avgHoldTime * (stats.totalTrades - 1)) + outcome.holdTime) / stats.totalTrades;
    stats.confidence = this.calculatePatternConfidence(stats);

    // Detect best time of day for this pattern
    const hour = new Date(outcome.timestamp).getHours();
    if (outcome.profit > 0) {
      stats.bestTimeOfDay = hour; // Simplified - could track distribution
    }
  }

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

  private calculatePatternConfidence(stats: PatternStats): number {
    // Confidence increases with sample size and win rate
    const sampleFactor = Math.min(1, stats.totalTrades / 20); // Full confidence at 20+ trades
    const performanceFactor = stats.winRate;
    return sampleFactor * performanceFactor;
  }

  private isPatternRecent(pattern: PatternStats): boolean {
    const daysSinceLastSeen = (Date.now() - pattern.lastSeen) / (1000 * 60 * 60 * 24);
    return daysSinceLastSeen <= 3; // Seen in last 3 days
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

    // Calculate percentiles for RVOL and liquidity from winning trades
    const rvols = winningTrades.map(t => t.rvol).sort((a, b) => a - b);
    const liquidities = winningTrades.map(t => t.liquidity).sort((a, b) => a - b);
    
    const minRvol = rvols[Math.floor(rvols.length * 0.25)]; // 25th percentile
    const minLiquidity = liquidities[Math.floor(liquidities.length * 0.25)];

    // Find most successful hours
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
      minRvol: Math.max(1.2, minRvol), // Don't go below 1.2x
      minLiquidity: Math.max(50000, minLiquidity),
      preferredTimeWindows,
    };
  }

  private loadLearningData() {
    try {
      if (fs.existsSync(this.learningDataPath)) {
        const data = JSON.parse(fs.readFileSync(this.learningDataPath, 'utf-8'));
        this.tradeHistory = data.tradeHistory || [];
        
        // Rebuild pattern stats from history
        this.tradeHistory.forEach(trade => {
          if (trade.candlestickPattern) {
            this.updatePatternStats(trade);
          }
          this.updateRegimeStats(trade);
        });
        
        console.log(`📚 [Adaptive Learning] Loaded ${this.tradeHistory.length} historical trades`);
        console.log(`📊 Tracking ${this.patternStats.size} patterns, ${this.regimeStats.size} market regimes`);
      }
    } catch (error) {
      console.error('Failed to load learning data:', error);
    }
  }

  private saveLearningData() {
    try {
      const data = {
        tradeHistory: this.tradeHistory,
        lastUpdated: Date.now(),
      };
      fs.writeFileSync(this.learningDataPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to save learning data:', error);
    }
  }

  /**
   * Get statistics summary for display
   */
  getStatsSummary(): string {
    const allPatterns = Array.from(this.patternStats.values());
    const totalTrades = this.tradeHistory.length;
    const wins = this.tradeHistory.filter(t => t.profit > 0).length;
    const winRate = totalTrades > 0 ? wins / totalTrades : 0;

    return `📚 Adaptive Learning Stats:
  • Total trades learned: ${totalTrades}
  • Overall win rate: ${(winRate * 100).toFixed(1)}%
  • Patterns tracked: ${allPatterns.length}
  • Regimes tracked: ${this.regimeStats.size}
  • Learning window: ${this.learningWindowDays} days`;
  }

  /**
   * Update risk metrics from completed trade
   */
  private updateRiskMetrics(outcome: TradeOutcome) {
    // Track extended level entries
    if (outcome.enteredAtExtendedLevel) {
      this.riskMetrics.extendedLevelTrades++;
      if (outcome.profit > 0) {
        this.riskMetrics.extendedLevelWins++;
      }
      this.riskMetrics.extendedLevelWinRate = 
        this.riskMetrics.extendedLevelWins / this.riskMetrics.extendedLevelTrades;
    }

    // Track large position outcomes
    if (outcome.positionSizePercent && outcome.positionSizePercent > 0.30) {
      this.riskMetrics.largePositionTrades++;
      if (outcome.profit > 0) {
        const wins = this.tradeHistory
          .filter(t => t.positionSizePercent && t.positionSizePercent > 0.30 && t.profit > 0)
          .length;
        this.riskMetrics.largePositionWinRate = wins / this.riskMetrics.largePositionTrades;
      }
    }

    // Track drawdowns on losses
    if (outcome.profit < 0 && outcome.maxDrawdown) {
      const losses = this.tradeHistory.filter(t => t.profit < 0 && t.maxDrawdown);
      const totalDrawdown = losses.reduce((sum, t) => sum + (t.maxDrawdown || 0), 0);
      this.riskMetrics.avgDrawdownOnLosses = totalDrawdown / losses.length;
    }

    // Track doubling success
    if (outcome.doublingCount && outcome.doublingCount > 0) {
      const doublingTrades = this.tradeHistory.filter(t => t.doublingCount && t.doublingCount > 0);
      const doublingWins = doublingTrades.filter(t => t.profit > 0).length;
      this.riskMetrics.doublingSuccessRate = doublingWins / doublingTrades.length;
    }
  }

  /**
   * Calculate risk lessons from historical data
   */
  private calculateRiskLessons() {
    // Analyze extended level performance
    const extendedWinRate = this.riskMetrics.extendedLevelWinRate;
    const avoidExtended = extendedWinRate < 0.40 && this.riskMetrics.extendedLevelTrades >= 5;

    // Calculate safe position size from winning trades
    const winningTrades = this.tradeHistory.filter(t => t.profit > 0 && t.positionSizePercent);
    const avgWinningSize = winningTrades.length > 0
      ? winningTrades.reduce((sum, t) => sum + (t.positionSizePercent || 0), 0) / winningTrades.length
      : 0.25;

    // Analyze doubling effectiveness
    const doublingTrades = this.tradeHistory.filter(t => t.doublingCount && t.doublingCount > 0);
    const maxSafeDoublings = doublingTrades.length >= 5
      ? Math.max(1, Math.floor(this.riskMetrics.doublingSuccessRate * 3))
      : 3;

    return {
      avoidExtendedLevels: avoidExtended,
      maxSafePositionSize: Math.min(0.30, avgWinningSize * 1.2), // Cap at 30%
      doublingDangerThreshold: maxSafeDoublings,
      extendedLevelWinRate: extendedWinRate,
    };
  }
}
