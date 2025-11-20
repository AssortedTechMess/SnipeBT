import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Telegram notification system for trade alerts
export class TradeNotifier {
  private bot: TelegramBot | null = null;
  private chatId: string | null = null;

  constructor() {
    this.initializeBot();
  }

  private initializeBot() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      console.log('Telegram notifications disabled - missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
      return;
    }

    try {
      this.bot = new TelegramBot(token, { polling: false });
      this.chatId = chatId;
      console.log('Telegram notifications enabled');
    } catch (error) {
      console.error('Failed to initialize Telegram bot:', error);
    }
  }

  async sendTradeAlert(trade: {
    type: 'BUY' | 'SELL';
    tokenAddress: string;
    tokenSymbol?: string;
    amount: number;
    price: number;
    totalValue: number;
    pnl?: number;
    pnlPercent?: number;
    timestamp: Date;
    txSignature?: string;
  }) {
    if (!this.bot || !this.chatId) return;

    try {
      const emoji = trade.type === 'BUY' ? '🟢' : '🔴';
      const pnlText = trade.pnl !== undefined ?
        `\n💰 P&L: ${trade.pnl > 0 ? '+' : ''}$${trade.pnl.toFixed(4)} (${trade.pnlPercent?.toFixed(2)}%)` : '';

      const message = `${emoji} **${trade.type} ALERT**

🪙 **Token**: ${trade.tokenSymbol || trade.tokenAddress.substring(0, 8)}...
💵 **Amount**: ${trade.amount.toFixed(4)}
📈 **Price**: $${trade.price.toFixed(6)}
💎 **Total Value**: $${trade.totalValue.toFixed(4)}${pnlText}
⏰ **Time**: ${trade.timestamp.toLocaleString()}

${trade.txSignature ? `🔗 [View Transaction](https://solscan.io/tx/${trade.txSignature})` : ''}`;

      await this.bot.sendMessage(this.chatId, message, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      });

      console.log(`📱 Trade alert sent to Telegram: ${trade.type} ${trade.tokenSymbol || 'UNKNOWN'}`);
    } catch (error) {
      console.error('Failed to send Telegram alert:', error);
    }
  }

  async sendDailySummary(stats: {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    totalPnL: number;
    winRate: number;
    bestTrade: number;
    worstTrade: number;
    totalVolume: number;
  }) {
    if (!this.bot || !this.chatId) return;

    try {
      const message = `📊 **Daily Trading Summary**

📈 **Total Trades**: ${stats.totalTrades}
✅ **Winning Trades**: ${stats.winningTrades}
❌ **Losing Trades**: ${stats.losingTrades}
🎯 **Win Rate**: ${stats.winRate.toFixed(1)}%

💰 **Total P&L**: ${stats.totalPnL > 0 ? '+' : ''}$${stats.totalPnL.toFixed(4)}
💹 **Best Trade**: +$${stats.bestTrade.toFixed(4)}
📉 **Worst Trade**: ${stats.worstTrade.toFixed(4)}
💼 **Total Volume**: $${stats.totalVolume.toFixed(2)}

⏰ **Report Time**: ${new Date().toLocaleString()}`;

      await this.bot.sendMessage(this.chatId, message, {
        parse_mode: 'Markdown'
      });

      console.log('📱 Daily summary sent to Telegram');
    } catch (error) {
      console.error('Failed to send daily summary:', error);
    }
  }

  async sendErrorAlert(error: string, details?: any) {
    if (!this.bot || !this.chatId) return;

    try {
      const message = `🚨 **Bot Error Alert**

❌ **Error**: ${error}
${details ? `📋 **Details**: ${JSON.stringify(details, null, 2)}` : ''}

⏰ **Time**: ${new Date().toLocaleString()}`;

      await this.bot.sendMessage(this.chatId, message, {
        parse_mode: 'Markdown'
      });

      console.log('📱 Error alert sent to Telegram');
    } catch (err) {
      console.error('Failed to send error alert:', err);
    }
  }

  async sendGeneralAlert(message: string) {
    if (!this.bot || !this.chatId) return;

    try {
      await this.bot.sendMessage(this.chatId, message, {
        parse_mode: 'Markdown'
      });

      console.log('📱 General alert sent to Telegram');
    } catch (error) {
      console.error('Failed to send general alert:', error);
    }
  }

  async sendStatusUpdate(status: {
    balance: number;
    baselineBalance: number;
    positions: Array<{
      symbol: string;
      amount: number;
      valueSOL: number;
      entryPrice?: number;
      currentPrice?: number;
      pnlPercent?: number;
    }>;
    recentTrades: Array<{
      type: 'BUY' | 'SELL';
      symbol: string;
      timestamp: Date;
      pnlPercent?: number;
    }>;
    metrics: {
      opportunitiesFound: number;
      successfulTrades: number;
      failedTrades: number;
      totalProfitSOL: number;
      runTimeMinutes: number;
    };
  }) {
    if (!this.bot || !this.chatId) return;

    try {
      const profitSOL = status.balance - status.baselineBalance;
      const profitPercent = ((profitSOL / status.baselineBalance) * 100).toFixed(2);
      const profitEmoji = profitSOL >= 0 ? '📈' : '📉';

      // Calculate total position value
      const totalPositionValue = status.positions.reduce((sum, p) => sum + p.valueSOL, 0);
      
      // Build positions text
      let positionsText = '';
      if (status.positions.length > 0) {
        positionsText = status.positions.map(p => {
          const pnl = p.pnlPercent !== undefined ? ` (${p.pnlPercent >= 0 ? '+' : ''}${p.pnlPercent.toFixed(2)}%)` : '';
          return `  • ${p.symbol}: ${p.amount.toFixed(2)} tokens (~${p.valueSOL.toFixed(4)} SOL)${pnl}`;
        }).join('\n');
      } else {
        positionsText = '  No open positions';
      }

      // Build recent trades text (last hour)
      let tradesText = '';
      if (status.recentTrades.length > 0) {
        tradesText = status.recentTrades.map(t => {
          const emoji = t.type === 'BUY' ? '🟢' : '🔴';
          const pnl = t.pnlPercent !== undefined ? ` ${t.pnlPercent >= 0 ? '+' : ''}${t.pnlPercent.toFixed(2)}%` : '';
          const time = new Date(t.timestamp).toLocaleTimeString();
          return `  ${emoji} ${t.type} ${t.symbol}${pnl} at ${time}`;
        }).join('\n');
      } else {
        tradesText = '  No trades in the past hour';
      }

      const message = `📊 **Bot Status Update**

💰 **Profit/Loss**: ${profitEmoji} ${profitSOL >= 0 ? '+' : ''}${profitSOL.toFixed(4)} SOL (${profitPercent}%)
💵 **Balance**: ${status.balance.toFixed(4)} SOL (started: ${status.baselineBalance.toFixed(4)} SOL)

📦 **Open Positions** (${status.positions.length}):
${positionsText}
${status.positions.length > 0 ? `\n💎 **Total Position Value**: ${totalPositionValue.toFixed(4)} SOL` : ''}

📈 **Recent Trades** (Past Hour):
${tradesText}

📊 **Session Stats**:
  • Opportunities Found: ${status.metrics.opportunitiesFound}
  • Successful Trades: ${status.metrics.successfulTrades}
  • Failed Trades: ${status.metrics.failedTrades}
  • Total Profit: ${status.metrics.totalProfitSOL >= 0 ? '+' : ''}${status.metrics.totalProfitSOL.toFixed(4)} SOL
  • Runtime: ${status.metrics.runTimeMinutes.toFixed(1)} min

⏰ **Updated**: ${new Date().toLocaleString()}`;

      await this.bot.sendMessage(this.chatId, message, {
        parse_mode: 'Markdown'
      });

      console.log('📱 Status update sent to Telegram');
    } catch (error) {
      console.error('Failed to send status update:', error);
    }
  }

  /**
   * Send AI Trade Validation notification (only for rejections or borderline approvals)
   */
  async sendAIValidation(validation: {
    tokenSymbol: string;
    tokenAddress: string;
    approved: boolean;
    confidence: number;
    riskLevel: string;
    reasoning: string;
    warnings: string[];
    signalStrength: number;
  }) {
    if (!this.bot || !this.chatId) return;

    // Only notify if AI rejected OR approved with low confidence
    const shouldNotify = !validation.approved || validation.confidence < 0.6;
    if (!shouldNotify) return;

    try {
      const emoji = validation.approved ? '⚠️' : '❌';
      const action = validation.approved ? 'APPROVED (Low Confidence)' : 'REJECTED';
      
      const message = `🤖 **AI Trade Validator**

${emoji} **${action}**: ${validation.tokenSymbol}
📍 \`${validation.tokenAddress.slice(0, 8)}...\`

📊 **Analysis**:
  • AI Confidence: ${(validation.confidence * 100).toFixed(1)}%
  • Signal Strength: ${(validation.signalStrength * 100).toFixed(1)}%
  • Risk Level: ${validation.riskLevel}

💭 **AI Reasoning**:
${validation.reasoning}

${validation.warnings.length > 0 ? `⚠️ **Warnings**:\n${validation.warnings.map(w => `  • ${w}`).join('\n')}` : ''}

⏰ ${new Date().toLocaleTimeString()}`;

      await this.bot.sendMessage(this.chatId, message, {
        parse_mode: 'Markdown'
      });

      console.log(`📱 AI validation alert sent: ${action}`);
    } catch (error) {
      console.error('Failed to send AI validation alert:', error);
    }
  }

  /**
   * Send AI Candlestick Pattern notification (only for high confidence signals)
   */
  async sendAICandlestickSignal(signal: { tokenSymbol: string; tokenAddress: string; pattern: string; action: 'BUY' | 'SELL' | 'HOLD'; confidence: number; reasoning: string; wickAnalysis?: string; riskLevel: string; }) {
    if (!this.bot || !this.chatId) return;

    // Only notify for 70%+ confidence and actionable signals (BUY/SELL)
    if (signal.confidence < 70 || signal.action === 'HOLD') return;

    try {
      const emoji = signal.action === 'BUY' ? '🟢' : '🔴';
      const riskEmoji = signal.riskLevel === 'HIGH' ? '🔴' : signal.riskLevel === 'MEDIUM' ? '🟡' : '🟢';
      
      const message = `🕯️ **AI Candlestick Alert**

${emoji} **${signal.action}** Signal: ${signal.tokenSymbol}
📍 \`${signal.tokenAddress.slice(0, 8)}...\`

📈 **Pattern**: ${signal.pattern}
🎯 **Confidence**: ${signal.confidence}%
${riskEmoji} **Risk**: ${signal.riskLevel}

💭 **AI Analysis**:
${signal.reasoning}

${signal.wickAnalysis ? `📊 **Wick Analysis**:\n${signal.wickAnalysis}\n` : ''}
⏰ ${new Date().toLocaleTimeString()}`;

      await this.bot.sendMessage(this.chatId, message, {
        parse_mode: 'Markdown'
      });

      console.log(`📱 AI candlestick alert sent: ${signal.pattern} (${signal.confidence}%)`);
    } catch (error) {
      console.error('Failed to send AI candlestick alert:', error);
    }
  }

  /**
   * Send AI Market Regime change notification
   */
  async sendAIRegimeChange(regime: {
    from: string;
    to: string;
    riskAppetite: string;
    positionMultiplier: number;
    reasoning: string;
    confidence: number;
  }) {
    if (!this.bot || !this.chatId) return;

    // Only notify on actual regime changes
    if (regime.from === regime.to) return;

    try {
      const emoji = regime.to === 'BULL' ? '🐂' : regime.to === 'BEAR' ? '🐻' : '〰️';
      
      const message = `📊 **AI Market Regime Change**

${emoji} **${regime.from}** → **${regime.to}**

🎯 **Risk Appetite**: ${regime.riskAppetite}
💰 **Position Sizing**: ${regime.positionMultiplier}x base amount
🔍 **Confidence**: ${(regime.confidence * 100).toFixed(1)}%

💭 **AI Reasoning**:
${regime.reasoning}

⚡ **Action Required**: Position sizes will automatically adjust to ${regime.positionMultiplier}x

⏰ ${new Date().toLocaleTimeString()}`;

      await this.bot.sendMessage(this.chatId, message, {
        parse_mode: 'Markdown'
      });

      console.log(`📱 AI regime change alert sent: ${regime.from} → ${regime.to}`);
    } catch (error) {
      console.error('Failed to send AI regime change alert:', error);
    }
  }

  /**
   * Send AI Position Sizing recommendation (only if significantly different from base)
   */
  async sendAIPositionSize(sizing: {
    tokenSymbol: string;
    baseAmount: number;
    recommendedAmount: number;
    adjustment: number;
    reasoning: string;
    confidence: number;
  }) {
    if (!this.bot || !this.chatId) return;

    // Only notify if adjustment is significant (>20% difference from base)
    const difference = Math.abs(sizing.adjustment - 1.0);
    if (difference < 0.2) return;

    try {
      const emoji = sizing.adjustment > 1.0 ? '📈' : '📉';
      const direction = sizing.adjustment > 1.0 ? 'INCREASED' : 'DECREASED';
      
      const message = `💰 **AI Position Sizing**

${emoji} ${direction} for ${sizing.tokenSymbol}

📊 **Sizing**:
  • Base Amount: ${sizing.baseAmount.toFixed(4)} SOL
  • AI Recommended: ${sizing.recommendedAmount.toFixed(4)} SOL
  • Adjustment: ${sizing.adjustment.toFixed(2)}x (${((sizing.adjustment - 1) * 100).toFixed(1)}%)

🎯 **Confidence**: ${(sizing.confidence * 100).toFixed(1)}%

💭 **AI Reasoning**:
${sizing.reasoning}

⏰ ${new Date().toLocaleTimeString()}`;

      await this.bot.sendMessage(this.chatId, message, {
        parse_mode: 'Markdown'
      });

      console.log(`📱 AI position sizing alert sent: ${sizing.adjustment.toFixed(2)}x`);
    } catch (error) {
      console.error('Failed to send AI position sizing alert:', error);
    }
  }

  /**
   * Send AI Post-Trade Analysis (only for wins/losses with lessons)
   */
  async sendAIPostTradeAnalysis(analysis: {
    tokenSymbol: string;
    outcome: 'WIN' | 'LOSS';
    profitPercent: number;
    expectedVsActual: string;
    successFactors: string[];
    failureFactors: string[];
    lessonsLearned: string[];
    strategyAdjustments: any;
  }) {
    if (!this.bot || !this.chatId) return;

    // Only send if there are actual lessons learned
    if (analysis.lessonsLearned.length === 0) return;

    try {
      const emoji = analysis.outcome === 'WIN' ? '✅' : '❌';
      
      const message = `📚 **AI Post-Trade Learning**

${emoji} **${analysis.outcome}**: ${analysis.tokenSymbol} (${analysis.profitPercent > 0 ? '+' : ''}${analysis.profitPercent.toFixed(2)}%)

📊 **Expected vs Actual**:
${analysis.expectedVsActual}

${analysis.successFactors.length > 0 ? `✅ **Success Factors**:\n${analysis.successFactors.map(f => `  • ${f}`).join('\n')}\n` : ''}
${analysis.failureFactors.length > 0 ? `❌ **Failure Factors**:\n${analysis.failureFactors.map(f => `  • ${f}`).join('\n')}\n` : ''}

💡 **Lessons Learned**:
${analysis.lessonsLearned.map(l => `  • ${l}`).join('\n')}

${Object.keys(analysis.strategyAdjustments).length > 0 ? `🎯 **Strategy Adjustments**:\n${JSON.stringify(analysis.strategyAdjustments, null, 2)}` : ''}

⏰ ${new Date().toLocaleTimeString()}`;

      await this.bot.sendMessage(this.chatId, message, {
        parse_mode: 'Markdown'
      });

      console.log(`📱 AI post-trade analysis sent: ${analysis.outcome}`);
    } catch (error) {
      console.error('Failed to send AI post-trade analysis:', error);
    }
  }
}

// Global notifier instance
export const tradeNotifier = new TradeNotifier();