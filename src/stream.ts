import { rpc, CONSTANTS, getConnectionHealth } from './config';
import { subscribeToProgramLogs, subscribeToSlots } from './subscriptionManager';
import { recordRPCCall } from './rpcLimiter';
import { 
  Commitment,
  Context,
} from '@solana/web3.js';

// Subscription types and interfaces
export interface PoolSubscription {
  logsSub: number;
  slotSub: number;
  unsubscribe: () => void;
  isActive: () => boolean;
}

interface StreamConfig {
  commitment: Commitment;
  batchSize: number;
  errorRetryDelay: number;
  maxRetries: number;
  debugLogs: boolean;
}

interface StreamMetrics {
  totalEvents: number;
  missedEvents: number;
  errors: number;
  lastEventTime: number;
  avgProcessingTime: number;
  startTime: number;
}

// Default configuration
const DEFAULT_STREAM_CONFIG: StreamConfig = {
  commitment: 'processed',
  batchSize: 100,
  errorRetryDelay: 1000,
  maxRetries: 3,
  debugLogs: false
};

// Metrics tracking
const metrics: StreamMetrics = {
  totalEvents: 0,
  missedEvents: 0,
  errors: 0,
  lastEventTime: Date.now(),
  avgProcessingTime: 0,
  startTime: Date.now()
};

// Pool event processing
const processPoolEvent = async (
  log: string,
  signature: string,
  slot: number
): Promise<boolean> => {
  try {
    // Validate event data
    if (!signature || !slot) {
      console.warn('Invalid event data received');
      return false;
    }

    // Check for specific pool creation patterns
    const isInitialize = log.includes('InitializePool');
    const isAddLiquidity = log.includes('addLiquidity');

    if (!isInitialize && !isAddLiquidity) {
      return false;
    }

    // OPTIMIZATION: Only fetch transaction for actual pool events
    // This prevents 1000s of unnecessary getTransaction calls
    // Track this expensive RPC call
    recordRPCCall('getTransaction');
    
    // Get transaction details for validation
    const tx = await rpc.getTransaction(signature, {
      maxSupportedTransactionVersion: 0
    });

    if (!tx) {
      console.warn('Transaction not found:', signature);
      return false;
    }

    // Additional validation logic here
    return true;

  } catch (error) {
    console.error('Error processing pool event:', error);
    metrics.errors++;
    return false;
  }
};

export const subscribeToNewPools = (
  callback: (signature: string, slot: number) => Promise<void>,
  config: Partial<StreamConfig> = {}
): PoolSubscription => {
  const streamConfig = { ...DEFAULT_STREAM_CONFIG, ...config };
  let isSubscribed = true;
  let retryCount = 0;
  let processStartTime = 0;

  // Use subscription manager instead of direct RPC subscription
  // This prevents duplicate subscriptions and tracks RPC credits properly
  const unsubscribeLogs = subscribeToProgramLogs(
    CONSTANTS.RAYDIUM_PROGRAM_ID,
    async (logs, context: Context) => {
      try {
        if (!isSubscribed || !getConnectionHealth()) {
          return;
        }

        processStartTime = Date.now();
        metrics.totalEvents++;

        // Process logs in batches
        const validEvents = await Promise.all(
          logs.logs.map((log: string) => 
            processPoolEvent(log, logs.signature, context.slot)
          )
        );

        // Call callback for valid events only
        const validCount = validEvents.filter(Boolean).length;
        if (validCount > 0) {
          await callback(logs.signature, context.slot);
          
          // Update metrics
          const processingTime = Date.now() - processStartTime;
          metrics.avgProcessingTime = (
            metrics.avgProcessingTime * (metrics.totalEvents - 1) + processingTime
          ) / metrics.totalEvents;
        }

        // Reset retry count on success
        retryCount = 0;

      } catch (error) {
        metrics.errors++;
        console.error('Stream processing error:', error);
        
        if (++retryCount >= streamConfig.maxRetries) {
          console.error('Max retries exceeded, stopping subscription');
          unsubscribe();
          return;
        }

        // Implement exponential backoff
        await new Promise(resolve => 
          setTimeout(resolve, streamConfig.errorRetryDelay * Math.pow(2, retryCount))
        );
      }
    },
    streamConfig.commitment
  );

  // Use subscription manager for slot updates
  const unsubscribeSlots = subscribeToSlots(slot => {
    if (streamConfig.debugLogs) {
      console.log('Slot update:', slot);
    }
  });

  // Unsubscribe function
  const unsubscribe = () => {
    try {
      if (isSubscribed) {
        unsubscribeLogs();
        unsubscribeSlots();
        isSubscribed = false;
        
        // Log final metrics
        const runtime = (Date.now() - metrics.startTime) / 1000;
        console.log('Stream metrics on shutdown:', {
          runtime: `${runtime.toFixed(2)}s`,
          eventsProcessed: metrics.totalEvents,
          errorRate: `${((metrics.errors / metrics.totalEvents) * 100).toFixed(2)}%`,
          avgProcessingTime: `${metrics.avgProcessingTime.toFixed(2)}ms`,
          missedEvents: metrics.missedEvents
        });
      }
    } catch (error) {
      console.error('Error during unsubscribe:', error);
    }
  };

  // Return subscription interface
  return {
    logsSub: 0, // Dummy value for compatibility
    slotSub: 0, // Dummy value for compatibility
    unsubscribe,
    isActive: () => isSubscribed
  };
};