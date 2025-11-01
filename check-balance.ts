const { initializeAndLog, rpc, wallet } = require('./src/config');
const { LAMPORTS_PER_SOL } = require('@solana/web3.js');

async function checkBalance() {
  try {
    // Initialize the same way as the bot
    await initializeAndLog();

    const balance = await rpc.getBalance(wallet.publicKey);
    const solBalance = balance / LAMPORTS_PER_SOL;

    const startingBalance = 0.0923;
    const currentProfit = solBalance - startingBalance;
    const progressPercent = (solBalance / startingBalance) * 100;
    const target4x = startingBalance * 4;

    console.log('=== BOT MONITORING STATUS ===');
    console.log('Wallet:', wallet.publicKey.toBase58());
    console.log('Current SOL Balance:', solBalance.toFixed(4));
    console.log('Starting Balance:', startingBalance.toFixed(4), 'SOL');
    console.log('Current Profit:', (currentProfit > 0 ? '+' : '') + currentProfit.toFixed(4), 'SOL');
    console.log('Progress to 4x target:', progressPercent.toFixed(1) + '%');
    console.log('4x Target Amount:', target4x.toFixed(4), 'SOL');
    console.log('Remaining to target:', Math.max(0, target4x - solBalance).toFixed(4), 'SOL');
    console.log('Bot Status: RUNNING (no auto-stop)');
    console.log('Last Updated:', new Date().toLocaleString());
  } catch (error: any) {
    console.error('Error checking balance:', error.message);
  }
}

checkBalance();