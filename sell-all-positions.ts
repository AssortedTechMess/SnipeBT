import { PublicKey, LAMPORTS_PER_SOL, VersionedTransaction } from '@solana/web3.js';
import { initializeAndLog, wallet, rpc } from './src/config';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import axios from 'axios';

const NATIVE_MINT = new PublicKey('So11111111111111111111111111111111111111112');

async function sellAllPositions() {
  console.log('🔄 Starting sell-all process...\n');
  
  // Initialize wallet first
  await initializeAndLog();
  
  console.log(`Wallet: ${wallet.publicKey.toBase58()}`);
  
  // Get all token accounts manually
  const tokenAccounts = await rpc.getParsedTokenAccountsByOwner(
    wallet.publicKey,
    { programId: TOKEN_PROGRAM_ID }
  );
  
  console.log(`\nFound ${tokenAccounts.value.length} token positions\n`);

  if (tokenAccounts.value.length === 0) {
    console.log('✅ No positions to sell!');
    return;
  }

  // Show positions
  console.log('Positions to sell:');
  tokenAccounts.value.forEach((acc, i) => {
    const balance = acc.account.data.parsed.info.tokenAmount.uiAmount;
    const mint = acc.account.data.parsed.info.mint;
    console.log(`${i + 1}. ${mint.substring(0, 8)}... - Balance: ${balance}`);
  });

  console.log(`\n⚠️  About to sell ${tokenAccounts.value.length} positions`);
  console.log('Type YES to confirm: ');

  // Wait for user input
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    readline.question('', async (answer: string) => {
      readline.close();
      
      if (answer.trim().toUpperCase() !== 'YES') {
        console.log('❌ Cancelled');
        resolve(false);
        return;
      }

      console.log('\n🔥 Selling all positions...\n');
      
      let sold = 0;
      for (const acc of tokenAccounts.value) {
        try {
          const mint = acc.account.data.parsed.info.mint;
          const balance = acc.account.data.parsed.info.tokenAmount.uiAmount;
          const decimals = acc.account.data.parsed.info.tokenAmount.decimals;
          const amount = Math.floor(balance * Math.pow(10, decimals));
          
          console.log(`Selling ${mint.substring(0, 8)}... (${balance} tokens)...`);
          
          // Get Jupiter quote to sell token for SOL (using lite-api like the bot does)
          const quoteResponse = await axios.get('https://lite-api.jup.ag/swap/v1/quote', {
            params: {
              inputMint: mint,
              outputMint: NATIVE_MINT.toBase58(),
              amount: amount.toString(),
              slippageBps: 300 // 3% slippage for selling
            }
          });

          if (!quoteResponse.data || !quoteResponse.data.outAmount) {
            console.log(`  ⚠️  No route found for ${mint.substring(0, 8)}...`);
            continue;
          }

          // Get swap transaction from Jupiter lite-api
          const swapResponse = await axios.post('https://lite-api.jup.ag/swap/v1/swap', {
            quoteResponse: quoteResponse.data,
            userPublicKey: wallet.publicKey.toBase58(),
            wrapAndUnwrapSol: true
          });

          if (!swapResponse.data || !swapResponse.data.swapTransaction) {
            console.log(`  ⚠️  No swap transaction returned for ${mint.substring(0, 8)}...`);
            continue;
          }

          // Deserialize and sign the transaction
          const swapTransactionBuf = Buffer.from(swapResponse.data.swapTransaction, 'base64');
          const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
          transaction.sign([wallet]);

          // Send and confirm transaction
          const rawTransaction = transaction.serialize();
          const txid = await rpc.sendRawTransaction(rawTransaction, {
            skipPreflight: true,
            maxRetries: 2
          });

          console.log(`  ✅ Sold ${mint.substring(0, 8)}... (tx: ${txid.substring(0, 8)}...)`);
          sold++;
          
        } catch (error: any) {
          console.log(`  ❌ Error selling: ${error.message}`);
        }
      }

      console.log(`\n✅ Sold ${sold}/${tokenAccounts.value.length} positions`);
      
      const finalBalance = await rpc.getBalance(wallet.publicKey);
      console.log(`Final balance: ${(finalBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
      
      resolve(true);
    });
  });
}

sellAllPositions().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
