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
}

// Global notifier instance
export const tradeNotifier = new TradeNotifier();