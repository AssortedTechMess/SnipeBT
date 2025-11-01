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
import { appendDryRunRecord } from './logging';
import { checkAndTakeProfit, getHeldPositions } from './positionManager';
import { 
  rpc, 
  wallet, 
  CONSTANTS, 
  getConnectionHealth, 
  initializeAndLog 
} from './config';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

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
const SKIP_VALIDATE = process.argv.includes('--skip-validate');
const FORCED_TOKEN = ARG('--token');
const ROUND_TRIP = process.argv.includes('--roundtrip') || process.env.ROUND_TRIP === 'true';
const AUTO_TAKEPROFIT = process.argv.includes('--auto-tp') || process.env.AUTO_TAKEPROFIT === 'true';
const TAKEPROFIT_MIN_PCT = (() => {
  const cli = ARG_NUM('--tp-min-pct');
  if (cli && cli > 0) return cli;
  const envVal = Number(process.env.TAKEPROFIT_MIN_PCT || '');
  return Number.isFinite(envVal) && envVal > 0 ? envVal : 1.5;
})();
const TAKEPROFIT_CHECK_INTERVAL_MS = (() => {
  const cli = ARG_NUM('--tp-interval-ms');
  if (cli && cli > 0) return cli;
  const envVal = Number(process.env.TAKEPROFIT_CHECK_INTERVAL_MS || '');
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
  maxConcurrentTrades: 3,
  minProfitThreshold: 0.01,
  maxSlippageBps: 100,
  tradeAmountSol: 0.05,
  riskPercent: 0.02,
  minTradeSol: 0.001,
  maxTradeSol: 0.05,
  dryRun: !(process.argv.includes('--live') || process.env.DRY_RUN === 'false'),
  monitoringIntervalMs: 30000,
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
  if (isRecentlyAnalyzed(tokenAddress)) {
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
  try {
    metrics.opportunitiesFound++;
    if (!getConnectionHealth()) {
      throw new Error('RPC connection unhealthy');
    }
    const balanceLamports = await rpc.getBalance(wallet.publicKey);
    const balanceSol = balanceLamports / LAMPORTS_PER_SOL;
    const dynamicSize = calculatePositionSize(balanceSol, TRADE_CONFIG.riskPercent, TRADE_CONFIG.maxTradeSol, TRADE_CONFIG.minTradeSol);
    let isValid = true;
    if (!SKIP_VALIDATE) {
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
    if (tradeResult.dryRun) {
      const costPercent = tradeResult.costPercent ?? 0;
      console.log(`Dry-run for ${tokenAddress}: input=${tradeResult.inputAmount}, fee~${tradeResult.estimatedFeeSol} SOL, priceImpact=${tradeResult.priceImpactPct}% => cost%=${(costPercent * 100).toFixed(2)}%`);
      const expectedUpside = await estimateExpectedUpside(tokenAddress);
      console.log(`Estimated upside for ${tokenAddress}: ${(expectedUpside * 100).toFixed(2)}%`);
      const netExpected = (expectedUpside - costPercent);
      const decision = netExpected >= TRADE_CONFIG.minProfitThreshold ? 'consider' : 'skip';
      await appendDryRunRecord({
        timestamp: new Date().toISOString(), token: tokenAddress, inputAmount: tradeResult.inputAmount, estimatedFeeSol: tradeResult.estimatedFeeSol,
        priceImpactPct: tradeResult.priceImpactPct, priceImpactLossSol: tradeResult.priceImpactLossSol, costPercent: tradeResult.costPercent,
        expectedUpside, decision: decision === 'consider' ? 'consider' : 'skip', notes: `netExpected=${netExpected.toFixed(6)}`
      });
      if (decision === 'skip' && !SKIP_VALIDATE) {
        console.log(`Skipping ${tokenAddress} — expected net upside ${(netExpected).toFixed(4)} < minProfitThreshold ${TRADE_CONFIG.minProfitThreshold}`);
        markAnalyzed(tokenAddress);
        return;
      }
      console.log(`Opportunity passes cost & upside filter — would trade ${dynamicSize || TRADE_CONFIG.tradeAmountSol} SOL (dry-run).`);
      markAnalyzed(tokenAddress);
      return;
    }
    if (tradeResult.success) {
      metrics.successfulTrades++;
      console.log(`Successful trade: ${tradeResult.signature}`);
    }
    markAnalyzed(tokenAddress);
  } catch (error) {
    metrics.failedTrades++;
    await handleError(error, `Trade processing for ${tokenAddress}`);
    markAnalyzed(tokenAddress);
  }
};

const main = async () => {
  try {
    console.log('Bot starting up...');
    initializeMetrics();
    console.log(`Time limit set: Will run until ${new Date(metrics.endTime).toISOString()}`);
    console.log('Initializing configuration...');
    await initializeAndLog();
    try {
      const baseLamports = await rpc.getBalance(wallet.publicKey);
      BASELINE_BALANCE_SOL = baseLamports / LAMPORTS_PER_SOL;
      console.log(`Baseline balance set: ${BASELINE_BALANCE_SOL.toFixed(4)} SOL`);
      if (TARGET_MULT) {
        console.log(`Profit target active: ×${TARGET_MULT} ⇒ ${(BASELINE_BALANCE_SOL * TARGET_MULT).toFixed(4)} SOL`);
      }
    } catch (e) {
      console.warn('Unable to establish baseline balance for profit target:', e instanceof Error ? e.message : e);
    }
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
      const tokens = await fetchNewTokens();
      const fresh = tokens.filter((t: any) => !isRecentlyAnalyzed(t.baseToken.address));
      console.log(`Found ${tokens.length} tokens; ${fresh.length} new to analyze (seen TTL ${SEEN_TTL_MIN}m)`);
      if (fresh.length > 0) {
        for (const token of fresh) {
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
          }
        } catch (err) {
          await handleError(err, 'Auto take-profit check');
        }
      }, TAKEPROFIT_CHECK_INTERVAL_MS);
    }
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
              await stopBot(`Profit target reached: balance ${balSol.toFixed(4)} SOL ≥ ${targetSol.toFixed(4)} SOL (×${TARGET_MULT})`);
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

main().catch(async (error) => {
  await handleError(error, 'Application startup');
  process.exit(1);
});
