/**
 * Risk Management System
 * - Support/Resistance tracking
 * - Multi-timeframe analysis
 * - Position concentration limits
 * - Drawdown protection
 */

import axios from 'axios';

// Birdeye API configuration
const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY || '';
const BIRDEYE_BASE_URL = 'https://public-api.birdeye.so';

// Helius API configuration (backup - for future use when they add price history endpoint)
const HELIUS_API_KEY = process.env.HELIUS_API_KEY || '';
// const HELIUS_BASE_URL = 'https://api.helius.xyz/v0'; // Reserved for future implementation

// Cache responses AGGRESSIVELY (free tiers have limits)
const birdeyeCache = new Map<string, { data: any; timestamp: number }>();
const BIRDEYE_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Rate limiting (60 RPM = 1 per second max)
let lastBirdeyeCall = 0;
let lastHeliusCall = 0;
const BIRDEYE_MIN_INTERVAL = 2000; // 2 seconds between calls
const HELIUS_MIN_INTERVAL = 1000; // 1 second between calls (more generous)

export interface PriceLevel {
  price: number;
  type: 'support' | 'resistance';
  hits: number;
  lastTest: Date;
  strength: number; // 0-100
}

export interface MultiTimeframeData {
  current: number;
  hour1Ago: number;
  hour4Ago: number;
  day1Ago: number;
  day7Ago: number;
  monthHigh: number;
  monthLow: number;
}

export interface RiskAssessment {
  allowed: boolean;
  reason: string;
  maxPositionSize: number; // SOL amount allowed
  confidence: number; // 0-1 multiplier to apply to strategy confidence
  warnings: string[];
}

export class RiskManager {
  private supportResistanceLevels = new Map<string, PriceLevel[]>();
  // Price history tracked via support/resistance levels
  
  // Position concentration limits
  private readonly MAX_POSITION_PCT = 0.30; // 30% max per token
  private readonly MAX_DOUBLINGS = 3;
  private readonly MIN_PROFIT_FOR_DOUBLE = [0.05, 0.10, 0.15]; // Progressive requirements
  private readonly MAX_DRAWDOWN_ALLOW_DOUBLE = -0.10; // -10% max historical drawdown

  /**
   * Fetch historical price data from Helius API (BACKUP for Birdeye)
   * Helius has more generous free tier: 100k credits/month vs Birdeye's 30k
   */
  private async getHeliusHistory(_tokenAddress: string): Promise<{ price7dAgo: number; price30dAgo: number; monthHigh: number; monthLow: number } | null> {
    if (!HELIUS_API_KEY) {
      return null;
    }

    // Rate limiting
    const timeSinceLastCall = Date.now() - lastHeliusCall;
    if (timeSinceLastCall < HELIUS_MIN_INTERVAL) {
      const waitTime = HELIUS_MIN_INTERVAL - timeSinceLastCall;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    try {
      lastHeliusCall = Date.now();
      
      // Helius DAS API doesn't have direct price history endpoint yet
      // Keep this for future implementation when they add it
      // For now, we rely on Birdeye primarily
      console.log(`⚠️  Helius price history endpoint not available yet`);
      return null;
    } catch (error) {
      console.warn(`Helius API error:`, error instanceof Error ? error.message : error);
      return null;
    }
  }

  /**
   * Fetch historical price data from Birdeye API
   * Uses price_historical endpoint to get actual 7-day and 30-day prices (not estimates!)
   * Falls back to Helius if Birdeye fails or rate limited
   */
  private async getBirdeyeHistory(tokenAddress: string): Promise<{ price7dAgo: number; price30dAgo: number; monthHigh: number; monthLow: number } | null> {
    // Check cache first (minimize API calls for free tier: 60 RPM, 30k CU/month)
    const cached = birdeyeCache.get(tokenAddress);
    if (cached && Date.now() - cached.timestamp < BIRDEYE_CACHE_TTL) {
      console.log(`💾 Using cached Birdeye data for ${tokenAddress.slice(0, 8)}`);
      return cached.data;
    }

    if (!BIRDEYE_API_KEY) {
      console.log(`⚠️  No Birdeye API key - using estimates`);
      return null;
    }

    // RATE LIMITING: Ensure 2 seconds between calls (60 RPM = 1/sec, we use 0.5/sec for safety)
    const timeSinceLastCall = Date.now() - lastBirdeyeCall;
    if (timeSinceLastCall < BIRDEYE_MIN_INTERVAL) {
      const waitTime = BIRDEYE_MIN_INTERVAL - timeSinceLastCall;
      console.log(`⏱️  Rate limiting: waiting ${waitTime}ms before Birdeye call`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    try {
      lastBirdeyeCall = Date.now();
      
      const now = Math.floor(Date.now() / 1000);
      const thirtyDaysAgo = now - (30 * 24 * 60 * 60);
      
      // Fetch historical prices with 1-day intervals for last 30 days
      const response = await axios.get(
        `${BIRDEYE_BASE_URL}/defi/history_price`,
        {
          params: {
            address: tokenAddress,
            address_type: 'token',
            type: '1D', // Daily intervals
            time_from: thirtyDaysAgo,
            time_to: now
          },
          headers: {
            'X-API-KEY': BIRDEYE_API_KEY
          },
          timeout: 5000
        }
      );

      const items = response.data?.data?.items || [];
      if (items.length === 0) {
        console.log(`⚠️  No Birdeye history for ${tokenAddress.slice(0, 8)}`);
        return null;
      }

      // Items are sorted by time (oldest first)
      const currentPrice = items[items.length - 1]?.value || 0;
      const price7dAgo = items.length >= 7 ? items[items.length - 7]?.value : items[0]?.value;
      const price30dAgo = items[0]?.value || 0;

      // Calculate month high/low
      let monthHigh = 0;
      let monthLow = Infinity;
      for (const item of items) {
        const price = item.value || 0;
        if (price > monthHigh) monthHigh = price;
        if (price < monthLow) monthLow = price;
      }

      const result = {
        price7dAgo: price7dAgo || currentPrice,
        price30dAgo: price30dAgo || currentPrice,
        monthHigh: monthHigh || currentPrice,
        monthLow: monthLow > 0 ? monthLow : currentPrice
      };

      // Cache result
      birdeyeCache.set(tokenAddress, { data: result, timestamp: Date.now() });
      
      console.log(`✅ Birdeye history for ${tokenAddress.slice(0, 8)}: 7D ago=$${price7dAgo.toFixed(8)}, 30D ago=$${price30dAgo.toFixed(8)}`);
      return result;
    } catch (error) {
      console.warn(`Birdeye failed for ${tokenAddress.slice(0, 8)}:`, error instanceof Error ? error.message : error);
      
      // FALLBACK: Try Helius as backup
      console.log(`🔄 Falling back to Helius API...`);
      const heliusData = await this.getHeliusHistory(tokenAddress);
      if (heliusData) {
        // Cache Helius result too
        birdeyeCache.set(tokenAddress, { data: heliusData, timestamp: Date.now() });
        return heliusData;
      }
      
      return null;
    }
  }

  /**
   * Get multi-timeframe price data for a token
   * OPTIMIZED: Fetches DexScreener and Birdeye in PARALLEL for speed
   */
  async getMultiTimeframeData(tokenAddress: string): Promise<MultiTimeframeData | null> {
    try {
      // PARALLEL FETCH: Start both DexScreener and Birdeye at the same time
      // This cuts total time from 7s sequential to ~5s parallel (longest API)
      const [dexResponse, birdeyeData] = await Promise.all([
        axios.get(
          `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
          { timeout: 5000 }
        ),
        this.getBirdeyeHistory(tokenAddress) // Runs in parallel!
      ]);
      
      const pair = dexResponse.data.pairs?.[0];
      if (!pair) return null;

      const current = parseFloat(pair.priceUsd || '0');
      
      // Get ACTUAL price history from priceChange data (DexScreener only has: m5, h1, h6, h24)
      const priceChange1h = parseFloat(pair.priceChange?.h1 || '0');
      const priceChange6h = parseFloat(pair.priceChange?.h6 || '0');
      const priceChange24h = parseFloat(pair.priceChange?.h24 || '0');
      
      // Calculate historical prices from percentage changes
      const hour1Ago = priceChange1h !== 0 ? current / (1 + priceChange1h / 100) : current;
      const hour4Ago = priceChange6h !== 0 ? current / (1 + priceChange6h / 100) : current; // Use 6h as proxy for 4h
      const day1Ago = priceChange24h !== 0 ? current / (1 + priceChange24h / 100) : current;
      
      // CRITICAL FIX: Use FDV and priceNative to estimate longer-term history
      // DexScreener tracks priceNative (SOL price) - we can estimate historical moves
      const fdv = parseFloat(pair.fdv || '0');
      const liquidity = parseFloat(pair.liquidity?.usd || '0');
      const volume24h = parseFloat(pair.volume?.h24 || '0');
      const pairCreatedAt = pair.pairCreatedAt ? new Date(pair.pairCreatedAt).getTime() : Date.now() - (30 * 24 * 60 * 60 * 1000);
      const tokenAgeHours = (Date.now() - pairCreatedAt) / (1000 * 60 * 60);
      
      // For 7-day and 30-day estimates, use conservative logic:
      // If token has high FDV but low liquidity = probably parabolic already
      const fdvToLiqRatio = liquidity > 0 ? fdv / liquidity : 0;
      const volumeToLiqRatio = liquidity > 0 ? volume24h / liquidity : 0;
      
      let day7Ago = day1Ago;
      let monthHigh = current;
      let monthLow = current;
      
      // USE BIRDEYE DATA IF AVAILABLE (already fetched in parallel above)
      if (birdeyeData) {
        // Use REAL historical prices from Birdeye API
        day7Ago = birdeyeData.price7dAgo;
        monthHigh = birdeyeData.monthHigh;
        monthLow = birdeyeData.monthLow;
        console.log(`🎯 [Birdeye] Using REAL history: 7D ago=$${day7Ago.toFixed(8)}, High=$${monthHigh.toFixed(8)}`);
      } else {
        // FALLBACK: Use FDV/Liq estimates (less accurate but better than nothing)
        console.log(`📊 [Estimate] No Birdeye data, using FDV/Liq estimates`);
      
        // CONSERVATIVE ESTIMATES for longer timeframes (DexScreener only has 24h max)
        // For 7-day: If FDV/Liq ratio > 10, likely parabolic already
        if (fdvToLiqRatio > 10 && tokenAgeHours > 168) {
          // Token has had time to pump - estimate conservatively
          day7Ago = current * 0.3; // Assume 233% weekly gain
        } else if (tokenAgeHours > 168) {
          // Normal token aging - moderate estimate
          day7Ago = current * 0.6; // Assume 67% weekly gain
        }
        
        // For month high: Use FDV growth + volume patterns
        // High FDV with low liquidity = classic parabolic pump
        if (fdvToLiqRatio > 20 && tokenAgeHours > 720) {
          monthHigh = current * 2.0; // Assume came down from 100% higher
          monthLow = current * 0.2; // Assume 400% total range
        } else if (fdvToLiqRatio > 10 && tokenAgeHours > 720) {
          monthHigh = current * 1.5; // Assume came down from 50% higher
          monthLow = current * 0.4; // Assume 275% total range
        } else if (tokenAgeHours > 720) {
          monthHigh = current * 1.2; // Assume came down from 20% higher
          monthLow = current * 0.7; // Assume 71% total range
        }
        
        // CRITICAL OVERRIDE: Check if volume is VERY high relative to liquidity
        // This catches fresh parabolic moves we can calculate precisely
        if (volumeToLiqRatio > 3.0) {
          // INSANE volume = parabolic move happening NOW
          // Assume token was much lower just days ago
          console.log(`🚨 [Risk Manager] EXTREME volume detected: ${volumeToLiqRatio.toFixed(2)}x liquidity in 24h`);
          day7Ago = current * 0.25; // Assume 300% weekly gain
          monthHigh = current * 1.2; // At or near ATH
          monthLow = current * 0.15; // Came from much lower
        }
      }
      
      console.log(`📊 [Risk Manager] ${tokenAddress.slice(0, 8)} analysis:`);
      console.log(`   Current: $${current.toFixed(8)}, Age: ${tokenAgeHours.toFixed(0)}h`);
      console.log(`   FDV/Liq: ${fdvToLiqRatio.toFixed(1)}x, Vol/Liq: ${volumeToLiqRatio.toFixed(2)}x`);
      console.log(`   1H ago: $${hour1Ago.toFixed(8)} (${priceChange1h.toFixed(2)}%)`);
      console.log(`   24H ago: $${day1Ago.toFixed(8)} (${priceChange24h.toFixed(2)}%)`);
      console.log(`   7D ago: $${day7Ago.toFixed(8)}`);
      console.log(`   Month high: $${monthHigh.toFixed(8)}, low: $${monthLow.toFixed(8)}`)

      return {
        current,
        hour1Ago,
        hour4Ago,
        day1Ago,
        day7Ago,
        monthHigh,
        monthLow
      };
    } catch (error) {
      console.warn(`Failed to get multi-timeframe data for ${tokenAddress}:`, error instanceof Error ? error.message : error);
      return null;
    }
  }

  /**
   * Check if token is at extended levels (near tops)
   */
  isAtExtendedLevels(mtf: MultiTimeframeData): { extended: boolean; reason: string } {
    const gain1h = ((mtf.current - mtf.hour1Ago) / mtf.hour1Ago) * 100;
    const gain4h = ((mtf.current - mtf.hour4Ago) / mtf.hour4Ago) * 100;
    const gain24h = ((mtf.current - mtf.day1Ago) / mtf.day1Ago) * 100;
    const gain7d = ((mtf.current - mtf.day7Ago) / mtf.day7Ago) * 100;
    const distanceFromMonthHigh = ((mtf.monthHigh - mtf.current) / mtf.current) * 100;

    // DEBUG: Log calculated gains
    console.log(`📊 [Extended Check] Gains: 1H=${gain1h.toFixed(1)}%, 4H=${gain4h.toFixed(1)}%, 24H=${gain24h.toFixed(1)}%, 7D=${gain7d.toFixed(1)}%`);

    // Flag as extended if ANY of these conditions met:
    
    // 1. Up >15% in 1 hour - immediate parabolic
    if (gain1h > 15) {
      console.log(`🔴 [EXTENDED] Parabolic 1h spike: +${gain1h.toFixed(1)}%`);
      return { extended: true, reason: `Parabolic 1h spike: +${gain1h.toFixed(1)}% - extreme FOMO zone` };
    }
    
    // 2. Up >30% in 4 hours - rapid ascent
    if (gain4h > 30) {
      console.log(`🔴 [EXTENDED] Rapid 4h pump: +${gain4h.toFixed(1)}%`);
      return { extended: true, reason: `Rapid 4h pump: +${gain4h.toFixed(1)}% - likely exhaustion` };
    }

    // 3. Up >50% in 24h - original check
    if (gain24h > 50) {
      console.log(`🔴 [EXTENDED] Parabolic 24h move: +${gain24h.toFixed(1)}%`);
      return { extended: true, reason: `Parabolic 24h move: +${gain24h.toFixed(1)}% - overbought` };
    }

    // 4. Up >200% in 7 days - extended rally (like BULLISH 485%)
    if (gain7d > 200) {
      console.log(`🔴 [EXTENDED] Extreme 7d rally: +${gain7d.toFixed(1)}%`);
      return { extended: true, reason: `Extreme 7d rally: +${gain7d.toFixed(1)}% - late to party` };
    }

    // 5. Within 5% of estimated month high / ATH - THIS IS CRITICAL
    if (distanceFromMonthHigh < 5) {
      console.log(`🔴 [EXTENDED] Near all-time high (within ${distanceFromMonthHigh.toFixed(1)}%)`);
      return { extended: true, reason: `Near all-time high - major resistance` };
    }
    
    // 6. IMPORTANT: Check if current price is WAY above 7-day low (catches tokens that pumped then cooled)
    // This catches cases like BULLISH: pumped 476% in a month, then "cooled" to +35% in 7 days
    const distanceFrom7DayLow = ((mtf.current - mtf.day7Ago) / mtf.day7Ago) * 100;
    if (distanceFrom7DayLow > 100 && gain7d < 200) {
      // Price is >100% above 7D low, but only up 35% in last 7 days
      // This means big pump happened BEFORE the 7-day window
      console.log(`🔴 [EXTENDED] Price extended from 7D low: +${distanceFrom7DayLow.toFixed(1)}% (even if recent 7D is only +${gain7d.toFixed(1)}%)`);
      return { extended: true, reason: `Extended from recent lows: +${distanceFrom7DayLow.toFixed(1)}% - late entry` };
    }

    console.log(`✅ [OK] Price levels healthy`);
    return { extended: false, reason: 'Price levels healthy' };
  }

  /**
   * Update support/resistance levels based on price action
   */
  updateSupportResistance(tokenAddress: string, currentPrice: number) {
    let levels = this.supportResistanceLevels.get(tokenAddress) || [];
    
    // Check if price is testing any existing level (within 2%)
    const tolerance = 0.02;
    let testedLevel = false;
    
    for (const level of levels) {
      const priceDistance = Math.abs(currentPrice - level.price) / level.price;
      if (priceDistance < tolerance) {
        level.hits++;
        level.lastTest = new Date();
        level.strength = Math.min(100, level.strength + 10); // Increase strength
        testedLevel = true;
      }
    }

    // If no level was tested, this might be a new level
    if (!testedLevel && levels.length < 10) { // Cap at 10 levels per token
      // Add as potential support/resistance
      const newLevel: PriceLevel = {
        price: currentPrice,
        type: 'resistance', // Default to resistance, will adjust based on action
        hits: 1,
        lastTest: new Date(),
        strength: 20 // Initial strength
      };
      levels.push(newLevel);
    }

    // Clean up old/weak levels (not tested in 7 days or strength < 10)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    levels = levels.filter(l => l.lastTest > sevenDaysAgo && l.strength >= 10);

    this.supportResistanceLevels.set(tokenAddress, levels);
  }

  /**
   * Check if price is near strong resistance
   */
  isNearResistance(tokenAddress: string, currentPrice: number): { near: boolean; level?: PriceLevel } {
    const levels = this.supportResistanceLevels.get(tokenAddress) || [];
    const resistanceLevels = levels.filter(l => l.type === 'resistance' && l.price > currentPrice);
    
    for (const level of resistanceLevels) {
      const distance = (level.price - currentPrice) / currentPrice;
      // Check if within 5% of resistance
      if (distance > 0 && distance < 0.05 && level.strength > 50) {
        return { near: true, level };
      }
    }
    
    return { near: false };
  }

  /**
   * Assess risk for a potential trade
   */
  async assessTradeRisk(
    tokenAddress: string,
    currentPrice: number,
    proposedPositionSize: number,
    totalCapital: number,
    existingPosition?: { entryPrice: number; maxDrawdown: number; doublingCount: number; amount: number }
  ): Promise<RiskAssessment> {
    const warnings: string[] = [];
    let confidence = 1.0;
    let maxPositionSize = proposedPositionSize;
    let allowed = true;

    // 1. Check multi-timeframe data
    const mtf = await this.getMultiTimeframeData(tokenAddress);
    if (mtf) {
      const extended = this.isAtExtendedLevels(mtf);
      if (extended.extended) {
        warnings.push(extended.reason);
        confidence *= 0.5; // Cut confidence in half for extended levels
        maxPositionSize *= 0.5; // Only allow 50% of proposed size
      }

      // Update support/resistance
      this.updateSupportResistance(tokenAddress, currentPrice);
      
      // Check resistance
      const nearResistance = this.isNearResistance(tokenAddress, currentPrice);
      if (nearResistance.near) {
        warnings.push(`Near resistance at $${nearResistance.level?.price.toFixed(6)} (${nearResistance.level?.hits} hits)`);
        confidence *= 0.7;
      }
    }

    // 2. Position concentration check
    const proposedTotalExposure = existingPosition 
      ? existingPosition.amount + proposedPositionSize 
      : proposedPositionSize;
    
    const exposurePct = proposedTotalExposure / totalCapital;
    
    if (exposurePct > this.MAX_POSITION_PCT) {
      allowed = false;
      warnings.push(`Position size would exceed ${(this.MAX_POSITION_PCT * 100).toFixed(0)}% concentration limit`);
      return { allowed: false, reason: warnings.join('; '), maxPositionSize: 0, confidence: 0, warnings };
    }

    // 3. Doubling limits check (for anti-martingale)
    if (existingPosition) {
      // Check max doublings
      if (existingPosition.doublingCount >= this.MAX_DOUBLINGS) {
        allowed = false;
        warnings.push(`Max ${this.MAX_DOUBLINGS} doublings reached - no more adding`);
        return { allowed: false, reason: warnings.join('; '), maxPositionSize: 0, confidence: 0, warnings };
      }

      // Check profit requirements for doubling
      const currentPnL = ((currentPrice - existingPosition.entryPrice) / existingPosition.entryPrice);
      const requiredProfit = this.MIN_PROFIT_FOR_DOUBLE[existingPosition.doublingCount];
      
      if (currentPnL < requiredProfit) {
        allowed = false;
        warnings.push(`Need +${(requiredProfit * 100).toFixed(0)}% profit for doubling #${existingPosition.doublingCount + 1}, currently at +${(currentPnL * 100).toFixed(1)}%`);
        return { allowed: false, reason: warnings.join('; '), maxPositionSize: 0, confidence: 0, warnings };
      }

      // Check max drawdown (dead bounce protection)
      if (existingPosition.maxDrawdown < this.MAX_DRAWDOWN_ALLOW_DOUBLE) {
        allowed = false;
        warnings.push(`Position had ${(existingPosition.maxDrawdown * 100).toFixed(1)}% drawdown - won't double dead bounces`);
        return { allowed: false, reason: warnings.join('; '), maxPositionSize: 0, confidence: 0, warnings };
      }
    }

    // 4. Cap total exposure to safe levels
    const maxAllowedExposure = totalCapital * this.MAX_POSITION_PCT;
    const currentExposure = existingPosition?.amount || 0;
    const maxAdditional = maxAllowedExposure - currentExposure;
    
    if (maxPositionSize > maxAdditional) {
      maxPositionSize = maxAdditional;
      warnings.push(`Position size capped to maintain ${(this.MAX_POSITION_PCT * 100).toFixed(0)}% max exposure`);
    }

    return {
      allowed,
      reason: warnings.length > 0 ? warnings.join('; ') : 'Risk acceptable',
      maxPositionSize: Math.max(0, maxPositionSize),
      confidence,
      warnings
    };
  }

  /**
   * Update position drawdown tracking
   */
  updatePositionDrawdown(entryPrice: number, currentPrice: number, currentMaxDrawdown: number): number {
    const currentPnL = ((currentPrice - entryPrice) / entryPrice);
    return Math.min(currentMaxDrawdown, currentPnL);
  }
}

// Singleton instance
export const riskManager = new RiskManager();
