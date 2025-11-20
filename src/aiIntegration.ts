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

// Track last notification sent per token to prevent spam
const lastNotifications = new Map<string, {
  pattern: string;
  action: string;
  timestamp: number;
}>();

// Don't send same pattern/action combo within 15 minutes
const NOTIFICATION_COOLDOWN_MS = 15 * 60 * 1000;

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
        // Check if we recently sent this same pattern/action notification
        const notificationKey = `${tokenAddress}-${analysis.pattern}-${analysis.action}`;
        const lastNotif = lastNotifications.get(notificationKey);
        const now = Date.now();
        
        // Skip if same pattern/action was sent within cooldown period
        if (lastNotif && (now - lastNotif.timestamp) < NOTIFICATION_COOLDOWN_MS) {
          console.log(`  🔕 Skipping duplicate notification (same ${analysis.pattern}/${analysis.action} sent ${Math.round((now - lastNotif.timestamp) / 1000 / 60)} min ago)`);
          return;
        }
        
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

        // Send AI Candlestick notification using new method
        try {
          await tradeNotifier.sendAICandlestickSignal({
            tokenSymbol: symbol,
            tokenAddress: tokenAddress,
            pattern: analysis.pattern,
            action: analysis.action,
            confidence: analysis.confidence,
            reasoning: analysis.reasoning,
            wickAnalysis: analysis.wickAnalysis,
            riskLevel: analysis.riskLevel
          });
          
          // Record this notification to prevent duplicates
          lastNotifications.set(notificationKey, {
            pattern: analysis.pattern,
            action: analysis.action,
            timestamp: now
          });
          
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
function stopMonitoringToken(tokenAddress: string): void {
  if (aiMonitor) {
    aiMonitor.stopMonitoring(tokenAddress);
  }
  
  // Clear notification history for this token when monitoring stops
  const keysToDelete: string[] = [];
  for (const key of lastNotifications.keys()) {
    if (key.startsWith(tokenAddress)) {
      keysToDelete.push(key);
    }
  }
  keysToDelete.forEach(key => lastNotifications.delete(key));
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
function shutdownAIMonitor(): void {
  if (aiMonitor) {
    aiMonitor.stopAll();
    console.log('[AI Monitor] Shut down all AI monitoring');
  }
  
  // Clear all notification history
  lastNotifications.clear();
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
