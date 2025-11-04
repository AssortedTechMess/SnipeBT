import { rpc } from './config';
import { recordRPCCall, canMakeRPCCall } from './rpcLimiter';
import { PublicKey, Context, Commitment } from '@solana/web3.js';

/**
 * Central Subscription Manager
 * 
 * Prevents RPC credit waste by:
 * - Reference counting (multiple listeners share 1 subscription)
 * - Auto-cleanup when no listeners remain
 * - Budget tracking and hard limits
 * - Event distribution to multiple consumers
 * 
 * Fixes the 100M+ RPC burn issue by eliminating duplicate subscriptions
 */

// Subscription types
type LogsCallback = (logs: any, context: Context) => void | Promise<void>;
type SlotCallback = (slot: number) => void | Promise<void>;

interface SubscriptionMetrics {
  id: number;
  type: 'logs' | 'slot';
  filter: string;
  listenerCount: number;
  eventsReceived: number;
  lastEventTime: number;
  createdAt: number;
}

// Subscription storage
interface LogsSubscription {
  id: number;
  filter: string;
  callbacks: Set<LogsCallback>;
  metrics: SubscriptionMetrics;
}

interface SlotSubscription {
  id: number;
  callbacks: Set<SlotCallback>;
  metrics: SubscriptionMetrics;
}

// Manager state
class SubscriptionManager {
  private logsSubscriptions: Map<string, LogsSubscription> = new Map();
  private slotSubscription: SlotSubscription | null = null;
  private isShuttingDown = false;
  private maxConcurrentSubscriptions = 10; // Safety limit

  // Configuration
  private config = {
    enableSubscriptions: true,
    trackMetrics: true,
    autoCleanup: true,
    warningThreshold: 5, // Warn if more than 5 subscriptions
  };

  /**
   * Subscribe to program logs with reference counting
   * Multiple calls with same filter share 1 RPC subscription
   */
  subscribeToProgramLogs(
    programId: PublicKey,
    callback: LogsCallback,
    commitment: Commitment = 'processed'
  ): () => void {
    if (!this.config.enableSubscriptions) {
      console.warn('⚠️ Subscriptions disabled - callback will not receive events');
      return () => {}; // Return no-op unsubscribe
    }

    const filterKey = `${programId.toBase58()}-${commitment}`;

    // Check if subscription already exists
    let subscription = this.logsSubscriptions.get(filterKey);

    if (subscription) {
      // Reuse existing subscription
      subscription.callbacks.add(callback);
      subscription.metrics.listenerCount++;
      console.log(`♻️ Reusing logs subscription for ${programId.toBase58()} (${subscription.metrics.listenerCount} listeners)`);
    } else {
      // Create new subscription only if under limit
      if (this.logsSubscriptions.size >= this.maxConcurrentSubscriptions) {
        throw new Error(`⛔ Max concurrent subscriptions reached (${this.maxConcurrentSubscriptions}). Cannot create new subscription.`);
      }

      // Check RPC budget before creating
      if (!canMakeRPCCall()) {
        throw new Error('⛔ RPC daily limit reached. Cannot create new subscription.');
      }

      console.log(`🆕 Creating new logs subscription for ${programId.toBase58()}`);

      // Create RPC subscription
      const subscriptionId = rpc.onLogs(
        programId,
        async (logs, context) => {
          const sub = this.logsSubscriptions.get(filterKey);
          if (!sub) return;

          // Update metrics
          sub.metrics.eventsReceived++;
          sub.metrics.lastEventTime = Date.now();

          // Track RPC credit consumption (each event = 1 credit)
          recordRPCCall('onLogs.event');

          // Distribute event to all listeners
          for (const cb of sub.callbacks) {
            try {
              await cb(logs, context);
            } catch (error) {
              console.error('Error in logs callback:', error);
            }
          }
        },
        commitment
      );

      // Track subscription creation as RPC call
      recordRPCCall('onLogs.create');

      // Store subscription
      const metrics: SubscriptionMetrics = {
        id: subscriptionId,
        type: 'logs',
        filter: filterKey,
        listenerCount: 1,
        eventsReceived: 0,
        lastEventTime: Date.now(),
        createdAt: Date.now(),
      };

      subscription = {
        id: subscriptionId,
        filter: filterKey,
        callbacks: new Set([callback]),
        metrics,
      };

      this.logsSubscriptions.set(filterKey, subscription);

      // Warn if approaching limit
      if (this.logsSubscriptions.size >= this.config.warningThreshold) {
        console.warn(`⚠️ High subscription count: ${this.logsSubscriptions.size}/${this.maxConcurrentSubscriptions}`);
      }
    }

    // Return unsubscribe function
    return () => this.unsubscribeFromLogs(filterKey, callback);
  }

  /**
   * Subscribe to slot changes with reference counting
   * Only creates 1 slot subscription shared by all listeners
   */
  subscribeToSlots(callback: SlotCallback): () => void {
    if (!this.config.enableSubscriptions) {
      console.warn('⚠️ Subscriptions disabled - callback will not receive events');
      return () => {};
    }

    if (this.slotSubscription) {
      // Reuse existing slot subscription
      this.slotSubscription.callbacks.add(callback);
      this.slotSubscription.metrics.listenerCount++;
      console.log(`♻️ Reusing slot subscription (${this.slotSubscription.metrics.listenerCount} listeners)`);
    } else {
      // Create new slot subscription
      if (!canMakeRPCCall()) {
        throw new Error('⛔ RPC daily limit reached. Cannot create slot subscription.');
      }

      console.log('🆕 Creating new slot subscription');

      const subscriptionId = rpc.onSlotChange(async (slot) => {
        if (!this.slotSubscription) return;

        // Update metrics
        this.slotSubscription.metrics.eventsReceived++;
        this.slotSubscription.metrics.lastEventTime = Date.now();

        // Track RPC credit consumption
        recordRPCCall('onSlotChange.event');

        // Distribute to all listeners
        for (const cb of this.slotSubscription.callbacks) {
          try {
            await cb(slot.slot);
          } catch (error) {
            console.error('Error in slot callback:', error);
          }
        }
      });

      // Track subscription creation
      recordRPCCall('onSlotChange.create');

      const metrics: SubscriptionMetrics = {
        id: subscriptionId,
        type: 'slot',
        filter: 'slot-updates',
        listenerCount: 1,
        eventsReceived: 0,
        lastEventTime: Date.now(),
        createdAt: Date.now(),
      };

      this.slotSubscription = {
        id: subscriptionId,
        callbacks: new Set([callback]),
        metrics,
      };
    }

    // Return unsubscribe function
    return () => this.unsubscribeFromSlots(callback);
  }

  /**
   * Unsubscribe from logs
   * Auto-cleanup: removes RPC subscription when last listener disconnects
   */
  private unsubscribeFromLogs(filterKey: string, callback: LogsCallback): void {
    const subscription = this.logsSubscriptions.get(filterKey);
    if (!subscription) return;

    // Remove callback
    subscription.callbacks.delete(callback);
    subscription.metrics.listenerCount--;

    console.log(`🔌 Unsubscribed from ${filterKey} (${subscription.metrics.listenerCount} listeners remaining)`);

    // Auto-cleanup if no listeners remain
    if (subscription.callbacks.size === 0 && this.config.autoCleanup) {
      console.log(`🧹 Cleaning up logs subscription: ${filterKey}`);
      try {
        rpc.removeOnLogsListener(subscription.id);
        recordRPCCall('removeOnLogsListener');
      } catch (error) {
        console.error('Error removing logs listener:', error);
      }
      this.logsSubscriptions.delete(filterKey);
    }
  }

  /**
   * Unsubscribe from slots
   * Auto-cleanup: removes RPC subscription when last listener disconnects
   */
  private unsubscribeFromSlots(callback: SlotCallback): void {
    if (!this.slotSubscription) return;

    this.slotSubscription.callbacks.delete(callback);
    this.slotSubscription.metrics.listenerCount--;

    console.log(`🔌 Unsubscribed from slots (${this.slotSubscription.metrics.listenerCount} listeners remaining)`);

    // Auto-cleanup if no listeners remain
    if (this.slotSubscription.callbacks.size === 0 && this.config.autoCleanup) {
      console.log('🧹 Cleaning up slot subscription');
      try {
        rpc.removeSlotChangeListener(this.slotSubscription.id);
        recordRPCCall('removeSlotChangeListener');
      } catch (error) {
        console.error('Error removing slot listener:', error);
      }
      this.slotSubscription = null;
    }
  }

  /**
   * Get current subscription metrics
   */
  getMetrics(): {
    logsSubscriptions: SubscriptionMetrics[];
    slotSubscription: SubscriptionMetrics | null;
    totalListeners: number;
    totalEventsReceived: number;
  } {
    const logsMetrics = Array.from(this.logsSubscriptions.values()).map(s => s.metrics);
    const totalListeners = logsMetrics.reduce((sum, m) => sum + m.listenerCount, 0) +
      (this.slotSubscription?.metrics.listenerCount || 0);
    const totalEventsReceived = logsMetrics.reduce((sum, m) => sum + m.eventsReceived, 0) +
      (this.slotSubscription?.metrics.eventsReceived || 0);

    return {
      logsSubscriptions: logsMetrics,
      slotSubscription: this.slotSubscription?.metrics || null,
      totalListeners,
      totalEventsReceived,
    };
  }

  /**
   * Shutdown all subscriptions
   * Call this before bot exits
   */
  shutdown(): void {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    console.log('🛑 Shutting down Subscription Manager...');

    // Log final metrics
    const metrics = this.getMetrics();
    console.log('📊 Final Subscription Metrics:', {
      logsSubscriptions: metrics.logsSubscriptions.length,
      totalListeners: metrics.totalListeners,
      totalEventsReceived: metrics.totalEventsReceived,
    });

    // Clean up all logs subscriptions
    for (const [filterKey, subscription] of this.logsSubscriptions) {
      try {
        rpc.removeOnLogsListener(subscription.id);
        console.log(`✅ Cleaned up logs subscription: ${filterKey}`);
      } catch (error) {
        console.error(`Error cleaning up logs subscription ${filterKey}:`, error);
      }
    }
    this.logsSubscriptions.clear();

    // Clean up slot subscription
    if (this.slotSubscription) {
      try {
        rpc.removeSlotChangeListener(this.slotSubscription.id);
        console.log('✅ Cleaned up slot subscription');
      } catch (error) {
        console.error('Error cleaning up slot subscription:', error);
      }
      this.slotSubscription = null;
    }

    console.log('✅ Subscription Manager shutdown complete');
  }

  /**
   * Enable/disable subscriptions (for emergency shutdown)
   */
  setEnabled(enabled: boolean): void {
    this.config.enableSubscriptions = enabled;
    console.log(`${enabled ? '✅' : '⛔'} Subscriptions ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Set max concurrent subscriptions
   */
  setMaxConcurrent(max: number): void {
    this.maxConcurrentSubscriptions = max;
    console.log(`📊 Max concurrent subscriptions set to ${max}`);
  }
}

// Export singleton instance
export const subscriptionManager = new SubscriptionManager();

// Export convenience functions
export const subscribeToProgramLogs = (
  programId: PublicKey,
  callback: LogsCallback,
  commitment?: Commitment
) => subscriptionManager.subscribeToProgramLogs(programId, callback, commitment);

export const subscribeToSlots = (callback: SlotCallback) =>
  subscriptionManager.subscribeToSlots(callback);

export const getSubscriptionMetrics = () => subscriptionManager.getMetrics();

export const shutdownSubscriptions = () => subscriptionManager.shutdown();
