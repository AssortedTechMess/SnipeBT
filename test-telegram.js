import { TradeNotifier } from './src/notifications';

async function testTelegram() {
  console.log('🧪 Testing Telegram notifications...');

  const notifier = new TradeNotifier();

  try {
    await notifier.sendTradeAlert({
      type: 'BUY',
      tokenAddress: 'So11111111111111111111111111111111111111112',
      tokenSymbol: 'SOL',
      amount: 0.1,
      price: 150.00,
      totalValue: 0.1,
      timestamp: new Date(),
      txSignature: 'test_signature_123'
    });

    console.log('✅ Test notification sent successfully!');
    console.log('📱 Check your Telegram for the test message.');
  } catch (error) {
    console.log('❌ Failed to send notification:', error instanceof Error ? error.message : error);
  }
}

testTelegram();