import fs from 'fs';
import path from 'path';

/**
 * RPC Call Limiter - Prevents exceeding daily QuickNode limits
 * 
 * QuickNode Plan: 80M credits/month
 * Safe Daily Budget: 2.5M calls/day (leaves 5M buffer for month)
 * 
 * ROLLOVER SYSTEM: Unused credits from previous days accumulate!
 * - If you only use 1M today, you get 1.5M extra tomorrow (up to 5M max bank)
 * - This allows burst days while staying within monthly limit
 */

interface RPCStats {
  date: string; // YYYY-MM-DD
  callCount: number;
  lastReset: number;
  callsByMethod: { [method: string]: number };
  rolloverBank: number; // Accumulated unused credits
  totalBudget: number; // Today's budget including rollover
}

const STATS_FILE = path.join(process.cwd(), 'rpc-stats.json');
const DAILY_BUDGET = Number(process.env.RPC_DAILY_LIMIT) || 2_500_000; // 2.5M base
const MAX_ROLLOVER_BANK = 5_000_000; // Can't accumulate more than 5M extra
const WARNING_THRESHOLD = 0.8; // Warn at 80% usage

let stats: RPCStats = {
  date: new Date().toISOString().split('T')[0],
  callCount: 0,
  lastReset: Date.now(),
  callsByMethod: {},
  rolloverBank: 0,
  totalBudget: DAILY_BUDGET
};

/**
 * Load stats from disk (survives bot restarts)
 */
function loadStats(): void {
  try {
    if (fs.existsSync(STATS_FILE)) {
      const data = fs.readFileSync(STATS_FILE, 'utf8');
      const loaded = JSON.parse(data);
      
      const today = new Date().toISOString().split('T')[0];
      
      // Reset if it's a new day
      if (loaded.date !== today) {
        // Calculate unused credits from previous day
        const previousBudget = loaded.totalBudget || DAILY_BUDGET;
        const previousUsed = loaded.callCount || 0;
        const unused = Math.max(0, previousBudget - previousUsed);
        
        // Add to rollover bank (cap at MAX_ROLLOVER_BANK)
        const newRolloverBank = Math.min(
          MAX_ROLLOVER_BANK,
          (loaded.rolloverBank || 0) + unused
        );
        
        const newTotalBudget = DAILY_BUDGET + newRolloverBank;
        
        console.log(`📅 New day detected`);
        console.log(`   Yesterday used: ${previousUsed.toLocaleString()}/${previousBudget.toLocaleString()}`);
        console.log(`   Unused credits: ${unused.toLocaleString()}`);
        console.log(`   Rollover bank: ${newRolloverBank.toLocaleString()}`);
        console.log(`   Today's budget: ${newTotalBudget.toLocaleString()} (${DAILY_BUDGET.toLocaleString()} base + ${newRolloverBank.toLocaleString()} rollover)`);
        
        stats = {
          date: today,
          callCount: 0,
          lastReset: Date.now(),
          callsByMethod: {},
          rolloverBank: newRolloverBank,
          totalBudget: newTotalBudget
        };
        saveStats();
      } else {
        stats = {
          ...loaded,
          rolloverBank: loaded.rolloverBank || 0,
          totalBudget: loaded.totalBudget || DAILY_BUDGET
        };
        console.log(`📊 Loaded RPC stats: ${stats.callCount.toLocaleString()}/${stats.totalBudget.toLocaleString()} calls used today`);
        if (stats.rolloverBank > 0) {
          console.log(`   💰 Rollover bank: ${stats.rolloverBank.toLocaleString()} extra credits available`);
        }
      }
    } else {
      saveStats();
    }
  } catch (e) {
    console.error('Failed to load RPC stats, starting fresh:', e);
  }
}

/**
 * Save stats to disk
 */
function saveStats(): void {
  try {
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
  } catch (e) {
    console.error('Failed to save RPC stats:', e);
  }
}

/**
 * Check if we can make an RPC call without exceeding limit
 */
export function canMakeRPCCall(_method: string = 'unknown'): boolean {
  const today = new Date().toISOString().split('T')[0];
  
  // Reset if new day
  if (stats.date !== today) {
    // Calculate unused and rollover
    const unused = Math.max(0, stats.totalBudget - stats.callCount);
    const newRolloverBank = Math.min(MAX_ROLLOVER_BANK, stats.rolloverBank + unused);
    const newTotalBudget = DAILY_BUDGET + newRolloverBank;
    
    console.log(`📅 Midnight reset`);
    console.log(`   Unused credits from ${stats.date}: ${unused.toLocaleString()}`);
    console.log(`   New rollover bank: ${newRolloverBank.toLocaleString()}`);
    console.log(`   Today's budget: ${newTotalBudget.toLocaleString()}`);
    
    stats = {
      date: today,
      callCount: 0,
      lastReset: Date.now(),
      callsByMethod: {},
      rolloverBank: newRolloverBank,
      totalBudget: newTotalBudget
    };
    saveStats();
  }
  
  // Check limit
  if (stats.callCount >= stats.totalBudget) {
    return false;
  }
  
  // Warning threshold
  if (stats.callCount >= stats.totalBudget * WARNING_THRESHOLD && 
      stats.callCount < stats.totalBudget * WARNING_THRESHOLD + 100) {
    console.warn(`⚠️  RPC USAGE WARNING: ${stats.callCount.toLocaleString()}/${stats.totalBudget.toLocaleString()} (${((stats.callCount / stats.totalBudget) * 100).toFixed(1)}%)`);
  }
  
  return true;
}

/**
 * Record an RPC call
 */
export function recordRPCCall(method: string = 'unknown'): void {
  stats.callCount++;
  stats.callsByMethod[method] = (stats.callsByMethod[method] || 0) + 1;
  
  // Save every 100 calls to avoid excessive disk I/O
  if (stats.callCount % 100 === 0) {
    saveStats();
  }
}

/**
 * Get current stats
 */
export function getRPCStats(): RPCStats {
  return { ...stats };
}

/**
 * Get usage summary
 */
export function getRPCUsageSummary(): string {
  const percentage = ((stats.callCount / stats.totalBudget) * 100).toFixed(1);
  const remaining = stats.totalBudget - stats.callCount;
  const uptimeHours = (Date.now() - stats.lastReset) / (1000 * 60 * 60);
  const callsPerHour = uptimeHours > 0 ? Math.round(stats.callCount / uptimeHours) : 0;
  const hoursRemaining = remaining > 0 && callsPerHour > 0 ? (remaining / callsPerHour).toFixed(1) : 'unlimited';
  
  const topMethods = Object.entries(stats.callsByMethod)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([method, count]) => `  • ${method}: ${count.toLocaleString()}`)
    .join('\n');
  
  return `📊 RPC Usage (${stats.date}):
  • Used: ${stats.callCount.toLocaleString()}/${stats.totalBudget.toLocaleString()} (${percentage}%)
  • Remaining: ${remaining.toLocaleString()} calls
  • Base budget: ${DAILY_BUDGET.toLocaleString()}/day
  • Rollover credits: ${stats.rolloverBank.toLocaleString()}
  • Rate: ${callsPerHour.toLocaleString()}/hour
  • Time until limit: ${hoursRemaining} hours

Top RPC methods:
${topMethods || '  (none yet)'}`;
}

/**
 * Check if limit exceeded
 */
export function isLimitExceeded(): boolean {
  return stats.callCount >= stats.totalBudget;
}

/**
 * Initialize (call on bot startup)
 */
export function initializeRPCLimiter(): void {
  loadStats();
  console.log('\n' + getRPCUsageSummary() + '\n');
  
  if (isLimitExceeded()) {
    console.error(`\n🚨 DAILY RPC LIMIT EXCEEDED: ${stats.callCount.toLocaleString()}/${stats.totalBudget.toLocaleString()}`);
    console.error(`Bot will not start to prevent overage charges.`);
    console.error(`Limit resets at midnight UTC. Current time: ${new Date().toISOString()}`);
    console.error(`\nTo override (NOT RECOMMENDED): Set RPC_DAILY_LIMIT=999999999 in .env\n`);
    process.exit(1);
  }
}

// Auto-save on exit
process.on('exit', () => saveStats());
process.on('SIGINT', () => {
  saveStats();
  process.exit(0);
});
process.on('SIGTERM', () => {
  saveStats();
  process.exit(0);
});
