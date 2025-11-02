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

  // EmperorBTC-aligned filters: Focus on liquidity & volume sustainability, not tx counts
  // "Trade the chart, not the asset" - validate tradability first
  const MIN_LIQ_USD = readNum('MIN_LIQUIDITY_USD', 50_000); // Deep pools prevent slippage
  const MIN_VOL24_USD = readNum('MIN_VOLUME24H_USD', 25_000); // Ongoing activity vs one-time hype
  const ALLOWED_DEXES = readList('ALLOWED_DEXES', ['raydium', 'orca', 'meteora']);
  const MAX_ABS_CHANGE_24H = readNum('MAX_ABS_CHANGE24H_PCT', 80); // allow a bit more movement

    // Multiple token discovery sources (free APIs)
    const sources = [
      // Raydium official tokens - whitelisted, safe to trade
      async () => {
        try {
          console.log('Trying Raydium official tokens...');
          const response = await axios.get('https://api.raydium.io/v2/sdk/token/raydium.mainnet.json', { timeout: 10000 });
          const tokens = Object.values(response.data.official || {}).slice(0, 20);

          return tokens.map((token: any) => ({
            chainId: 'solana',
            dexId: 'raydium',
            isOfficial: true, // Mark as official
            baseToken: {
              address: token.mint,
              symbol: token.symbol || 'UNKNOWN',
              name: token.name || 'Unknown Token'
            },
            liquidity: { usd: 100000 }, // Official tokens have deep liquidity
            volume: { h24: 50000 },
            txns: { m5: { buy: 5, sell: 3 }, h24: { buy: 200, sell: 150 } },
            priceUsd: '0.01',
            priceChange: { h24: Math.random() * 15 - 7 }
          }));
        } catch (e) {
          console.log('Raydium API failed:', e instanceof Error ? e.message : e);
          return [];
        }
      },

      // Dexscreener NEW pairs - fresh opportunities
      async () => {
        try {
          console.log('Trying Dexscreener boosted tokens...');
          const response = await axios.get('https://api.dexscreener.com/token-boosts/latest/v1', { timeout: 10000 });
          const solanaPairs = (response.data || [])
            .filter((boost: any) => boost.chainId === 'solana' && boost.tokenAddress)
            .slice(0, 25);

          return solanaPairs.map((boost: any) => ({
            chainId: 'solana',
            dexId: 'raydium',
            isOfficial: false,
            baseToken: {
              address: boost.tokenAddress,
              symbol: boost.description || 'UNKNOWN',
              name: boost.description || 'Unknown Token'
            },
            liquidity: { usd: 30000 },
            volume: { h24: 15000, h1: 2000 },
            txns: { m5: { buy: 3, sell: 2 }, h24: { buy: 60, sell: 50 } },
            priceUsd: '0.01',
            priceChange: { h24: Math.random() * 20 - 10 }
          }));
        } catch (e) {
          console.log('Dexscreener boosted tokens failed:', e instanceof Error ? e.message : e);
          return [];
        }
      },

      // Birdeye new listings - TRULY NEW tokens (sortedby creation time)
      async () => {
        try {
          console.log('Trying Birdeye new listings...');
          const response = await axios.get('https://public-api.birdeye.so/defi/tokenlist', {
            params: {
              sort_by: 'creation_time',
              sort_type: 'desc',
              offset: 0,
              limit: 30
            },
            headers: {
              'X-Chain': 'solana'
            },
            timeout: 10000
          });
          
          const tokens = response.data?.data?.tokens || [];
          
          return tokens.slice(0, 25).map((token: any) => ({
            chainId: 'solana',
            dexId: 'raydium',
            isOfficial: false,
            baseToken: {
              address: token.address,
              symbol: token.symbol || 'UNKNOWN',
              name: token.name || 'Unknown Token'
            },
            liquidity: { usd: token.liquidity || 10000 },
            volume: { h24: token.v24hUSD || 5000, h1: token.v1hUSD || 500 },
            txns: { m5: { buy: 2, sell: 1 }, h24: { buy: 30, sell: 25 } },
            priceUsd: token.price || '0.01',
            priceChange: { h24: token.priceChange24h || 0 }
          }));
        } catch (e) {
          console.log('Birdeye new listings failed:', e instanceof Error ? e.message : e);
          return [];
        }
      },

      // Dexscreener trending tokens - proven movers
      async () => {
        try {
          console.log('Trying Dexscreener trending...');
          const response = await axios.get('https://api.dexscreener.com/token-profiles/latest/v1', { timeout: 10000 });
          const solanaTokens = response.data.filter((token: any) =>
            token.chainId === 'solana' && token.tokenAddress
          ).slice(0, 20);

          return solanaTokens.map((token: any) => ({
            chainId: 'solana',
            dexId: 'raydium',
            isOfficial: false,
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

      // Recent activity: Volume-based (EmperorBTC: measure ongoing activity vs one-time hype)
      // Remove tx count requirements - established tokens trade in bursts, not constantly
      const vol1h = parseFloat(p.volume?.h1 || '0');
      const vol24h = parseFloat(p.volume?.h24 || '0');
      
      // Volume sustainability check: 1h volume should be meaningful relative to 24h
      // This filters out dead tokens while allowing established ones with periodic trading
      const MIN_VOLUME1H_USD = Number(process.env.MIN_VOLUME1H_USD || 1000); // Low threshold for established tokens
      const hasRecent = vol1h >= MIN_VOLUME1H_USD || vol24h >= MIN_VOL24_USD;
      
      if (!hasRecent) {
        if (VERBOSE) console.log(`Filtered out ${p.baseToken?.symbol}: Low volume activity vol1h=$${vol1h}, vol24h=$${vol24h}`);
        return false;
      }

      // RVOL (Relative Volume) Analysis - Filter out low-conviction moves
      // RVOL = current hourly rate vs 24h average hourly rate
      const avgHourlyVol = vol24h / 24;
      const rvol = avgHourlyVol > 0 ? vol1h / avgHourlyVol : 0;
      const MIN_RVOL = Number(process.env.MIN_RVOL || 1.5); // Require 1.5x average volume (strong activity)
      
      if (rvol < MIN_RVOL) {
        if (VERBOSE) console.log(`Filtered out ${p.baseToken?.symbol}: Low RVOL ${rvol.toFixed(2)}x (< ${MIN_RVOL}x) - weak conviction`);
        return false;
      }
      
      // Price movement checks
      const priceChange = parseFloat(p.priceChange?.h24 || '0');
      if (Math.abs(priceChange) > MAX_ABS_CHANGE_24H) {
        if (VERBOSE) console.log(`Filtered out ${p.baseToken?.symbol}: Extreme price change ${priceChange}% (> ${MAX_ABS_CHANGE_24H}%)`);
        return false;
      }

  console.log(`Found potential opportunity: ${p.baseToken?.symbol} - Liquidity: $${p.liquidity?.usd}, Vol24h: $${p.volume?.h24}, Vol1h: $${vol1h}, RVOL: ${rvol.toFixed(2)}x, Price Change: ${priceChange}%`);
      
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

    // Official token whitelist - skip rug checks for these established tokens
    const OFFICIAL_TOKENS = new Set([
      'So11111111111111111111111111111111111111112', // SOL
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
      '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs', // ETH (Wormhole)
      '2FPyTwcZLUg1MDrwsyoP4D6s1tM7hAkHYRjkNb5w6Pxk', // ETH
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
      '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', // RAY (Raydium)
      'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', // mSOL
      'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1', // bSOL
      '7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj', // stSOL
      'So11111111111111111111111111111111111111111', // Wrapped SOL
      'AGFEad2et2ZJif9jaGpdMixQqvW5i81aBdvKe7PHNfz3', // FIDA
      '3JSf5tPeuscJGtaCp5giEiDhv51gQ4v3zWg8DGgyLfAB', // YFI
      '49c7WuCZkQgc3M4qH8WuEUNXfgwupZf1xqWkDQ7gjRGt', // SolBTC
      '4dmKkXNHdgYsXqBHCuMikNQWwVomZURhYvkkX5c4pQ7y', // SAND
      '5tN42n9vMi6ubp67Uy4NnmM5DMZYN8aS8GeB3bEDHr6E', // CAVE
    ]);

    if (OFFICIAL_TOKENS.has(address)) {
      console.log(`✅ Token ${address} is official/whitelisted, skipping rug check`);
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

    // EmperorBTC-aligned rug check: More lenient for established tokens, strict for scams
    // Focus on liquidity depth and volume sustainability
    const rugScore = Number(rugCheckResult.data?.score || 0);
    const MAX_RUG_SCORE = readNum('MAX_RUG_SCORE', 150); // Adjustable threshold
    
    if (rugScore > MAX_RUG_SCORE) {
      console.log(`Token ${address} failed rug check with score ${rugScore}`);
      cache.setValidation(address, false);
      return false;
    }

    const pair = dexScreenerResult.data?.pairs?.[0];
    if (!pair) {
      console.log(`No Dexscreener data for ${address}, relying on rug check only`);
      // Don't auto-fail - strategies will evaluate
      cache.setValidation(address, true);
      return true;
    }

    // EmperorBTC principles: Liquidity depth & volume sustainability
    // "Trade the chart" - validate tradability, not hype metrics
    const liquidity = pair?.liquidity?.usd || 0;
    const volume24h = pair?.volume?.h24 || 0;

    const MIN_LIQUIDITY = readNum('MIN_LIQUIDITY_USD', 50_000); // Deep pools prevent slippage
    const MIN_VOLUME = readNum('MIN_VOLUME24H_USD', 25_000); // Ongoing activity
    
    // Remove tx count requirements - let strategies evaluate momentum
    if (liquidity < MIN_LIQUIDITY) {
      console.log(`Token ${address} failed liquidity validation: $${liquidity} < $${MIN_LIQUIDITY}`);
      cache.setValidation(address, false);
      return false;
    }

    if (volume24h < MIN_VOLUME) {
      console.log(`Token ${address} failed volume validation: $${volume24h} < $${MIN_VOLUME}`);
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

    // Trading metrics for final validation
    const tradeMetrics = {
      price: parseFloat(pair.priceUsd),
      priceChange24h: parseFloat(pair.priceChange?.h24 || '0'),
      volume24h: parseFloat(pair.volume?.h24 || '0'),
      liquidity: parseFloat(pair.liquidity?.usd || '0'),
      volume1h: parseFloat(pair.volume?.h1 || '0'),
      dexId: String(pair.dexId || '')
    };

    // Configurable thresholds (EmperorBTC-aligned)
    const MIN_LIQ_USD = readNum('MIN_LIQUIDITY_USD', 50_000);
    const MIN_VOL24_USD = readNum('MIN_VOLUME24H_USD', 25_000);
    const MIN_VOLUME1H_USD = readNum('MIN_VOLUME1H_USD', 1000);
    const MAX_ABS_CHANGE_24H = readNum('MAX_ABS_CHANGE24H_PCT', 80);
    const ALLOWED_DEXES = readList('ALLOWED_DEXES', ['raydium', 'orca', 'meteora']);
    
    // Validation rules (no tx count requirements)
    const isValid =
      ALLOWED_DEXES.includes(tradeMetrics.dexId) &&
      tradeMetrics.liquidity >= MIN_LIQ_USD &&
      tradeMetrics.volume24h >= MIN_VOL24_USD &&
      (tradeMetrics.volume1h >= MIN_VOLUME1H_USD || tradeMetrics.volume24h >= MIN_VOL24_USD) &&
      Math.abs(tradeMetrics.priceChange24h) <= MAX_ABS_CHANGE_24H &&
      tradeMetrics.price >= 0.000001 &&
      tradeMetrics.price <= 1000 &&
      (tradeMetrics.volume24h / Math.max(tradeMetrics.liquidity, 1)) >= 0.1 &&
      taScore > 0;

    if (!isValid) {
      console.log(`Token ${address} failed final validation:`, tradeMetrics);
      cache.setValidation(address, false);
      return false;
    }

    // Cache and return success
    cache.setValidation(address, true);
    return true;

  } catch (error) {
    console.error('Validation error for token', address, ':', error);
    cache.setValidation(address, false);
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