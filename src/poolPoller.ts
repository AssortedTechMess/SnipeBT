import { Connection } from '@solana/web3.js';
import { CONSTANTS } from './config';
import { recordRPCCall } from './rpcLimiter';

/**
 * EFFICIENT Pool Polling System
 * 
 * Instead of streaming 26K log events/day @ 20 credits each (520K credits),
 * we poll for new Raydium pools every 10 seconds using getSignaturesForAddress
 * 
 * Cost comparison:
 * - WebSocket logs: 26K events × 20 = 520K credits/day
 * - Polling: 8,640 calls/day × 30 = 259K credits/day (50% savings)
 * 
 * Plus: No slot subscriptions needed (saves another 5M credits/day)
 * 
 * Note: Uses a separate connection with 'confirmed' commitment since
 * getSignaturesForAddress requires at least 'confirmed' level.
 */

// Create a dedicated connection for pool polling with 'confirmed' commitment
const poolPollerConnection = new Connection(
  process.env.RPC_URL || 'https://api.mainnet-beta.solana.com',
  { commitment: 'confirmed' }
);

interface PoolPollConfig {
  interval: number;           // Poll every N milliseconds (default: 10000 = 10s)
  limit: number;              // Max signatures to fetch per poll (default: 50)
  commitment: 'processed' | 'confirmed' | 'finalized';
}

const DEFAULT_CONFIG: PoolPollConfig = {
  interval: 30000,  // 30 seconds (was 10s) - more conservative
  limit: 20,        // Check last 20 transactions (was 50) - reduce API load
  commitment: 'confirmed'  // SDK requires at least 'confirmed'
};

export class PoolPoller {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  private lastSignature: string | null = null;
  private config: PoolPollConfig;
  private callback: (signature: string, slot: number) => Promise<void>;

  constructor(
    callback: (signature: string, slot: number) => Promise<void>,
    config: Partial<PoolPollConfig> = {}
  ) {
    this.callback = callback;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start polling for new Raydium pool transactions
   */
  start(): void {
    if (this.isRunning) {
      console.warn('⚠️ Pool poller already running');
      return;
    }

    this.isRunning = true;
    console.log(`🔄 Starting pool poller (every ${this.config.interval}ms)`);

    // Poll immediately, then on interval
    this.poll();
    this.intervalId = setInterval(() => this.poll(), this.config.interval);
  }

  /**
   * Stop polling
   */
  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.log('🛑 Pool poller stopped');
  }

  /**
   * Poll for new transactions
   */
  private async poll(): Promise<void> {
    if (!this.isRunning) return;

    try {
      // Track RPC call (30 credits for Solana getSignaturesForAddress)
      recordRPCCall('getSignaturesForAddress', 30);

      // Fetch recent signatures for Raydium program using confirmed connection
      const signatures = await poolPollerConnection.getSignaturesForAddress(
        CONSTANTS.RAYDIUM_PROGRAM_ID,
        {
          limit: this.config.limit,
          before: this.lastSignature || undefined
        }
      );

      if (signatures.length === 0) {
        return; // No new transactions
      }

      // Update last signature for next poll
      this.lastSignature = signatures[0].signature;

      // Process new signatures (newest first)
      for (const sig of signatures.reverse()) {
        if (!this.isRunning) break;

        try {
          // Fetch transaction details (30 credits)
          recordRPCCall('getTransaction', 30);
          const tx = await poolPollerConnection.getTransaction(sig.signature, {
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed'
          });

          if (!tx) continue;

          // Check if this is a pool creation transaction
          const isPoolCreation = tx.meta?.logMessages?.some(log =>
            log.includes('InitializePool') || log.includes('initialize2')
          );

          if (isPoolCreation) {
            // Call the callback with signature and slot
            await this.callback(sig.signature, sig.slot);
          }
        } catch (error: any) {
          console.error(`Failed to process signature ${sig.signature}:`, error.message);
        }
      }

    } catch (error: any) {
      console.error('Pool polling error:', error.message);
      // Don't stop on errors, continue polling
    }
  }

  /**
   * Get polling status
   */
  isActive(): boolean {
    return this.isRunning;
  }
}

/**
 * Create a pool poller (replaces WebSocket subscriptions)
 * 
 * Usage:
 * const poller = createPoolPoller(async (sig, slot) => {
 *   console.log('New pool:', sig);
 * });
 * poller.start();
 */
export function createPoolPoller(
  callback: (signature: string, slot: number) => Promise<void>,
  config?: Partial<PoolPollConfig>
): PoolPoller {
  return new PoolPoller(callback, config);
}
