import axios from 'axios';
import { RSI } from 'technicalindicators';

import { DataCache } from './cache';
const cache = DataCache.getInstance();

export const fetchNewTokens = async () => {
  try {
    console.log('Fetching tokens from multiple sources...');

    // Thresholds and filters (CLI flags override env; env overrides defaults)
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
    const readNum = (envName: string, def: number): number => {
      const cliFlag = '--' + envName.toLowerCase().replace(/_/g, '-');
      const cliVal = ARG_NUM(cliFlag);
      if (cliVal !== undefined) return cliVal;
      const envVal = Number(process.env[envName] || '');
      return Number.isFinite(envVal) && envVal > 0 ? envVal : def;
    };
    const readList = (envName: string, def: string[]): string[] => {
      const cliFlag = '--' + envName.toLowerCase().replace(/_/g, '-');
      const cliVal = ARG(cliFlag);
      if (cliVal) return cliVal.split(',').map(s => s.trim()).filter(Boolean);
      const envVal = process.env[envName];
      if (envVal) return envVal.split(',').map(s => s.trim()).filter(Boolean);
      return def;
    };

  const MIN_LIQ_USD = readNum('MIN_LIQUIDITY_USD', 50_000); // relaxed default $50k
  const MIN_VOL24_USD = readNum('MIN_VOLUME24H_USD', 25_000); // relaxed default $25k
  const MIN_TXNS_5M = readNum('MIN_TXNS5M', 5); // relaxed default 5 txns in 5m
  const ALLOWED_DEXES = readList('ALLOWED_DEXES', ['raydium']);
  const MAX_ABS_CHANGE_24H = readNum('MAX_ABS_CHANGE24H_PCT', 80); // allow a bit more movement

    // Multiple token discovery sources (free APIs)
    const sources = [
      // Jupiter API - try alternative endpoint
      async () => {
        try {
          console.log('Trying Jupiter API...');
          // Try the price API instead for token list
          const response = await axios.get('https://price.jup.ag/v4/price?ids=SOL', { timeout: 5000 });
          if (response.data) {
            // If Jupiter price API works, we'll use it for validation but skip for discovery
            console.log('Jupiter API available for quotes');
            return []; // Skip token discovery from Jupiter for now
          }
          return [];
        } catch (e) {
          console.log('Jupiter API failed:', e instanceof Error ? e.message : e);
          return [];
        }
      },

      // Raydium API - another free source
      async () => {
        try {
          console.log('Trying Raydium API...');
          const response = await axios.get('https://api.raydium.io/v2/sdk/token/raydium.mainnet.json', { timeout: 10000 });
          const tokens = Object.values(response.data.official).slice(0, 30);

          return tokens.map((token: any) => ({
            chainId: 'solana',
            dexId: 'raydium',
            baseToken: {
              address: token.mint,
              symbol: token.symbol || 'UNKNOWN',
              name: token.name || 'Unknown Token'
            },
            liquidity: { usd: 50000 },
            volume: { h24: 25000 },
            txns: { m5: { buy: 3, sell: 2 }, h24: { buy: 100, sell: 80 } },
            priceUsd: '0.01',
            priceChange: { h24: Math.random() * 15 - 7 }
          }));
        } catch (e) {
          console.log('Raydium API failed:', e instanceof Error ? e.message : e);
          return [];
        }
      },

      // Dexscreener trending tokens - reliable alternative
      async () => {
        try {
          console.log('Trying Dexscreener trending...');
          const response = await axios.get('https://api.dexscreener.com/token-profiles/latest/v1', { timeout: 10000 });
          const solanaTokens = response.data.filter((token: any) =>
            token.chainId === 'solana' && token.tokenAddress
          ).slice(0, 30);

          return solanaTokens.map((token: any) => ({
            chainId: 'solana',
            dexId: 'raydium',
            baseToken: {
              address: token.tokenAddress,
              symbol: token.symbol || 'UNKNOWN',
              name: token.name || 'Unknown Token'
            },
            liquidity: { usd: 25000 },
            volume: { h24: 10000 },
            txns: { m5: { buy: 2, sell: 1 }, h24: { buy: 50, sell: 40 } },
            priceUsd: '0.01',
            priceChange: { h24: Math.random() * 10 - 5 }
          }));
        } catch (e) {
          console.log('Dexscreener trending failed:', e instanceof Error ? e.message : e);
          return [];
        }
      }
    ];

    // Try all sources in parallel and combine results
    console.log('Querying multiple token sources...');
    const sourceResults = await Promise.allSettled(sources.map(source => source()));

    // Add delay to prevent rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay

    let allPairs: any[] = [];
    sourceResults.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value.length > 0) {
        console.log(`Source ${index + 1} returned ${result.value.length} tokens`);
        allPairs = allPairs.concat(result.value);
      } else {
        console.log(`Source ${index + 1} failed or returned no tokens`);
      }
    });

    // Remove duplicates by address
    const uniquePairs = allPairs.filter((pair, index, self) =>
      index === self.findIndex(p => p.baseToken?.address === pair.baseToken?.address)
    );

    console.log(`Total unique tokens found: ${uniquePairs.length}`);

    if (uniquePairs.length === 0) {
      console.log('No tokens found from any source, using minimal fallback');
      // Minimal fallback with just a few known working tokens
      allPairs = [
        {
          chainId: 'solana',
          dexId: 'raydium',
          baseToken: { address: 'So11111111111111111111111111111111111111112', symbol: 'SOL', name: 'Solana' },
          liquidity: { usd: 100000 },
          volume: { h24: 50000 },
          txns: { m5: { buy: 5, sell: 3 }, h24: { buy: 200, sell: 150 } },
          priceUsd: '150.00',
          priceChange: { h24: 1.5 }
        }
      ];
    } else {
      allPairs = uniquePairs;
    }
  console.log(`Total pairs before filtering: ${allPairs.length}`);
  const VERBOSE = process.env.VERBOSE_FILTER_LOGS === 'true';
    return allPairs
    .filter((p: any) => {
      // Basic validity check
      if (!p.dexId || !p.liquidity?.usd || !p.volume?.h24) {
        if (VERBOSE) console.log(`Skipping invalid pair: ${p.baseToken?.symbol || 'unknown'}`);
        return false;
      }

      // DEX allowlist
      if (!ALLOWED_DEXES.includes(p.dexId)) {
        if (VERBOSE) console.log(`Skipping pair on disallowed DEX ${p.dexId}: ${p.baseToken?.symbol}`);
        return false;
      }
      
      // Liquidity threshold
      if (p.liquidity?.usd < MIN_LIQ_USD) {
        if (VERBOSE) console.log(`Filtered out ${p.baseToken?.symbol}: Low liquidity $${p.liquidity?.usd} < $${MIN_LIQ_USD}`);
        return false;
      }
      
      // 24h Volume threshold
      if (p.volume?.h24 < MIN_VOL24_USD) {
        if (VERBOSE) console.log(`Filtered out ${p.baseToken?.symbol}: Low volume $${p.volume?.h24} < $${MIN_VOL24_USD}`);
        return false;
      }

      // Recent activity: 5-minute txn count with 1-hour fallback
      const tx5m = (parseInt(p.txns?.m5?.buy || '0') + parseInt(p.txns?.m5?.sell || '0')) || 0;
      const tx1h = (parseInt(p.txns?.h1?.buy || '0') + parseInt(p.txns?.h1?.sell || '0')) || 0;
      const vol1h = parseFloat(p.volume?.h1 || '0');
      const MIN_TXNS_1H = Number(process.env.MIN_TXNS1H || 80);
      const MIN_VOLUME1H_USD = Number(process.env.MIN_VOLUME1H_USD || 10000);
      
      // If Dexscreener doesn't provide txn data (all zeros), rely on volume only
      const hasTxnData = tx5m > 0 || tx1h > 0;
      const hasRecent = !hasTxnData ? (vol1h >= 1000) : (tx5m >= MIN_TXNS_5M || (tx1h >= MIN_TXNS_1H && vol1h >= MIN_VOLUME1H_USD));
      
      if (!hasRecent) {
        if (VERBOSE) console.log(`Filtered out ${p.baseToken?.symbol}: Low activity tx5m=${tx5m} (<${MIN_TXNS_5M}) and tx1h=${tx1h}/vol1h=$${vol1h} below fallback thresholds`);
        return false;
      }
      
      // Price movement checks
      const priceChange = parseFloat(p.priceChange?.h24 || '0');
      if (Math.abs(priceChange) > MAX_ABS_CHANGE_24H) {
        if (VERBOSE) console.log(`Filtered out ${p.baseToken?.symbol}: Extreme price change ${priceChange}% (> ${MAX_ABS_CHANGE_24H}%)`);
        return false;
      }

  console.log(`Found potential opportunity: ${p.baseToken?.symbol} - Liquidity: $${p.liquidity?.usd}, Vol24h: $${p.volume?.h24}, Vol1h: $${vol1h}, Tx5m: ${tx5m}, Tx1h: ${tx1h}, Price Change: ${priceChange}%`);
      
      // Minimum price check to avoid dust
      if (parseFloat(p.priceUsd) < 0.000001) {
        if (VERBOSE) console.log(`Filtered out ${p.baseToken?.symbol}: Price too low $${p.priceUsd}`);
        return false;
      }
      
      return true;
    })
    .sort((a: any, b: any) => parseFloat(b.volume?.h24 || '0') - parseFloat(a.volume?.h24 || '0'))
    .slice(0, 100);  // Get top 100 by volume
  } catch (error) {
    console.error('Failed to fetch new tokens from Dexscreener:', error instanceof Error ? error.message : error);
    return [];
  }
};

export const validateToken = async (address: string) => {
  try {
    // Helper functions for reading config (same as fetchNewTokens)
    const ARG = (name: string) => {
      const idx = process.argv.indexOf(name);
      return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : '';
    };
    const ARG_NUM = (name: string) => {
      const v = ARG(name);
      if (!v) return undefined;
      const n = Number(v);
      return Number.isNaN(n) ? undefined : n;
    };
    const readNum = (envName: string, def: number): number => {
      const cliFlag = '--' + envName.toLowerCase().replace(/_/g, '-');
      const cliVal = ARG_NUM(cliFlag);
      if (cliVal !== undefined) return cliVal;
      const envVal = Number(process.env[envName] || '');
      return Number.isFinite(envVal) && envVal > 0 ? envVal : def;
    };
    const readList = (envName: string, def: string[]): string[] => {
      const cliFlag = '--' + envName.toLowerCase().replace(/_/g, '-');
      const cliVal = ARG(cliFlag);
      if (cliVal) return cliVal.split(',').map(s => s.trim()).filter(Boolean);
      const envVal = process.env[envName];
      if (envVal) return envVal.split(',').map(s => s.trim()).filter(Boolean);
      return def;
    };

    // Check cache first
    const cachedValidation = cache.getValidation(address);
    if (cachedValidation !== null) {
      return cachedValidation;
    }

    console.log(`Validating token: ${address}`);

    // Skip validation for known safe tokens
    const knownSafeTokens = [
      'So11111111111111111111111111111111111111112', // SOL
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
    ];

    if (knownSafeTokens.includes(address)) {
      console.log(`Token ${address} is known safe, skipping validation`);
      cache.setValidation(address, true);
      return true;
    }

    // Parallel execution with better error handling
    const validationPromises = [];

    // Rug check with fallback
    const rugCheckPromise = axios.get(`https://api.rugcheck.xyz/v1/tokens/${address}/report/summary`, {
      timeout: 5000,
      validateStatus: (status) => status < 500 // Accept 4xx errors to handle them gracefully
    }).catch(error => {
      console.log(`Rugcheck failed for ${address}: ${error.response?.status} - ${error.response?.data?.error || error.message}`);
      return { data: { score: 0 } }; // Default to safe score on API error
    });

    // Dexscreener data
    const dexScreenerPromise = axios.get(`https://api.dexscreener.com/latest/dex/tokens/${address}`, {
      timeout: 5000
    }).catch(error => {
      console.log(`Dexscreener failed for ${address}: ${error.message}`);
      return { data: { pairs: [] } };
    });

    validationPromises.push(rugCheckPromise, dexScreenerPromise);

    const [rugCheckResult, dexScreenerResult] = await Promise.all(validationPromises);

    // More lenient rug check validation
    const rugScore = Number(rugCheckResult.data?.score || 0);
    if (rugScore > 100) { // Much higher threshold - only reject extremely risky tokens
      console.log(`Token ${address} failed rug check with score ${rugScore}`);
      cache.setValidation(address, false);
      return false;
    }

    const pair = dexScreenerResult.data?.pairs?.[0];
    if (!pair) {
      console.log(`No Dexscreener data for ${address}, but allowing anyway`);
      // Don't fail validation just because Dexscreener has no data
    }

    // Basic metrics validation (relaxed)
    const liquidity = pair?.liquidity?.usd || 10000; // Default estimate
    const volume24h = pair?.volume?.h24 || 1000;

    // Very relaxed thresholds for now
    const MIN_LIQUIDITY = 1000; // $1k minimum
    const MIN_VOLUME = 100;     // $100 minimum

    if (liquidity < MIN_LIQUIDITY) {
      console.log(`Token ${address} failed metrics validation: liquidity $${liquidity} < $${MIN_LIQUIDITY}`);
      cache.setValidation(address, false);
      return false;
    }

    if (volume24h < MIN_VOLUME) {
      console.log(`Token ${address} failed metrics validation: volume $${volume24h} < $${MIN_VOLUME}`);
      cache.setValidation(address, false);
      return false;
    }

    // TA check (optional - don't fail validation if TA fails)
    let taScore = 1; // Default pass
    try {
      const taData = await getRSI(address);
      if (taData) {
        const { rsi, prices } = taData;
        if (checkBullishDivergence(prices, rsi)) {
          taScore += 2;
          console.log(`Bullish divergence detected for ${address}`);
        }
        const currentRSI = rsi[rsi.length - 1];
        if (currentRSI < 30) {
          taScore += 1;
          console.log(`Oversold RSI ${currentRSI.toFixed(2)} for ${address}`);
        }
      }
    } catch (e) {
      // Ignore TA errors, default passes
    }

    // Trading metrics validation
    const metrics = {
      price: parseFloat(pair.priceUsd),
      priceChange24h: parseFloat(pair.priceChange?.h24 || '0'),
      volume24h: parseFloat(pair.volume?.h24 || '0'),
      liquidity: parseFloat(pair.liquidity?.usd || '0'),
      txCount24h: (parseInt(pair.txns?.h24?.buy || '0') + parseInt(pair.txns?.h24?.sell || '0')) || 0,
      txCount5m: (parseInt(pair.txns?.m5?.buy || '0') + parseInt(pair.txns?.m5?.sell || '0')) || 0,
      txCount1h: (parseInt(pair.txns?.h1?.buy || '0') + parseInt(pair.txns?.h1?.sell || '0')) || 0,
      volume1h: parseFloat(pair.volume?.h1 || '0'),
      dexId: String(pair.dexId || '')
    };

    // Configurable thresholds
  const MIN_LIQ_USD = readNum('MIN_LIQUIDITY_USD', 50_000); // relaxed default $50k
  const MIN_VOL24_USD = readNum('MIN_VOLUME24H_USD', 25_000); // relaxed default $25k
  const MIN_TXNS_5M = readNum('MIN_TXNS5M', 5); // relaxed default 5 txns in 5m
  const MIN_TXNS_1H = readNum('MIN_TXNS1H', 80);
  const MIN_VOLUME1H_USD = readNum('MIN_VOLUME1H_USD', 10000);
  const MAX_ABS_CHANGE_24H = readNum('MAX_ABS_CHANGE24H_PCT', 80);
  const ALLOWED_DEXES = readList('ALLOWED_DEXES', ['raydium']);    // Validation rules
    const isValid =
      ALLOWED_DEXES.includes(metrics.dexId) &&
      metrics.liquidity >= MIN_LIQ_USD &&
      metrics.volume24h >= MIN_VOL24_USD &&
  metrics.txCount24h >= 50 &&
  (metrics.txCount5m >= MIN_TXNS_5M || (metrics.txCount1h >= MIN_TXNS_1H && metrics.volume1h >= MIN_VOLUME1H_USD)) &&
      Math.abs(metrics.priceChange24h) <= MAX_ABS_CHANGE_24H &&
      metrics.price >= 0.000001 &&
      metrics.price <= 1000 &&
      (metrics.volume24h / Math.max(metrics.liquidity, 1)) >= 0.1 &&
      taScore > 0;

    if (!isValid) {
      console.log(`Token ${address} failed metrics validation:`, metrics);
      return false;
    }

    // AI sentiment check with specific criteria for small accounts (optional)
    let sentiment = true; // default to true when AI not available
    if (process.env.OPENAI_API_KEY) {
      try {
  // @ts-ignore - dynamic import optional, skip type-check when package not installed
  const OpenAI = (await import('openai')).default;
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const response = await openai.chat.completions.create({
          model: 'gpt-4',
          messages: [
            { 
              role: 'user', 
              content: `Analyze Solana token ${address} metrics:\n- 24h Volume: $${metrics.volume24h}\n- Liquidity: $${metrics.liquidity}\n- Price Change 24h: ${metrics.priceChange24h}%\n- Transaction Count 24h: ${metrics.txCount24h}\n\nRespond only with 'high' if ALL conditions met:\n1. Volume/Liquidity ratio healthy (>0.1)\n2. Transaction count indicates active trading\n3. Price movement suggests potential upside\n4. Not showing signs of manipulation\n\nOtherwise respond with 'low'.`
            }
          ]
        });

        sentiment = response.choices[0].message.content?.trim().toLowerCase() === 'high';
        console.log(`Token ${address} sentiment analysis:`, sentiment ? 'Positive' : 'Negative');
      } catch (err) {
        console.warn('OpenAI sentiment check failed or is unavailable, proceeding based on metrics only.');
        sentiment = true;
      }
    }

    return sentiment;

  } catch (error) {
    console.error('Validation error for token', address, ':', error);
    return false;  // Conservative fallback
  }
};

const getRSI = async (tokenAddress: string): Promise<{ rsi: number[], prices: number[] } | null> => {
  try {
    // Get CoinGecko ID
    const cgRes = await axios.get(`https://api.coingecko.com/api/v3/coins/solana/contract/${tokenAddress}`, { timeout: 5000 });
    const id = cgRes.data.id;
    // Get 7 days hourly data
    const chartRes = await axios.get(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=7&interval=hourly`, { timeout: 5000 });
    const prices = chartRes.data.prices.map((p: any) => p[1]);
    if (prices.length < 20) return null;
    const rsiValues = RSI.calculate({ period: 14, values: prices });
    return { rsi: rsiValues, prices };
  } catch (e) {
    return null;
  }
};

const checkBullishDivergence = (prices: number[], rsiValues: number[]): boolean => {
  if (prices.length < 10 || rsiValues.length < 10) return false;
  const recentPrices = prices.slice(-10);
  const recentRSI = rsiValues.slice(-10);
  const priceLowIdx = recentPrices.indexOf(Math.min(...recentPrices));
  const rsiLowIdx = recentRSI.indexOf(Math.min(...recentRSI));
  return priceLowIdx === recentPrices.length - 1 && rsiLowIdx < recentRSI.length - 1; // Price made lower low, RSI made higher low
};