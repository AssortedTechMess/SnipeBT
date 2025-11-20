const {Connection, PublicKey, LAMPORTS_PER_SOL} = require('@solana/web3.js');
require('dotenv').config();

const rpc = new Connection(process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com', {
  commitment: 'confirmed'
});
const wallet = new PublicKey('FTo5dT6yceKUC84odes1rqSE7bxN49WhquUF1oH89T1B');

async function checkBalances() {
  // Check SOL balance
  const solBalance = await rpc.getBalance(wallet);
  console.log(`\n💰 SOL Balance: ${(solBalance / LAMPORTS_PER_SOL).toFixed(5)} SOL\n`);
  
  // Check token balances
  const result = await rpc.getParsedTokenAccountsByOwner(wallet, {
    programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
  });
  
  console.log('🔍 TOKEN HOLDINGS (on-chain):');
  const holdings = result.value.filter(acc => {
    const amount = acc.account.data.parsed.info.tokenAmount.uiAmount;
    return amount !== null && amount > 0;
  });
  
  console.log(`Total tokens held: ${holdings.length}\n`);
  
  if (holdings.length === 0) {
    console.log('  No tokens found (all sold or RPC issue)');
  } else {
    holdings.forEach(acc => {
      const info = acc.account.data.parsed.info;
      console.log(`  Mint: ${info.mint}`);
      console.log(`    Amount: ${info.tokenAmount.uiAmount}`);
      console.log(`    Raw: ${info.tokenAmount.amount}`);
      console.log(`    Decimals: ${info.tokenAmount.decimals}\n`);
    });
  }
}

checkBalances().catch(err => {
  console.error('Error:', err.message);
});
