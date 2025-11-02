import AICandlestickMonitor from './aiCandlestickMonitor';
import { tradeNotifier } from './notifications';

/**
 * Integration of AI Candlestick Monitor with main trading bot
 * 
 * This module:
 * 1. Monitors active positions with AI
 * 2. Provides AI-enhanced entry signals
 * 3. Sends alerts for high-confidence patterns
 */

let aiMonitor: AICandlestickMonitor | null = null;

/**
 * Initialize AI Monitor
 */
export function initializeAIMonitor(grokApiKey: string): void {
  if (!grokApiKey) {
    console.log('[AI Monitor] No Grok API key provided, AI monitoring disabled');
    return;
  }

  try {
    aiMonitor = new AICandlestickMonitor(grokApiKey);
    console.log('[AI Monitor] ✅ AI Candlestick Monitor initialized (xAI Grok)');
  } catch (error) {
    console.error('[AI Monitor] Failed to initialize:', error);
  }
}

/**
 * Start monitoring a token position with AI
 */
export async function monitorTokenWithAI(
  tokenAddress: string,
  symbol: string,
  onHighConfidenceSignal?: (signal: {
    action: 'BUY' | 'SELL' | 'HOLD';
    confidence: number;
    pattern: string;
    reasoning: string;
  }) => void
): Promise<void> {
  if (!aiMonitor) {
    console.log('[AI Monitor] Not initialized, skipping AI monitoring');
    return;
  }

  console.log(`[AI Monitor] 🤖 Starting AI monitoring for ${symbol} (${tokenAddress})`);

  await aiMonitor.startMonitoring(
    tokenAddress,
    async (analysis) => {
      const timestamp = new Date().toLocaleTimeString();
      
      console.log(`\n[AI Monitor] ${timestamp} - ${symbol} Analysis:`);
      console.log(`  Pattern: ${analysis.pattern}`);
      console.log(`  Confidence: ${analysis.confidence}%`);
      console.log(`  Action: ${analysis.action}`);
      console.log(`  Wick Analysis: ${analysis.wickAnalysis}`);
      console.log(`  Volume Confirmed: ${analysis.volumeConfirmation ? '✅' : '❌'}`);
      console.log(`  Risk Level: ${analysis.riskLevel}`);
      console.log(`  Reasoning: ${analysis.reasoning}`);

      // High confidence signal (>70%) with volume confirmation
      if (analysis.confidence >= 70 && analysis.volumeConfirmation) {
        const alertMessage = `🤖 AI HIGH CONFIDENCE SIGNAL
Token: ${symbol}
Pattern: ${analysis.pattern}
Action: ${analysis.action}
Confidence: ${analysis.confidence}%
Risk: ${analysis.riskLevel}

${analysis.reasoning}

Wick: ${analysis.wickAnalysis}`;

        console.log(`\n${'='.repeat(60)}`);
        console.log(alertMessage);
        console.log(`${'='.repeat(60)}\n`);

        // Send Telegram notification
        try {
          if (tradeNotifier) {
            await (tradeNotifier as any).bot?.sendMessage((tradeNotifier as any).chatId, alertMessage, {
              parse_mode: 'HTML',
              disable_web_page_preview: true
            });
          }
        } catch (error) {
          console.error('[AI Monitor] Failed to send Telegram alert:', error);
        }

        // Callback for custom handling
        if (onHighConfidenceSignal) {
          onHighConfidenceSignal({
            action: analysis.action,
            confidence: analysis.confidence,
            pattern: analysis.pattern,
            reasoning: analysis.reasoning
          });
        }
      }

      // Medium confidence warning (50-70%)
      else if (analysis.confidence >= 50 && analysis.volumeConfirmation) {
        console.log(`\n⚠️  AI Medium Confidence Signal (${analysis.confidence}%): ${analysis.action} - ${analysis.pattern}`);
      }

      // Low confidence or no volume
      else {
        console.log(`  ℹ️  AI holding (${analysis.confidence}% confidence, volume: ${analysis.volumeConfirmation ? 'OK' : 'LOW'})`);
      }
    },
    60000 // Check every 1 minute
  );
}

/**
 * Stop monitoring a specific token
 */
export function stopMonitoringToken(tokenAddress: string): void {
  if (aiMonitor) {
    aiMonitor.stopMonitoring(tokenAddress);
  }
}

/**
 * Get AI analysis for a token (one-time, no monitoring)
 */
export async function getAIAnalysis(
  tokenAddress: string
): Promise<{
  pattern: string;
  confidence: number;
  action: 'BUY' | 'SELL' | 'HOLD';
  reasoning: string;
} | null> {
  if (!aiMonitor) {
    return null;
  }

  try {
    // This would need to be implemented in AICandlestickMonitor
    // For now, just log
    console.log(`[AI Monitor] Getting one-time analysis for ${tokenAddress}`);
    return null;
  } catch (error) {
    console.error('[AI Monitor] Error getting AI analysis:', error);
    return null;
  }
}

/**
 * Cleanup on shutdown
 */
export function shutdownAIMonitor(): void {
  if (aiMonitor) {
    aiMonitor.stopAll();
    console.log('[AI Monitor] Shut down all AI monitoring');
  }
}

/**
 * Get currently monitored tokens
 */
export function getMonitoredTokens(): string[] {
  return aiMonitor ? aiMonitor.getMonitoredTokens() : [];
}

export default {
  initializeAIMonitor,
  monitorTokenWithAI,
  stopMonitoringToken,
  getAIAnalysis,
  shutdownAIMonitor,
  getMonitoredTokens
};
