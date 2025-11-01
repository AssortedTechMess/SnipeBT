// Base Strategy Interface
// All trading strategies must implement this interface

export interface MarketSignal {
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number; // 0-1 scale
  reason: string;
  amount?: number; // Optional position size override
  metadata?: Record<string, any>;
}

export interface StrategyConfig {
  enabled: boolean;
  weight: number; // 0-1 weight for ensemble decisions
  params?: Record<string, any>;
}

export interface TokenMetrics {
  price: number;
  priceChange24h: number;
  volume24h: number;
  volume1h: number;
  liquidity: number;
  txCount24h: number;
  txCount5m: number;
  txCount1h: number;
  rugScore: number;
  dexId?: string;
  rsi?: number;
  ema12?: number;
  ema26?: number;
  macd?: number;
  bollingerBands?: {
    upper: number;
    middle: number;
    lower: number;
  };
  priceHistory?: number[];
}

export interface PositionInfo {
  address: string;
  amount: number;
  entryPrice?: number;
  currentPrice: number;
  pnlPercent: number;
  ageMinutes: number;
}

export abstract class BaseStrategy {
  protected config: StrategyConfig;
  protected name: string;

  constructor(name: string, config: StrategyConfig) {
    this.name = name;
    this.config = config;
  }

  abstract analyze(
    tokenAddress: string,
    metrics: TokenMetrics,
    existingPosition?: PositionInfo
  ): Promise<MarketSignal>;

  public getName(): string {
    return this.name;
  }

  public getWeight(): number {
    return this.config.weight;
  }

  public isEnabled(): boolean {
    return this.config.enabled;
  }

  public updateConfig(config: Partial<StrategyConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // Helper method for common validations
  protected validateMetrics(metrics: TokenMetrics): boolean {
    return (
      metrics.price > 0 &&
      metrics.liquidity > 0 &&
      metrics.volume24h > 0 &&
      !isNaN(metrics.rugScore)
    );
  }

  // Helper method for risk assessment
  protected calculateRiskScore(metrics: TokenMetrics): number {
    let riskScore = 0;
    
    // Rug check score (higher = more risk)
    if (metrics.rugScore > 1000) riskScore += 0.3;
    else if (metrics.rugScore > 500) riskScore += 0.2;
    else if (metrics.rugScore > 100) riskScore += 0.1;
    
    // Liquidity risk (lower = more risk)
    if (metrics.liquidity < 10000) riskScore += 0.3;
    else if (metrics.liquidity < 50000) riskScore += 0.2;
    else if (metrics.liquidity < 100000) riskScore += 0.1;
    
    // Volume consistency (low 1h vs 24h = risk)
    const volumeRatio = metrics.volume1h / (metrics.volume24h / 24);
    if (volumeRatio < 0.1) riskScore += 0.2;
    
    // Price volatility
    if (Math.abs(metrics.priceChange24h) > 50) riskScore += 0.2;
    
    return Math.min(riskScore, 1.0);
  }
}