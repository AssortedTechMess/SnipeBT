import { getRPCUsageSummary, getRPCStats } from './rpcLimiter';
import { getSubscriptionMetrics } from './subscriptionManager';
import fs from 'fs';
import path from 'path';

const STATS_FILE = path.join(process.cwd(), 'rpc-stats.json');

console.log('\n📊 RPC Usage Report\n');
console.log('='.repeat(60));

if (!fs.existsSync(STATS_FILE)) {
  console.log('No RPC stats file found. Bot has not run yet today.');
  console.log(`Stats will be created at: ${STATS_FILE}`);
  process.exit(0);
}

const data = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
const today = new Date().toISOString().split('T')[0];

if (data.date !== today) {
  console.log(`⚠️  Stats are from ${data.date} (not today)`);
  console.log(`Counter will reset when bot starts.`);
  console.log(`\nPrevious day usage: ${data.callCount.toLocaleString()} calls`);
  
  // Calculate what rollover will be
  const previousBudget = data.totalBudget || 2_500_000;
  const previousUsed = data.callCount || 0;
  const unused = Math.max(0, previousBudget - previousUsed);
  const currentRollover = data.rolloverBank || 0;
  const newRollover = Math.min(5_000_000, currentRollover + unused);
  
  console.log(`\n💰 Rollover Calculation:`);
  console.log(`  • Unused from ${data.date}: ${unused.toLocaleString()}`);
  console.log(`  • Current rollover bank: ${currentRollover.toLocaleString()}`);
  console.log(`  • New rollover bank: ${newRollover.toLocaleString()}`);
  console.log(`  • Tomorrow's total budget: ${(2_500_000 + newRollover).toLocaleString()}`);
} else {
  const stats = getRPCStats();
  const totalBudget = stats.totalBudget || 2_500_000;
  
  const summary = getRPCUsageSummary();
  console.log(summary);
  
  console.log('\n📡 Active Subscriptions\n');
  console.log('='.repeat(60));
  
  try {
    const subMetrics = getSubscriptionMetrics();
    
    if (subMetrics.logsSubscriptions.length === 0 && !subMetrics.slotSubscription) {
      console.log('✅ No active subscriptions');
    } else {
      console.log(`Total subscriptions: ${subMetrics.logsSubscriptions.length + (subMetrics.slotSubscription ? 1 : 0)}`);
      console.log(`Total listeners: ${subMetrics.totalListeners}`);
      console.log(`Total events received: ${subMetrics.totalEventsReceived.toLocaleString()}`);
      
      if (subMetrics.logsSubscriptions.length > 0) {
        console.log('\nLogs Subscriptions:');
        subMetrics.logsSubscriptions.forEach((sub: any, idx: number) => {
          const runtime = ((Date.now() - sub.createdAt) / 1000 / 60).toFixed(1);
          const eventsPerMin = sub.eventsReceived / parseFloat(runtime);
          console.log(`  ${idx + 1}. ${sub.filter}`);
          console.log(`     - Listeners: ${sub.listenerCount}`);
          console.log(`     - Events: ${sub.eventsReceived.toLocaleString()} (${eventsPerMin.toFixed(0)}/min)`);
          console.log(`     - Runtime: ${runtime} min`);
        });
      }
      
      if (subMetrics.slotSubscription) {
        const sub = subMetrics.slotSubscription;
        const runtime = ((Date.now() - sub.createdAt) / 1000 / 60).toFixed(1);
        const eventsPerMin = sub.eventsReceived / parseFloat(runtime);
        console.log('\nSlot Subscription:');
        console.log(`  - Listeners: ${sub.listenerCount}`);
        console.log(`  - Events: ${sub.eventsReceived.toLocaleString()} (${eventsPerMin.toFixed(0)}/min)`);
        console.log(`  - Runtime: ${runtime} min`);
        console.log(`  ⚠️  WARNING: Slot updates occur every ~400ms = ~150 events/min = ~4K RPC credits/hour`);
      }
    }
  } catch (error) {
    console.log('⚠️  Could not retrieve subscription metrics (bot may not be running)');
  }
  
  console.log('\n' + '='.repeat(60));
  
  if (stats.callCount >= totalBudget) {
    console.log('\n🚨 DAILY LIMIT REACHED - Bot will not start');
    console.log('Wait until midnight UTC for reset.');
  } else if (stats.callCount >= totalBudget * 0.9) {
    console.log('\n⚠️  WARNING: Approaching daily limit (>90%)');
    console.log('Bot may stop soon to prevent overage charges.');
  } else if (stats.callCount >= totalBudget * 0.8) {
    console.log('\n⚠️  CAUTION: Using >80% of daily budget');
  } else {
    console.log('\n✅ Safe to continue running');
  }
  
  console.log(`\nCurrent time: ${new Date().toISOString()}`);
  console.log(`Limit resets: Midnight UTC (${new Date().toISOString().split('T')[0]}T00:00:00Z)`);
}

console.log('\n');
