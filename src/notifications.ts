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
}

// Global notifier instance
export const tradeNotifier = new TradeNotifier();