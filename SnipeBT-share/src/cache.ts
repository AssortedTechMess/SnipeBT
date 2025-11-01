import { LAMPORTS_PER_SOL } from '@solana/web3.js';

interface CacheItem<T> {
  data: T;
  timestamp: number;
}

export class DataCache {
  private static instance: DataCache;
  private cache: Map<string, CacheItem<any>> = new Map();
  
  // Cache expiry times
  private static readonly EXPIRY = {
    BALANCE: 30000,        // 30 seconds for balance
    TOKEN_PRICE: 60000,    // 1 minute for token prices
    POOL_DATA: 120000,     // 2 minutes for pool data
    VALIDATION: 300000,    // 5 minutes for token validation
  };

  private constructor() {}

  static getInstance(): DataCache {
    if (!DataCache.instance) {
      DataCache.instance = new DataCache();
    }
    return DataCache.instance;
  }

  set(key: string, data: any, expiryMs: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now() + expiryMs
    });
  }

  get<T>(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() > item.timestamp) {
      this.cache.delete(key);
      return null;
    }
    
    return item.data as T;
  }

  // Specific cache methods
  setBalance(address: string, balance: number): void {
    this.set(`balance:${address}`, balance / LAMPORTS_PER_SOL, DataCache.EXPIRY.BALANCE);
  }

  getBalance(address: string): number | null {
    return this.get<number>(`balance:${address}`);
  }

  setTokenPrice(address: string, price: number): void {
    this.set(`price:${address}`, price, DataCache.EXPIRY.TOKEN_PRICE);
  }

  getTokenPrice(address: string): number | null {
    return this.get<number>(`price:${address}`);
  }

  setPoolData(address: string, data: any): void {
    this.set(`pool:${address}`, data, DataCache.EXPIRY.POOL_DATA);
  }

  getPoolData(address: string): any | null {
    return this.get(`pool:${address}`);
  }

  setValidation(address: string, isValid: boolean): void {
    this.set(`validation:${address}`, isValid, DataCache.EXPIRY.VALIDATION);
  }

  getValidation(address: string): boolean | null {
    return this.get<boolean>(`validation:${address}`);
  }

  clear(): void {
    this.cache.clear();
  }
}
