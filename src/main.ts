console.log('Script starting...');

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

import { subscribeToNewPools, PoolSubscription } from './stream';
import { fetchNewTokens, validateToken } from './validate';
import { executeSnipeSwap, executeRoundTripSwap, previewRoundTrip, executeMultiInputSwap } from './trade';
import { calculatePositionSize, estimateExpectedUpside } from './utils';
import { checkAndTakeProfit, getHeldPositions, checkAndStopLoss, setEntryPrice, getEntryPrice } from './positionManager';
import { 
  rpc, 
  wallet, 
  CONSTANTS, 
  getConnectionHealth, 
  initializeAndLog 
} from './config';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { tradeNotifier } from './notifications';
import { initializeStrategies, validateTokenWithStrategies, strategyManager } from './strategyIntegration';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// File to persist trade history
const TRADE_HISTORY_FILE = path.join(__dirname, '..', 'tradeHistory.json');

// Load trade history from file
function loadTradeHistory(): Array<{ type: 'BUY' | 'SELL'; symbol: string; timestamp: string; pnlPercent?: number }> {
  try {
    if (fs.existsSync(TRADE_HISTORY_FILE)) {
      const data = fs.readFileSync(TRADE_HISTORY_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading trade history:', error);
  }
  return [];
}

// Save trade history to file
function saveTradeHistory(trades: Array<{ type: 'BUY' | 'SELL'; symbol: string; timestamp: Date | string; pnlPercent?: number }>) {
  try {
    // Convert Date objects to ISO strings for JSON serialization
    const serializable = trades.map(t => ({
      ...t,
      timestamp: t.timestamp instanceof Date ? t.timestamp.toISOString() : t.timestamp
    }));
    fs.writeFileSync(TRADE_HISTORY_FILE, JSON.stringify(serializable, null, 2));
  } catch (error) {
    console.error('Error saving trade history:', error);
  }
}

// Function to fix missing entry prices for existing positions
async function fixMissingEntryPrices() {
  try {
    const positions = await getHeldPositions();
    console.log(`Checking ${positions.length} positions for missing entry prices...`);

    for (const pos of positions) {
      const existingPrice = getEntryPrice(pos.mint);
      if (!existingPrice) {
        console.log(`Position ${pos.mint} missing entry price, attempting to set...`);

        // Try to get current price from multiple sources
        let currentPrice = null;

        try {
          const dexRes = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${pos.mint}`, { timeout: 3000 });
          const pair = dexRes.data.pairs?.[0];
          if (pair?.priceUsd) {
            currentPrice = parseFloat(pair.priceUsd);
          }
        } catch (e) {
          // Try Jupiter as fallback
          try {
            const jupiterRes = await axios.get(`https://price.jup.ag/v4/price?ids=${pos.mint}`, { timeout: 3000 });
            const priceData = jupiterRes.data.data?.[pos.mint];
            if (priceData?.price) {
              currentPrice = parseFloat(priceData.price);
            }
          } catch (jupiterError) {
            console.log(`Could not get price for ${pos.mint}`);
          }
        }

        if (currentPrice) {
          // For existing positions, we use current price as entry price
          // This isn't perfect but better than no entry price for stop-loss
          setEntryPrice(pos.mint, currentPrice);
          console.log(`✅ Set entry price for existing position ${pos.mint}: $${currentPrice.toFixed(6)}`);
        } else {
          console.warn(`❌ Could not determine price for existing position ${pos.mint}`);
        }
      }
    }
  } catch (error) {
    console.error('Error fixing missing entry prices:', error);
  }
}

// CLI flags for targeted testing and tuning
const ARG = (name: string) => {
  const idx = process.argv.indexOf(name);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : '';
};
const ARG_NUM = (name: string) => {
  const v = ARG(name);
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

// Strategy mode selection
const STRATEGY_MODE = ARG('--strategy-mode') || process.env.STRATEGY_MODE || 'emperorBTC';
const USE_STRATEGIES = process.argv.includes('--use-strategies') || process.env.USE_STRATEGIES === 'true' || STRATEGY_MODE !== undefined;

// Allow buying on HOLD decisions (when token passed validation but strategy says wait)
const ALLOW_HOLD_BUYS = process.argv.includes('--allow-hold-buys') || process.env.ALLOW_HOLD_BUYS === 'true';
const MIN_HOLD_CONFIDENCE = (() => {
  const cli = ARG_NUM('--min-hold-confidence');
  if (cli && cli > 0) return cli;
  const envVal = Number(process.env.MIN_HOLD_CONFIDENCE || '');
  // If HOLD has 40%+ confidence, it's worth buying (token passed validation)
  return Number.isFinite(envVal) && envVal > 0 ? envVal : 0.4;
})();

const SKIP_VALIDATE = process.argv.includes('--skip-validate');
const FORCED_TOKEN = ARG('--token');
const ROUND_TRIP = process.argv.includes('--roundtrip') || process.env.ROUND_TRIP === 'true';
const AUTO_TAKEPROFIT = process.argv.includes('--auto-tp') || process.env.AUTO_TAKEPROFIT === 'true';
const TAKEPROFIT_MIN_PCT = (() => {
  const cli = ARG_NUM('--tp-min-pct');
  if (cli && cli > 0) return cli;
  const envVal = Number(process.env.TAKEPROFIT_MIN_PCT || '');
  // Lowered to 2% for faster profit-taking in high-volume markets - covers fees + small profit
  return Number.isFinite(envVal) && envVal > 0 ? envVal : 2.0;
})();
const TAKEPROFIT_CHECK_INTERVAL_MS = (() => {
  const cli = ARG_NUM('--tp-interval-ms');
  if (cli && cli > 0) return cli;
  const envVal = Number(process.env.TAKEPROFIT_CHECK_INTERVAL_MS || '');
  return Number.isFinite(envVal) && envVal > 0 ? envVal : 60000; // Check every 60 seconds (was 30s)
})();
const AUTO_STOPLOSS = process.argv.includes('--auto-sl') || process.env.AUTO_STOPLOSS === 'true';
const STOPLOSS_PCT = (() => {
  const cli = ARG_NUM('--sl-pct');
  if (cli && cli > 0) return cli;
  const envVal = Number(process.env.STOPLOSS_PCT || '');
  return Number.isFinite(envVal) && envVal > 0 ? envVal : 20;
})();
const STOPLOSS_CHECK_INTERVAL_MS = (() => {
  const cli = ARG_NUM('--sl-interval-ms');
  if (cli && cli > 0) return cli;
  const envVal = Number(process.env.STOPLOSS_CHECK_INTERVAL_MS || '');
  return Number.isFinite(envVal) && envVal > 0 ? envVal : 30000;
})();
const MULTI_INPUT_ENABLED = process.argv.includes('--multi-input') || process.env.MULTI_INPUT_ENABLED === 'true';
const SEEN_TTL_MIN = (() => {
  const cli = ARG_NUM('--seen-ttl-mins');
  if (cli && cli > 0) return cli;
  const envVal = Number(process.env.SEEN_TTL_MINS || '');
  return Number.isFinite(envVal) && envVal > 0 ? envVal : 15;
})();
const recentlyAnalyzed = new Map<string, number>();
const isRecentlyAnalyzed = (addr: string) => {
  const exp = recentlyAnalyzed.get(addr);
  if (!exp) return false;
  if (Date.now() < exp) return true;
  recentlyAnalyzed.delete(addr);
  return false;
};
const markAnalyzed = (addr: string) => {
  recentlyAnalyzed.set(addr, Date.now() + SEEN_TTL_MIN * 60 * 1000);
};
const TARGET_MULT = (() => {
  const cli = ARG_NUM('--target-mult');
  if (cli && cli > 1) return cli;
  const envVal = Number(process.env.PROFIT_TARGET_MULT || '');
  return Number.isFinite(envVal) && envVal > 1 ? envVal : undefined;
})();

let activeSubscriptions: PoolSubscription | null = null;
const activeTransactions = new Set<string>();
const tokenBlacklist = new Set<string>();
let cachedHeldPositions: any[] = []; // Cache positions to avoid RPC spam
const recentTrades: Array<{ type: 'BUY' | 'SELL'; symbol: string; timestamp: Date; pnlPercent?: number }> = loadTradeHistory().map(t => ({
  ...t,
  timestamp: new Date(t.timestamp)
})); // Load trade history from file
const metrics = {
  opportunitiesFound: 0,
  successfulTrades: 0,
  failedTrades: 0,
  totalProfit: 0,
  startTime: Date.now(),
  endTime: 0
};
let BASELINE_BALANCE_SOL = 0;

const TRADE_CONFIG = {
  maxConcurrentTrades: 10,  // INCREASED to allow new big positions alongside old small ones
  minProfitThreshold: 0.005,  // 0.5% - aggressive but still safe
  maxSlippageBps: 150,  // Increased from 100 - allows trades on less liquid tokens
  tradeAmountSol: 0.15,  // INCREASED from 0.06 to 0.15 (~$28 per trade) for REAL profits
  riskPercent: 0.02,
  minTradeSol: 0.05,  // Increased from 0.01 - bigger minimum for better profit per trade
  maxTradeSol: 0.2,  // INCREASED from 0.06 to 0.2 (~$37 max) - go big!
  dryRun: !(process.argv.includes('--live') || process.env.DRY_RUN === 'false'),
  monitoringIntervalMs: 30000, // Back to 30s - faster scanning with more capital
  errorRetryDelayMs: 5000,
  maxDailyTrades: 100,
};

const overrideMinProfit = ARG_NUM('--min-profit');
if (overrideMinProfit !== undefined) TRADE_CONFIG.minProfitThreshold = overrideMinProfit;
const overrideSlippage = ARG_NUM('--slippage-bps');
if (overrideSlippage !== undefined) TRADE_CONFIG.maxSlippageBps = overrideSlippage;
const overrideRisk = ARG_NUM('--risk');
if (overrideRisk !== undefined) TRADE_CONFIG.riskPercent = overrideRisk;
const overrideMinTrade = ARG_NUM('--min-trade');
if (overrideMinTrade !== undefined) TRADE_CONFIG.minTradeSol = overrideMinTrade;
const overrideMaxTrade = ARG_NUM('--max-trade');
if (overrideMaxTrade !== undefined) TRADE_CONFIG.maxTradeSol = overrideMaxTrade;
const overrideAmount = ARG_NUM('--amount-sol');
if (overrideAmount !== undefined) TRADE_CONFIG.tradeAmountSol = overrideAmount;

const ONESHOT = process.argv.includes('--once');

// Safety: require explicit confirmation for live mode unless --confirm-live is passed

async function confirmLiveOrExit(): Promise<void> {
  const live = process.argv.includes('--live') || process.env.DRY_RUN === 'false';
  const bypass = process.argv.includes('--confirm-live');
  if (!live || bypass) return;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => {
    rl.question('\nLIVE MODE ENABLED. This will execute REAL on-chain trades.\nType CONFIRM to proceed (or anything else to abort): ', (ans) => {
      resolve(ans || '');
    });
  });
  rl.close();
  if (answer.trim() !== 'CONFIRM') {
    console.log('Live execution aborted by user (confirmation not provided).');
    process.exit(0);
  }
  console.log('Live confirmation accepted — proceeding with live execution.');
}

const handleError = async (error: unknown, context: string) => {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  console.error(`Error in ${context}:`, errorMessage);
  if (errorMessage.includes('insufficient balance') || errorMessage.includes('Rate limit exceeded')) {
    await stopBot('Critical error: ' + errorMessage);
  }
};

const stopBot = async (reason: string) => {
  console.log(`Stopping bot: ${reason}`);
  if (activeSubscriptions) {
    try {
      activeSubscriptions.unsubscribe();
      activeSubscriptions = null;
    } catch (error) {
      console.error('Error during unsubscribe:', error);
    }
  }
  const runTime = (Date.now() - metrics.startTime) / (1000 * 60 * 60);
  console.log('Final Performance Metrics:', {
    ...metrics,
    runTimeHours: runTime.toFixed(2),
    successRate: ((metrics.successfulTrades / (metrics.successfulTrades + metrics.failedTrades)) * 100).toFixed(2) + '%',
    averageHourlyTrades: (metrics.successfulTrades / runTime).toFixed(2),
    averageProfitPerTrade: (metrics.totalProfit / metrics.successfulTrades).toFixed(4) + ' SOL'
  });
  process.exit(0);
};

const evaluateBestRoute = async (
  targetMint: string,
  solAmount: number
): Promise<{ useSol: boolean; inputMint?: string; inputAmount?: bigint; netExpected?: number }> => {
  if (!MULTI_INPUT_ENABLED) return { useSol: true };
  try {
    const positions = await getHeldPositions();
    if (!positions || positions.length === 0) return { useSol: true };
    const stables = ['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'];
    const nonStables = positions.filter(p => !stables.includes(p.mint));
    if (nonStables.length === 0) return { useSol: true };
    const candidate = nonStables.reduce((prev, curr) => BigInt(curr.amount) > BigInt(prev.amount) ? curr : prev);
    console.log(`Evaluating multi-input route: ${candidate.mint.slice(0, 8)}... (${candidate.amount.slice(0, 6)}...) vs SOL`);
    const axios = await import('axios');
    const quoteHolding = await axios.default.get(
      `${process.env.JUPITER_QUOTE_URL || 'https://lite-api.jup.ag'}/swap/v1/quote`,
      { params: { inputMint: candidate.mint, outputMint: targetMint, amount: candidate.amount, slippageBps: TRADE_CONFIG.maxSlippageBps }, timeout: 8000 }
    ).then(r => r.data).catch(() => null);
    if (!quoteHolding || !quoteHolding.outAmount) {
      console.log('Multi-input quote failed; falling back to SOL');
      return { useSol: true };
    }
    const outAmountHolding = BigInt(quoteHolding.outAmount);
    const impactHolding = parseFloat(quoteHolding.priceImpactPct || '0');
    const quoteSol = await axios.default.get(
      `${process.env.JUPITER_QUOTE_URL || 'https://lite-api.jup.ag'}/swap/v1/quote`,
      { params: { inputMint: CONSTANTS.NATIVE_MINT.toBase58(), outputMint: targetMint, amount: Math.floor(solAmount * LAMPORTS_PER_SOL).toString(), slippageBps: TRADE_CONFIG.maxSlippageBps }, timeout: 8000 }
    ).then(r => r.data).catch(() => null);
    if (!quoteSol || !quoteSol.outAmount) {
      console.log('SOL quote failed; cannot compare routes');
      return { useSol: true };
    }
    const outAmountSol = BigInt(quoteSol.outAmount);
    const impactSol = parseFloat(quoteSol.priceImpactPct || '0');
    const scoreHolding = Number(outAmountHolding) * (1 - impactHolding / 100);
    const scoreSol = Number(outAmountSol) * (1 - impactSol / 100);
    console.log(`Route comparison: holding score=${scoreHolding.toFixed(0)}, SOL score=${scoreSol.toFixed(0)}`);
    if (scoreHolding > scoreSol * 1.05) {
      console.log(`Using holding ${candidate.mint.slice(0, 8)}... as input (better route)`);
      return { useSol: false, inputMint: candidate.mint, inputAmount: BigInt(candidate.amount), netExpected: (scoreHolding - scoreSol) / scoreSol };
    } else {
      console.log('Using SOL as input (best route)');
      return { useSol: true };
    }
  } catch (err) {
    console.warn('Multi-input evaluation failed:', err instanceof Error ? err.message : err);
    return { useSol: true };
  }
};

const initializeMetrics = () => {
  if (process.argv.includes('--hours')) {
    const hours = parseFloat(process.argv[process.argv.indexOf('--hours') + 1]);
    if (!isNaN(hours)) {
      metrics.endTime = Date.now() + (hours * 60 * 60 * 1000);
      console.log(`Bot will run for ${hours} hours until ${new Date(metrics.endTime).toISOString()}`);
    } else {
      console.error('Invalid --hours value provided');
      process.exit(1);
    }
  } else {
    metrics.endTime = 0;
  }
};

const processTradeOpportunity = async (tokenAddress: string) => {
  // In strategy mode, let strategies decide - don't skip based on "recently analyzed"
  if (!USE_STRATEGIES && isRecentlyAnalyzed(tokenAddress)) {
    console.log('Recently analyzed, skipping', tokenAddress);
    return;
  }
  if (activeTransactions.size >= TRADE_CONFIG.maxConcurrentTrades) {
    console.log('Max concurrent trades reached, skipping opportunity');
    return;
  }
  if (!SKIP_VALIDATE && tokenBlacklist.has(tokenAddress)) {
    console.log('Token in blacklist, skipping');
    return;
  }
  
  // PROFIT-FOCUSED: Don't buy more if we already hold this token (let auto-TP manage exit)
  // Use cached positions to avoid RPC spam
  const alreadyHolding = cachedHeldPositions.some(p => p.mint === tokenAddress);
  if (alreadyHolding) {
    console.log(`Already holding ${tokenAddress}, skipping buy (position being managed by auto-TP)`);
    return;
  }
  
  try {
    metrics.opportunitiesFound++;
    if (!getConnectionHealth()) {
      throw new Error('RPC connection unhealthy');
    }
    const balanceLamports = await rpc.getBalance(wallet.publicKey);
    const balanceSol = balanceLamports / LAMPORTS_PER_SOL;
    const dynamicSize = calculatePositionSize(balanceSol, TRADE_CONFIG.riskPercent, TRADE_CONFIG.maxTradeSol, TRADE_CONFIG.minTradeSol);
    let isValid = true;
    let strategyDecision: any = null;
    
    // Use strategy-based validation if enabled
    if (USE_STRATEGIES && !SKIP_VALIDATE) {
      console.log(`Validating token: ${tokenAddress}`);
      const validation = await validateTokenWithStrategies(tokenAddress);
      isValid = validation.isValid;
      strategyDecision = validation.decision;
      
      // Check if HOLD should be treated as BUY
      const isHoldWithGoodConfidence = !isValid && 
        strategyDecision?.finalAction === 'HOLD' && 
        strategyDecision?.confidence >= MIN_HOLD_CONFIDENCE;
      
      if (ALLOW_HOLD_BUYS && isHoldWithGoodConfidence) {
        console.log(`✅ Token ${tokenAddress} HOLD decision with ${(strategyDecision.confidence * 100).toFixed(1)}% confidence - treating as BUY`);
        console.log(`   Reason: ${strategyDecision.reason}`);
        isValid = true; // Convert HOLD to BUY
      } else if (!isValid) {
        console.log(`Token ${tokenAddress} rejected by strategies: ${validation.reason}`);
        // Only blacklist hard failures (rug check, liquidity) - not strategy HOLD decisions
        if (validation.shouldBlacklist) {
          tokenBlacklist.add(tokenAddress);
          console.log(`  ⛔ Blacklisted (hard failure)`);
        } else {
          console.log(`  ⏸️ Not blacklisted (will re-evaluate when market changes)`);
        }
        markAnalyzed(tokenAddress);
        return;
      }
      
      if (isValid) {
        console.log(`✅ Token ${tokenAddress} approved by strategies`);
        console.log(`   Strategy: ${strategyDecision.reason}`);
        console.log(`   Confidence: ${(strategyDecision.confidence * 100).toFixed(1)}%`);
      }
    } else if (!SKIP_VALIDATE) {
      // Fallback to basic validation
      console.log(`Validating token: ${tokenAddress}`);
      isValid = await validateToken(tokenAddress);
      if (!isValid) {
        tokenBlacklist.add(tokenAddress);
        markAnalyzed(tokenAddress);
        return;
      }
    } else {
      console.log('Skipping validation due to --skip-validate flag');
    }
    if (!TRADE_CONFIG.dryRun) {
      try {
        const probe = await executeSnipeSwap(tokenAddress, dynamicSize || TRADE_CONFIG.tradeAmountSol, { slippageBps: TRADE_CONFIG.maxSlippageBps, maxRetries: 1, timeoutMs: 8000, dryRun: true });
        const costPercent = probe?.costPercent ?? 0;
        const expectedUpside = await estimateExpectedUpside(tokenAddress);
        const netExpected = expectedUpside - costPercent;
        console.log(`Pre-trade check for ${tokenAddress}: cost%=${(costPercent * 100).toFixed(2)}%, upside=${(expectedUpside * 100).toFixed(2)}%, net=${(netExpected * 100).toFixed(2)}% (min=${(TRADE_CONFIG.minProfitThreshold * 100).toFixed(2)}%)`);
        if (netExpected < TRADE_CONFIG.minProfitThreshold) {
          console.log(`Skipping live trade for ${tokenAddress} — net expected ${(netExpected * 100).toFixed(2)}% < min ${(TRADE_CONFIG.minProfitThreshold * 100).toFixed(2)}%`);
          return;
        }
      } catch (probeErr) {
        console.warn(`Pre-trade probe failed for ${tokenAddress}:`, probeErr instanceof Error ? probeErr.message : probeErr);
        return;
      }
    }
    const route = await evaluateBestRoute(tokenAddress, dynamicSize || TRADE_CONFIG.tradeAmountSol);
    let tradeResult: any;
    if (!route.useSol && route.inputMint && route.inputAmount) {
      console.log(`Executing multi-input swap: ${route.inputMint.slice(0, 8)}... -> ${tokenAddress.slice(0, 8)}...`);
      tradeResult = await executeMultiInputSwap(route.inputMint, route.inputAmount, tokenAddress, TRADE_CONFIG.maxSlippageBps, TRADE_CONFIG.dryRun, 10000);
      if (!TRADE_CONFIG.dryRun && tradeResult.signature !== 'DRY_RUN') {
        console.log('Multi-input swap executed; routing back to SOL via auto take-profit');
      }
    } else if (!TRADE_CONFIG.dryRun && ROUND_TRIP) {
      console.log('Round-trip mode enabled: previewing two-leg SOL->token->SOL');
      try {
        const preview = await previewRoundTrip(tokenAddress, dynamicSize || TRADE_CONFIG.tradeAmountSol, TRADE_CONFIG.maxSlippageBps, 10000);
        const estNetPct = (Number(preview.estFinalLamports - preview.inputLamports) / Number(preview.inputLamports)) * 100;
        console.log(`Round-trip preview net: ${estNetPct.toFixed(2)}%`);
      } catch (e) {
        console.warn('Round-trip preview failed; skipping this token for safety');
        return;
      }
      tradeResult = await executeRoundTripSwap(tokenAddress, dynamicSize || TRADE_CONFIG.tradeAmountSol, { slippageBps: TRADE_CONFIG.maxSlippageBps, maxRetries: 2, timeoutMs: 10000, dryRun: false, minProfitThresholdPct: TRADE_CONFIG.minProfitThreshold * 100 });
    } else {
      tradeResult = await executeSnipeSwap(tokenAddress, dynamicSize || TRADE_CONFIG.tradeAmountSol, { slippageBps: TRADE_CONFIG.maxSlippageBps, maxRetries: 2, timeoutMs: 10000, dryRun: TRADE_CONFIG.dryRun });
    }
    // Set entry price for stop loss tracking - more robust implementation
    if (!TRADE_CONFIG.dryRun && tradeResult.signature !== 'DRY_RUN') {
      try {
        // Try multiple sources for price data
        let entryPrice = null;

        // First try Dexscreener
        try {
          const dexRes = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`, { timeout: 3000 });
          const pair = dexRes.data.pairs?.[0];
          if (pair?.priceUsd) {
            entryPrice = parseFloat(pair.priceUsd);
          }
        } catch (dexError) {
          console.log(`Dexscreener failed for entry price, trying Jupiter...`);
        }

        // Fallback to Jupiter API
        if (!entryPrice) {
          try {
            const jupiterRes = await axios.get(`https://price.jup.ag/v4/price?ids=${tokenAddress}`, { timeout: 3000 });
            const priceData = jupiterRes.data.data?.[tokenAddress];
            if (priceData?.price) {
              entryPrice = parseFloat(priceData.price);
            }
          } catch (jupiterError) {
            console.log(`Jupiter API also failed for entry price`);
          }
        }

        // Last resort: estimate based on trade amount
        if (!entryPrice) {
          // Rough estimate: assume token price gives us reasonable distribution
          entryPrice = 0.01; // Conservative default
          console.log(`Using estimated entry price for ${tokenAddress}: $${entryPrice}`);
        }

        if (entryPrice) {
          setEntryPrice(tokenAddress, entryPrice);
          console.log(`✅ Set entry price for ${tokenAddress}: $${entryPrice.toFixed(6)}`);
        } else {
          console.warn(`❌ Could not determine entry price for ${tokenAddress}`);
        }
      } catch (e) {
        console.warn(`Failed to set entry price for ${tokenAddress}:`, e instanceof Error ? e.message : e);
      }
    }
    if (tradeResult.success) {
      metrics.successfulTrades++;
      console.log(`Successful trade: ${tradeResult.signature}`);

      // Send Telegram notification for successful trade
      try {
        const dexRes = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`, { timeout: 3000 });
        const pair = dexRes.data.pairs?.[0];
        const entryPrice = pair?.priceUsd ? parseFloat(pair.priceUsd) : 0;

        // Track trade for status updates
        recentTrades.push({
          type: 'BUY',
          symbol: pair?.baseToken?.symbol || 'UNKNOWN',
          timestamp: new Date(),
          pnlPercent: undefined
        });
        saveTradeHistory(recentTrades);

        await tradeNotifier.sendTradeAlert({
          type: 'BUY',
          tokenAddress,
          tokenSymbol: pair?.baseToken?.symbol || 'UNKNOWN',
          amount: dynamicSize || TRADE_CONFIG.tradeAmountSol,
          price: entryPrice,
          totalValue: (dynamicSize || TRADE_CONFIG.tradeAmountSol),
          timestamp: new Date(),
          txSignature: tradeResult.signature
        });
      } catch (notifyError) {
        console.warn('Failed to send trade notification:', notifyError instanceof Error ? notifyError.message : notifyError);
      }
    }
    markAnalyzed(tokenAddress);
  } catch (error) {
    metrics.failedTrades++;
    await handleError(error, `Trade processing for ${tokenAddress}`);
    markAnalyzed(tokenAddress);
  }
};

const sendPeriodicStatusUpdate = async () => {
  try {
    const balanceLamports = await rpc.getBalance(wallet.publicKey);
    const currentBalance = balanceLamports / LAMPORTS_PER_SOL;
    
    // Get current positions with prices
    const positions = await getHeldPositions();
    const positionsWithPrices = await Promise.all(
      positions
        .filter(p => p.mint !== 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') // Skip USDC
        .map(async (p) => {
          const entryPrice = getEntryPrice(p.mint);
          let currentPrice = 0;
          let pnlPercent = undefined;
          let symbol = 'UNKNOWN';
          
          try {
            const dexRes = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${p.mint}`, { timeout: 5000 });
            const pair = dexRes.data.pairs?.[0];
            currentPrice = pair?.priceUsd ? parseFloat(pair.priceUsd) : 0;
            symbol = pair?.baseToken?.symbol || 'UNKNOWN';
            
            if (entryPrice && currentPrice > 0) {
              pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
            }
          } catch (e) {
            // Silent fail for price fetch
          }

          // Estimate value in SOL
          const valueSOL = p.uiAmount * currentPrice / 150; // Rough SOL conversion (assuming SOL ~$150)
          
          return {
            symbol,
            amount: p.uiAmount,
            valueSOL,
            entryPrice: entryPrice ?? undefined, // Convert null to undefined
            currentPrice,
            pnlPercent
          };
        })
    );

    // Get trades from the past hour
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    const recentHourTrades = recentTrades.filter(t => t.timestamp.getTime() > oneHourAgo);

    await tradeNotifier.sendStatusUpdate({
      balance: currentBalance,
      baselineBalance: BASELINE_BALANCE_SOL,
      positions: positionsWithPrices,
      recentTrades: recentHourTrades,
      metrics: {
        opportunitiesFound: metrics.opportunitiesFound,
        successfulTrades: metrics.successfulTrades,
        failedTrades: metrics.failedTrades,
        totalProfitSOL: metrics.totalProfit,
        runTimeMinutes: (Date.now() - metrics.startTime) / 1000 / 60
      }
    });
  } catch (error) {
    console.error('Failed to send periodic status update:', error);
  }
};

const main = async () => {
  try {
    console.log('Bot starting up...');
    // Confirm live execution if requested
    await confirmLiveOrExit();
    initializeMetrics();
    console.log(`Time limit set: Will run until ${new Date(metrics.endTime).toISOString()}`);
    console.log('Initializing configuration...');
    await initializeAndLog();
    
    // Initialize multi-strategy system
    console.log('🧠 Initializing multi-strategy trading system...');
    await initializeStrategies();
    
    try {
      const baseLamports = await rpc.getBalance(wallet.publicKey);
      BASELINE_BALANCE_SOL = baseLamports / LAMPORTS_PER_SOL;
      console.log(`Baseline balance set: ${BASELINE_BALANCE_SOL.toFixed(4)} SOL`);
      if (TARGET_MULT) {
        console.log(`Profit target active: ×${TARGET_MULT} ⇒ ${(BASELINE_BALANCE_SOL * TARGET_MULT).toFixed(4)} SOL`);
        
        // Set session baseline for EmperorBTC strategy if active
        const emperorStrategy = strategyManager?.getActiveStrategies().includes('emperorBTC');
        if (emperorStrategy) {
          await import('./strategies/emperorBTCStrategy');
          const empStrategy = strategyManager as any;
          const empInstance = empStrategy.strategies?.get?.('emperorBTC') as any;
          if (empInstance?.setSessionBaseline) {
            empInstance.setSessionBaseline(BASELINE_BALANCE_SOL, TARGET_MULT);
          }
        }
      }
    } catch (e) {
      console.warn('Unable to establish baseline balance for profit target:', e instanceof Error ? e.message : e);
    }

    // Fix missing entry prices for existing positions
    await fixMissingEntryPrices();

    console.log('Trade Configuration:', { ...TRADE_CONFIG, environment: process.env.ENVIRONMENT, profitTargetMultiplier: TARGET_MULT });
    if (FORCED_TOKEN) {
      console.log(`Forced token mode: attempting ${FORCED_TOKEN} (${SKIP_VALIDATE ? 'validation skipped' : 'with validation'})`);
      await processTradeOpportunity(FORCED_TOKEN);
      await stopBot('Forced token test complete');
      return;
    }
    if (ONESHOT) {
      console.log('Running in one-shot test mode (--once)');
      const tokens = await fetchNewTokens();
      console.log(`Found ${tokens.length} tokens to analyze`);
      for (const token of tokens) {
        await processTradeOpportunity(token.baseToken.address);
      }
      console.log('One-shot run complete; exiting.');
      await stopBot('One-shot test complete');
      return;
    }
    activeSubscriptions = subscribeToNewPools(async (_sig, slot) => {
      try {
        console.log(`New opportunity detected at slot ${slot}`);
        const tokens = await fetchNewTokens();
        for (const token of tokens) {
          await processTradeOpportunity(token.baseToken.address);
        }
      } catch (err) {
        await handleError(err, 'Pool subscription callback');
      }
    });
    const scanAndMonitor = async () => {
      console.log('\n--- Starting scan cycle ---');
      console.log('Scanning for new tokens...');
      
      // PROFIT-FOCUSED: Fetch held positions ONCE per cycle (not per token) to avoid RPC spam
      try {
        cachedHeldPositions = await getHeldPositions();
        console.log(`Currently holding ${cachedHeldPositions.length} positions`);
      } catch (e) {
        console.warn('Failed to fetch positions (using empty cache):', e instanceof Error ? e.message : e);
        cachedHeldPositions = [];
      }
      
      const tokens = await fetchNewTokens();
      const fresh = tokens.filter((t: any) => !isRecentlyAnalyzed(t.baseToken.address));
      console.log(`Found ${tokens.length} tokens; ${fresh.length} new to analyze (seen TTL ${SEEN_TTL_MIN}m)`);
      
      // Process ALL tokens that passed initial filters, not just fresh ones
      // The strategy system will decide if they're worth trading
      const tokensToAnalyze = USE_STRATEGIES ? tokens : fresh;
      console.log(`Analyzing ${tokensToAnalyze.length} tokens (strategy mode: ${USE_STRATEGIES ? 'ALL tokens' : 'fresh only'})`);
      
      if (tokensToAnalyze.length > 0) {
        for (const token of tokensToAnalyze) {
          console.log(`Processing token: ${token.baseToken.address}`);
          await processTradeOpportunity(token.baseToken.address);
        }
      }
      console.log('\nCurrent Metrics:', {
        opportunitiesFound: metrics.opportunitiesFound, successfulTrades: metrics.successfulTrades,
        failedTrades: metrics.failedTrades, runTime: `${((Date.now() - metrics.startTime) / 1000 / 60).toFixed(2)} minutes`
      });
      if (metrics.endTime) {
        const remainingTime = (metrics.endTime - Date.now()) / 1000;
        console.log(`Time remaining: ${remainingTime.toFixed(0)} seconds`);
      }
    };
    console.log('\nStarting monitoring cycle...');
    
    // Send initial status update
    setTimeout(() => sendPeriodicStatusUpdate(), 5000); // Wait 5s for first scan to complete
    
    setInterval(async () => {
      try {
        await scanAndMonitor();
      } catch (err) {
        await handleError(err, 'Periodic scan cycle');
      }
    }, TRADE_CONFIG.monitoringIntervalMs);
    scanAndMonitor().catch(async (err) => {
      await handleError(err, 'Initial scan cycle');
    });
    console.log(`SnipeBT v2 running in ${process.env.ENVIRONMENT} mode. Press Ctrl+C to stop.`);
    process.on('SIGINT', () => stopBot('User interrupted'));
    process.on('SIGTERM', () => stopBot('Termination signal received'));
    if (AUTO_TAKEPROFIT) {
      console.log(`Auto take-profit enabled: checking every ${TAKEPROFIT_CHECK_INTERVAL_MS / 1000}s, min profit ${TAKEPROFIT_MIN_PCT}%`);
      setInterval(async () => {
        try {
          const sigs = await checkAndTakeProfit(TAKEPROFIT_MIN_PCT, TRADE_CONFIG.maxSlippageBps, TRADE_CONFIG.dryRun);
          if (sigs.length > 0) {
            console.log(`Auto take-profit executed ${sigs.length} sells:`, sigs);
            metrics.successfulTrades += sigs.length;

            // Send notifications for take-profit sells
            for (const result of sigs) {
              try {
                // Track sell trade for status updates
                recentTrades.push({
                  type: 'SELL',
                  symbol: result.tokenSymbol,
                  timestamp: new Date(),
                  pnlPercent: result.pnlPercent
                });
                saveTradeHistory(recentTrades);

                await tradeNotifier.sendTradeAlert({
                  type: 'SELL',
                  tokenAddress: result.tokenAddress,
                  tokenSymbol: result.tokenSymbol,
                  amount: result.amount,
                  price: result.exitPrice,
                  totalValue: result.exitValue,
                  pnl: result.pnl,
                  pnlPercent: result.pnlPercent,
                  timestamp: new Date(),
                  txSignature: result.signature
                });
              } catch (notifyError) {
                console.warn('Failed to send take-profit notification:', notifyError instanceof Error ? notifyError.message : notifyError);
              }
            }
          }
        } catch (err) {
          await handleError(err, 'Auto take-profit check');
        }
      }, TAKEPROFIT_CHECK_INTERVAL_MS);
    }
    if (AUTO_STOPLOSS) {
      console.log(`Auto stop-loss enabled: checking every ${STOPLOSS_CHECK_INTERVAL_MS / 1000}s, stop loss ${STOPLOSS_PCT}%`);
      setInterval(async () => {
        try {
          const sigs = await checkAndStopLoss(STOPLOSS_PCT, TRADE_CONFIG.maxSlippageBps, TRADE_CONFIG.dryRun);
          if (sigs.length > 0) {
            console.log(`Auto stop-loss executed ${sigs.length} sells:`, sigs);
            metrics.failedTrades += sigs.length;

            // Send notifications for stop-loss sells
            for (const result of sigs) {
              try {
                await tradeNotifier.sendTradeAlert({
                  type: 'SELL',
                  tokenAddress: result.tokenAddress,
                  tokenSymbol: result.tokenSymbol,
                  amount: result.amount,
                  price: result.exitPrice,
                  totalValue: result.exitValue,
                  pnl: result.pnl,
                  pnlPercent: result.pnlPercent,
                  timestamp: new Date(),
                  txSignature: result.signature
                });
              } catch (notifyError) {
                console.warn('Failed to send stop-loss notification:', notifyError instanceof Error ? notifyError.message : notifyError);
              }
            }
          }
        } catch (err) {
          await handleError(err, 'Auto stop-loss check');
        }
      }, STOPLOSS_CHECK_INTERVAL_MS);
    }
    
    // Periodic status updates every 30 minutes
    console.log('Periodic status updates enabled: every 30 minutes');
    setInterval(async () => {
      await sendPeriodicStatusUpdate();
    }, 30 * 60 * 1000); // 30 minutes
    
    setInterval(async () => {
      try {
        if (!getConnectionHealth()) {
          console.warn('Unhealthy connection detected');
        }
        if (TARGET_MULT) {
          try {
            const bal = await rpc.getBalance(wallet.publicKey);
            const balSol = bal / LAMPORTS_PER_SOL;
            metrics.totalProfit = balSol - BASELINE_BALANCE_SOL;
            const targetSol = BASELINE_BALANCE_SOL * TARGET_MULT;
            if (balSol >= targetSol) {
              console.log(`🎯 PROFIT TARGET REACHED: balance ${balSol.toFixed(4)} SOL ≥ ${targetSol.toFixed(4)} SOL (×${TARGET_MULT})`);
              // Send notification but don't stop the bot
              await tradeNotifier.sendGeneralAlert(`🎯 **PROFIT TARGET REACHED!**

💰 **Current Balance**: ${balSol.toFixed(4)} SOL
🎯 **Target**: ${targetSol.toFixed(4)} SOL (×${TARGET_MULT})
📈 **Total Profit**: +${metrics.totalProfit.toFixed(4)} SOL

*Bot continues running - no auto-stop*`);
            }
          } catch {}
        }
      } catch (err) {
        await handleError(err, 'Periodic health check');
      }
    }, CONSTANTS.HEALTH_CHECK_INTERVAL_MS);
  } catch (error) {
    await handleError(error, 'Main process');
    process.exit(1);
  }
};

// Shutdown handler
let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return; // Prevent multiple shutdowns
  isShuttingDown = true;
  
  console.log(`\n${signal} received - shutting down gracefully...`);
  
  try {
    const bal = await rpc.getBalance(wallet.publicKey);
    const balSol = bal / LAMPORTS_PER_SOL;
    const profit = balSol - BASELINE_BALANCE_SOL;
    const runtime = ((Date.now() - metrics.startTime) / 1000 / 60).toFixed(1);
    
    await tradeNotifier.sendGeneralAlert(`🛑 **BOT STOPPED**

⏱️ **Runtime**: ${runtime} minutes
💰 **Final Balance**: ${balSol.toFixed(4)} SOL
📊 **Session P&L**: ${profit >= 0 ? '+' : ''}${profit.toFixed(4)} SOL (${profit >= 0 ? '+' : ''}${((profit / BASELINE_BALANCE_SOL) * 100).toFixed(2)}%)
✅ **Successful Trades**: ${metrics.successfulTrades}
❌ **Failed Trades**: ${metrics.failedTrades}`);
    
    console.log('Shutdown notification sent to Telegram');
  } catch (error) {
    console.error('Error sending shutdown notification:', error);
  }
  
  setTimeout(() => process.exit(0), 2000); // Give time for notification to send
}

// Handle Ctrl+C on Windows (readline interface)
let rl: any = null;
if (process.platform === 'win32') {
  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.on('SIGINT', () => {
    rl.close();
    gracefulShutdown('SIGINT (Ctrl+C)');
  });
}

// Standard Unix signals
process.on('SIGINT', () => {
  if (rl) rl.close();
  gracefulShutdown('SIGINT');
});
process.on('SIGTERM', () => {
  if (rl) rl.close();
  gracefulShutdown('SIGTERM');
});

main().catch(async (error) => {
  await handleError(error, 'Application startup');
  process.exit(1);
});