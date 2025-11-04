/**
 * AI-Powered Dynamic Exit System
 * 
 * Uses AI Candlestick Monitor + Adaptive Learning to determine optimal exit points
 * Instead of fixed profit targets, the AI decides when to sell based on:
 * 1. Candlestick reversal patterns (shooting star, bearish engulfing)
 * 2. Volume deterioration (pump ending)
 * 3. Learned patterns from past trades (this token type usually tops at X%)
 * 4. Market regime (bull = hold longer, bear = exit faster)
 */

import { AICandlestickMonitor } from './aiCandlestickMonitor';
import { AIAdaptiveLearningV2 } from './aiAdaptiveLearning_v2';

interface ExitSignal {
  shouldExit: boolean;
  reason: string;
  confidence: number; // 0-100
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  recommendedAction: 'HOLD' | 'PARTIAL_EXIT' | 'FULL_EXIT';
}

interface PositionContext {
  mint: string;
  entryPrice: number;
  currentPrice: number;
  profitPercent: number;
  holdTimeMinutes: number;
  volume24h?: number;
  rvol?: number;
}

export class AIDynamicExitSystem {
  private candlestickMonitor: AICandlestickMonitor | null = null;
  private learningSystem: AIAdaptiveLearningV2;
  private readonly EXTREME_LOSS_EMERGENCY = -0.25; // -25% emergency exit (extreme protection only)
  private readonly EXTREME_PROFIT_EMERGENCY = 0.75; // +75% emergency exit (secure insane gains)
  
  constructor() {
    // Initialize learning system - use singleton for shared learning data
    this.learningSystem = AIAdaptiveLearningV2.getInstance();
    
    // Initialize candlestick monitor if API key available
    const apiKey = process.env.XAI_API_KEY || process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.candlestickMonitor = new AICandlestickMonitor(apiKey);
      console.log('[AI Exits] Initialized with candlestick monitoring + adaptive learning (Singleton)');
    } else {
      console.log('[AI Exits] Using adaptive learning only - Singleton (no AI API key for candlestick analysis)');
    }
  }

  /**
   * Main decision function - should we exit this position?
   */
  async shouldExit(position: PositionContext): Promise<ExitSignal> {
    const signals: string[] = [];
    let totalConfidence = 0;
    let signalCount = 0;
    let maxUrgency: ExitSignal['urgency'] = 'LOW';

    // 1. EMERGENCY EXITS ONLY (Extreme situations)
    if (position.profitPercent <= this.EXTREME_LOSS_EMERGENCY) {
      return {
        shouldExit: true,
        reason: `EMERGENCY: Extreme loss ${(position.profitPercent * 100).toFixed(1)}% - cutting position`,
        confidence: 100,
        urgency: 'CRITICAL',
        recommendedAction: 'FULL_EXIT'
      };
    }

    if (position.profitPercent >= this.EXTREME_PROFIT_EMERGENCY) {
      return {
        shouldExit: true,
        reason: `EMERGENCY: Extreme profit ${(position.profitPercent * 100).toFixed(1)}% - securing gains!`,
        confidence: 100,
        urgency: 'CRITICAL',
        recommendedAction: 'FULL_EXIT'
      };
    }

    // 2. AI-DRIVEN LOSS ANALYSIS (Let AI decide if -10% is worth holding or exiting)
    if (position.profitPercent < 0) {
      // We're in a loss - should we hold or cut?
      const insights = this.learningSystem.getAdaptiveInsights('BULL');
      const currentPattern = this.inferPattern(position);
      const learnedPattern = insights.hotPatterns.find((p: any) => 
        p.pattern.toLowerCase().includes(currentPattern.toLowerCase())
      );

      if (learnedPattern) {
        const avgLoss = learnedPattern.avgLoss;
        const lossPct = Math.abs(position.profitPercent);
        
        if (lossPct >= Math.abs(avgLoss) * 1.5) {
          // Loss is 1.5x worse than learned average - likely not recovering
          signals.push(`Loss ${(position.profitPercent * 100).toFixed(1)}% exceeds learned avg loss ${(avgLoss * 100).toFixed(1)}% - unlikely to recover`);
          totalConfidence += 80;
          signalCount++;
          maxUrgency = 'HIGH';
        } else if (lossPct < Math.abs(avgLoss) * 0.5) {
          // Small loss compared to average - might recover
          signals.push(`Loss ${(position.profitPercent * 100).toFixed(1)}% small vs learned avg ${(avgLoss * 100).toFixed(1)}% - holding for recovery`);
        }
      } else {
        // No learned data - use time-based heuristic
        if (position.holdTimeMinutes > 120 && position.profitPercent <= -0.10) {
          // Held 2+ hours and down 10%+ = probably dead
          signals.push(`Down ${(position.profitPercent * 100).toFixed(1)}% for ${position.holdTimeMinutes} min - likely dead`);
          totalConfidence += 75;
          signalCount++;
          maxUrgency = 'HIGH';
        } else if (position.holdTimeMinutes < 30 && position.profitPercent >= -0.08) {
          // Recent entry, small loss - might just be noise
          signals.push(`Only ${position.holdTimeMinutes} min old, ${(position.profitPercent * 100).toFixed(1)}% loss might be temporary`);
        }
      }
    }

    // 2. AI CANDLESTICK ANALYSIS (if available)
    if (this.candlestickMonitor) {
      try {
        const candleAnalysis = await this.candlestickMonitor.analyzePattern(
          position.mint,
          position.currentPrice,
          {
            entryPrice: position.entryPrice,
            profitPercent: position.profitPercent,
            holdTimeMinutes: position.holdTimeMinutes
          }
        );

        console.log(`[AI Exits] Candlestick: ${candleAnalysis.pattern} - ${candleAnalysis.action} (${candleAnalysis.confidence}% conf)`);

        // High confidence reversal pattern = strong exit signal
        if (candleAnalysis.action === 'SELL' && candleAnalysis.confidence >= 70) {
          signals.push(`Candlestick reversal: ${candleAnalysis.pattern} (${candleAnalysis.confidence}% confidence)`);
          totalConfidence += candleAnalysis.confidence;
          signalCount++;
          maxUrgency = 'HIGH';
        } else if (candleAnalysis.action === 'SELL' && candleAnalysis.confidence >= 50) {
          // Medium confidence reversal
          signals.push(`Possible reversal: ${candleAnalysis.pattern} (${candleAnalysis.confidence}% confidence)`);
          totalConfidence += candleAnalysis.confidence * 0.7; // Discount medium confidence
          signalCount++;
          maxUrgency = maxUrgency === 'LOW' ? 'MEDIUM' : maxUrgency;
        }
      } catch (error) {
        console.error('[AI Exits] Candlestick analysis error:', error);
      }
    }

    // 3. ADAPTIVE LEARNING INSIGHTS
    const insights = this.learningSystem.getAdaptiveInsights('BULL'); // Default to BULL regime
    
    // Check if we're in a learned "hot pattern" that usually goes higher
    const currentPattern = this.inferPattern(position);
    const learnedPattern = insights.hotPatterns.find((p: any) => 
      p.pattern.toLowerCase().includes(currentPattern.toLowerCase())
    );

    if (learnedPattern) {
      // AI knows about this pattern type
      const avgProfitPct = learnedPattern.avgProfit * 100;
      
      if (position.profitPercent * 100 >= avgProfitPct * 0.9) {
        // We're at 90% of learned average - consider exiting
        signals.push(`At ${(position.profitPercent * 100).toFixed(1)}% profit, near learned avg of ${avgProfitPct.toFixed(1)}%`);
        totalConfidence += 70;
        signalCount++;
        maxUrgency = maxUrgency === 'LOW' ? 'MEDIUM' : maxUrgency;
      } else if (position.profitPercent * 100 < avgProfitPct * 0.5) {
        // Still room to run
        signals.push(`Only at ${(position.profitPercent * 100).toFixed(1)}%, AI expects avg ${avgProfitPct.toFixed(1)}% - holding`);
      }
    }

    // 4. TIME-BASED SIGNALS (Memecoin pumps are fast)
    if (position.profitPercent > 0) {
      // We're in profit
      if (position.holdTimeMinutes > 180 && position.profitPercent < 0.05) {
        // Held 3+ hours with <5% profit = probably stagnant, free up capital
        signals.push(`Stagnant after ${position.holdTimeMinutes} minutes with only +${(position.profitPercent * 100).toFixed(1)}%`);
        totalConfidence += 65;
        signalCount++;
        maxUrgency = maxUrgency === 'LOW' ? 'MEDIUM' : maxUrgency;
      }

      if (position.holdTimeMinutes < 15 && position.profitPercent >= 0.20) {
        // Quick 20%+ pump - likely to dump soon
        signals.push(`Fast pump: +${(position.profitPercent * 100).toFixed(1)}% in ${position.holdTimeMinutes} min - likely to dump`);
        totalConfidence += 75;
        signalCount++;
        maxUrgency = 'HIGH';
      }
    }

    // 6. DECISION LOGIC
    const avgConfidence = signalCount > 0 ? totalConfidence / signalCount : 0;
    const shouldExit = avgConfidence >= 60 || maxUrgency === 'HIGH';

    return {
      shouldExit,
      reason: signals.length > 0 ? signals.join(' | ') : 'No exit signals',
      confidence: avgConfidence,
      urgency: maxUrgency,
      recommendedAction: shouldExit ? 'FULL_EXIT' : 'HOLD'
    };
  }

  /**
   * Infer pattern type from position characteristics
   */
  private inferPattern(position: PositionContext): string {
    if (position.rvol && position.rvol >= 3.0) {
      return 'HIGH_RVOL_BREAKOUT';
    }
    if (position.profitPercent >= 0.15 && position.holdTimeMinutes < 30) {
      return 'FAST_PUMP';
    }
    if (position.profitPercent >= 0.10 && position.holdTimeMinutes >= 60) {
      return 'SUSTAINED_RALLY';
    }
    return 'STANDARD';
  }

  /**
   * Get recommended profit target for this position based on AI learning
   */
  async getRecommendedTarget(position: PositionContext): Promise<number> {
    const insights = this.learningSystem.getAdaptiveInsights('BULL');
    
    // Base target
    let target = 0.12; // 12% default
    
    // Adjust based on RVOL
    if (position.rvol) {
      if (position.rvol >= 3.0) {
        target = 0.18; // High RVOL tokens can pump harder
      } else if (position.rvol >= 2.0) {
        target = 0.15;
      } else if (position.rvol < 1.5) {
        target = 0.08; // Low RVOL = take profits early
      }
    }
    
    // Adjust based on learned patterns
    const pattern = this.inferPattern(position);
    const learnedPattern = insights.hotPatterns.find((p: any) => 
      p.pattern.toLowerCase().includes(pattern.toLowerCase())
    );
    
    if (learnedPattern && learnedPattern.winRate > 0.6) {
      // High win-rate pattern - use learned average
      target = Math.max(target, learnedPattern.avgProfit);
    }
    
    return Math.min(target, 0.30); // Cap at 30% to avoid greed
  }

  /**
   * Format exit signal for logging
   */
  formatSignal(signal: ExitSignal): string {
    const emoji = signal.shouldExit ? '🔴' : '🟢';
    const urgencyEmoji = {
      LOW: '⚪',
      MEDIUM: '🟡',
      HIGH: '🟠',
      CRITICAL: '🔴'
    }[signal.urgency];
    
    return `${emoji} ${urgencyEmoji} [${signal.confidence.toFixed(0)}%] ${signal.reason}`;
  }
}

// Singleton instance
export const aiDynamicExits = new AIDynamicExitSystem();
