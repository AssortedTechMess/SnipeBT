import axios from 'axios';

import { DataCache } from './cache';
const cache = DataCache.getInstance();

export const fetchNewTokens = async () => {
  try {
    console.log('Fetching tokens from Dexscreener...');
    const config = {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; Bot/1.0)',
      },
      timeout: 20000,
    };

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
    
    // Add retry logic
    let retries = 3;
    let lastError: Error | null = null;
    let responseData: any = null;
    
    while (retries > 0) {
      try {
        // Try a search for a known Raydium pool
        const { data } = await axios.get('https://api.dexscreener.com/latest/dex/search?q=raydium', config);
        responseData = data;
        console.log('Dexscreener raw response:', JSON.stringify(data, null, 2).substring(0, 500) + '...');
        break;
      } catch (e) {
        lastError = e as Error;
        console.log(`Attempt ${4-retries} failed, retrying... (${lastError.message})`);
        retries--;
        if (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds between retries
        }
      }
    }
    
    if (lastError && !responseData) {
      console.error('All retries failed:', lastError.message);
      return [];
    }

    if (!responseData || !Array.isArray(responseData.pairs)) {
      console.warn('Dexscreener returned no pairs');
      return [];
    }

  const allPairs = responseData.pairs;
  console.log(`Total pairs before filtering: ${allPairs.length}`);
  const VERBOSE = process.env.VERBOSE_FILTER_LOGS === 'true';
    return responseData.pairs
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
    .slice(0, 10);  // Get top 10 by volume
  } catch (error) {
    console.error('Failed to fetch new tokens from Dexscreener:', error instanceof Error ? error.message : error);
    return [];
  }
};

export const validateToken = async (address: string) => {
  try {
    // Check cache first
    const cachedValidation = cache.getValidation(address);
    if (cachedValidation !== null) {
      return cachedValidation;
    }

    // Parallel execution of validation checks
    const [rugCheckData, dexScreenerData] = await Promise.all([
      axios.get(`https://api.rugcheck.xyz/v1/tokens/${address}/report/summary`),
      axios.get(`https://api.dexscreener.com/latest/dex/tokens/${address}`)
    ]);

    // Advanced rug check validation (dex tools may return non-normalized scores; treat high=bad)
    const rugScore = Number(rugCheckData.data.score || 0);
    if (rugScore > 0.5) {
      console.log(`Token ${address} failed rug check with score ${rugScore}`);
      return false;
    }

    const pair = dexScreenerData.data.pairs?.[0];
    if (!pair) return false;

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
  const MIN_LIQ_USD = Number(process.env.MIN_LIQUIDITY_USD || 50000);
  const MIN_VOL24_USD = Number(process.env.MIN_VOLUME24H_USD || 25000);
  const MIN_TXNS_5M = Number(process.env.MIN_TXNS5M || 5);
  const MIN_TXNS_1H = Number(process.env.MIN_TXNS1H || 80);
  const MIN_VOLUME1H_USD = Number(process.env.MIN_VOLUME1H_USD || 10000);
  const MAX_ABS_CHANGE_24H = Number(process.env.MAX_ABS_CHANGE24H_PCT || 80);
    const ALLOWED_DEXES = (process.env.ALLOWED_DEXES || 'raydium').split(',').map(s => s.trim());

    // Validation rules
    const isValid =
      ALLOWED_DEXES.includes(metrics.dexId) &&
      metrics.liquidity >= MIN_LIQ_USD &&
      metrics.volume24h >= MIN_VOL24_USD &&
  metrics.txCount24h >= 50 &&
  (metrics.txCount5m >= MIN_TXNS_5M || (metrics.txCount1h >= MIN_TXNS_1H && metrics.volume1h >= MIN_VOLUME1H_USD)) &&
      Math.abs(metrics.priceChange24h) <= MAX_ABS_CHANGE_24H &&
      metrics.price >= 0.000001 &&
      metrics.price <= 1000 &&
      (metrics.volume24h / Math.max(metrics.liquidity, 1)) >= 0.1;

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
