import { BingXPosition, BingXOrderRequest } from '@/types/bingx';
import { RiskManagementConfig } from '@/types/config';
import { ProcessedSignal } from '@/types/signals';
import logger from '@/utils/logger';

export interface RiskMetrics {
  currentDrawdown: number;
  dailyPnL: number;
  totalPnL: number;
  maxDrawdown: number;
  sharpeRatio: number;
  volatility: number;
  correlation: number;
}

export interface RiskCheckResult {
  shouldTrade: boolean;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  warnings: string[];
  maxPositionSize: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  trailingStopPrice?: number;
}

export interface PositionRiskData {
  symbol: string;
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  side: 'LONG' | 'SHORT';
  unrealizedPnL: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  trailingStopPrice?: number;
  volatility: number;
  timeOpen: number; // milliseconds
}

export class RiskManager {
  private config: RiskManagementConfig;
  private dailyPnL: number = 0;
  private maxDrawdown: number = 0;
  private peakBalance: number = 0;
  private tradeHistory: Array<{ timestamp: number; pnl: number }> = [];
  private volatilityData: Map<string, number[]> = new Map();

  constructor(config: RiskManagementConfig) {
    this.config = config;
  }

  /**
   * Check if a trade should be executed based on risk parameters
   */
  public checkTradeRisk(
    signal: ProcessedSignal,
    currentPrice: number,
    accountBalance: number,
    openPositions: BingXPosition[],
    volatility?: number
  ): RiskCheckResult {
    const warnings: string[] = [];
    let shouldTrade = true;
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';

    // Check daily loss limit
    if (this.dailyPnL < -(accountBalance * this.config.maxRiskPerTrade / 100)) {
      shouldTrade = false;
      warnings.push('Daily loss limit reached');
      riskLevel = 'CRITICAL';
    }

    // Check maximum drawdown
    const currentDrawdown = this.calculateDrawdown(accountBalance);
    if (currentDrawdown > 10) { // 10% max drawdown
      shouldTrade = false;
      warnings.push('Maximum drawdown exceeded');
      riskLevel = 'CRITICAL';
    }

    // Check position concentration
    const symbolPositions = openPositions.filter(p => p.symbol === signal.symbol);
    if (symbolPositions.length > 0) {
      warnings.push('Position already exists for this symbol');
      riskLevel = 'HIGH';
    }

    // Check volatility
    if (volatility && volatility > 50) { // High volatility threshold
      warnings.push('High volatility detected');
      riskLevel = 'HIGH';
    }

    // Calculate risk-adjusted position size
    const maxPositionSize = this.calculateRiskAdjustedPositionSize(
      accountBalance,
      currentPrice,
      riskLevel
    );

    // Calculate stop loss and take profit prices
    const { stopLossPrice, takeProfitPrice } = this.calculateStopLevels(
      signal,
      currentPrice,
      volatility
    );

    // Calculate trailing stop if enabled
    let trailingStopPrice: number | undefined;
    if (this.config.useVolatilityStops && volatility) {
      const side = signal.action === 'BUY' ? 'LONG' : 'SHORT';
      trailingStopPrice = this.calculateTrailingStop(currentPrice, volatility, side);
    }

    return {
      shouldTrade,
      riskLevel,
      warnings,
      maxPositionSize,
      stopLossPrice,
      takeProfitPrice,
      ...(trailingStopPrice !== undefined && { trailingStopPrice })
    };
  }

  /**
   * Update risk metrics with new trade data
   */
  public updateRiskMetrics(pnl: number, timestamp: number = Date.now()): void {
    this.dailyPnL += pnl;
    this.tradeHistory.push({ timestamp, pnl });

    // Update max drawdown
    const currentBalance = this.peakBalance + this.dailyPnL;
    if (currentBalance > this.peakBalance) {
      this.peakBalance = currentBalance;
    } else {
      const drawdown = (this.peakBalance - currentBalance) / this.peakBalance * 100;
      this.maxDrawdown = Math.max(this.maxDrawdown, drawdown);
    }

    // Clean old trade history (keep last 1000 trades)
    if (this.tradeHistory.length > 1000) {
      this.tradeHistory = this.tradeHistory.slice(-1000);
    }

    logger.logRisk('RISK_METRICS_UPDATED', {
      dailyPnL: this.dailyPnL,
      maxDrawdown: this.maxDrawdown,
      tradeCount: this.tradeHistory.length
    });
  }

  /**
   * Reset daily metrics (call at start of new day)
   */
  public resetDailyMetrics(): void {
    this.dailyPnL = 0;
    logger.logSystem('DAILY_RISK_METRICS_RESET');
  }

  /**
   * Check if position needs stop loss or take profit adjustment
   */
  public checkPositionRisk(position: PositionRiskData): {
    shouldClose: boolean;
    reason: string;
    newStopLoss?: number;
    newTakeProfit?: number;
  } {
    const { currentPrice, entryPrice, side, stopLossPrice, takeProfitPrice, trailingStopPrice } = position;

    // Check stop loss
    if ((side === 'LONG' && currentPrice <= stopLossPrice) ||
        (side === 'SHORT' && currentPrice >= stopLossPrice)) {
      return {
        shouldClose: true,
        reason: 'Stop loss triggered'
      };
    }

    // Check take profit
    if ((side === 'LONG' && currentPrice >= takeProfitPrice) ||
        (side === 'SHORT' && currentPrice <= takeProfitPrice)) {
      return {
        shouldClose: true,
        reason: 'Take profit triggered'
      };
    }

    // Check trailing stop
    if (trailingStopPrice) {
      if ((side === 'LONG' && currentPrice <= trailingStopPrice) ||
          (side === 'SHORT' && currentPrice >= trailingStopPrice)) {
        return {
          shouldClose: true,
          reason: 'Trailing stop triggered'
        };
      }
    }

    // Update trailing stop if needed
    let newTrailingStop: number | undefined;
    if (this.config.useVolatilityStops && position.volatility) {
      newTrailingStop = this.calculateTrailingStop(currentPrice, position.volatility, side);
    }

    return {
      shouldClose: false,
      reason: '',
      ...(newTrailingStop !== undefined && { newStopLoss: newTrailingStop })
    };
  }

  /**
   * Calculate volatility-based stop loss
   */
  public calculateVolatilityStop(
    entryPrice: number,
    volatility: number,
    side: 'LONG' | 'SHORT',
    multiplier: number = 2
  ): number {
    const volatilityStop = (volatility / 100) * entryPrice * multiplier;
    
    if (side === 'LONG') {
      return entryPrice - volatilityStop;
    } else {
      return entryPrice + volatilityStop;
    }
  }

  /**
   * Get current risk metrics
   */
  public getRiskMetrics(accountBalance: number): RiskMetrics {
    const currentDrawdown = this.calculateDrawdown(accountBalance);
    const volatility = this.calculateVolatility();
    const sharpeRatio = this.calculateSharpeRatio();

    return {
      currentDrawdown,
      dailyPnL: this.dailyPnL,
      totalPnL: this.dailyPnL, // Simplified for now
      maxDrawdown: this.maxDrawdown,
      sharpeRatio,
      volatility,
      correlation: 0 // Would need correlation data
    };
  }

  /**
   * Update volatility data for a symbol
   */
  public updateVolatility(symbol: string, price: number): void {
    if (!this.volatilityData.has(symbol)) {
      this.volatilityData.set(symbol, []);
    }

    const prices = this.volatilityData.get(symbol)!;
    prices.push(price);

    // Keep last 100 prices for volatility calculation
    if (prices.length > 100) {
      prices.shift();
    }
  }

  /**
   * Get volatility for a symbol
   */
  public getVolatility(symbol: string): number {
    const prices = this.volatilityData.get(symbol);
    if (!prices || prices.length < 2) {
      return 0;
    }

    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      const currentPrice = prices[i];
      const previousPrice = prices[i - 1];
      if (currentPrice && previousPrice && previousPrice !== 0) {
        returns.push((currentPrice - previousPrice) / previousPrice);
      }
    }

    const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
    
    return Math.sqrt(variance) * 100; // Convert to percentage
  }

  private calculateDrawdown(currentBalance: number): number {
    if (this.peakBalance === 0) {
      this.peakBalance = currentBalance;
      return 0;
    }

    if (currentBalance > this.peakBalance) {
      this.peakBalance = currentBalance;
      return 0;
    }

    return ((this.peakBalance - currentBalance) / this.peakBalance) * 100;
  }

  private calculateRiskAdjustedPositionSize(
    accountBalance: number,
    price: number,
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  ): number {
    const baseSize = accountBalance * 0.02; // 2% base position size

    const riskMultipliers = {
      'LOW': 1.0,
      'MEDIUM': 0.7,
      'HIGH': 0.4,
      'CRITICAL': 0.0
    };

    return (baseSize * riskMultipliers[riskLevel]) / price;
  }

  private calculateStopLevels(
    signal: ProcessedSignal,
    currentPrice: number,
    volatility?: number
  ): { stopLossPrice: number; takeProfitPrice: number } {
    let stopLossDistance: number;
    let takeProfitDistance: number;

    if (volatility && this.config.useVolatilityStops) {
      // Use volatility-based stops
      stopLossDistance = (volatility / 100) * currentPrice * 2; // 2x volatility
      takeProfitDistance = stopLossDistance * this.config.riskRewardRatio;
    } else {
      // Use fixed percentage stops
      stopLossDistance = currentPrice * (this.config.stopLossPercent / 100);
      takeProfitDistance = currentPrice * (this.config.takeProfitPercent / 100);
    }

    if (signal.action === 'BUY') {
      return {
        stopLossPrice: currentPrice - stopLossDistance,
        takeProfitPrice: currentPrice + takeProfitDistance
      };
    } else {
      return {
        stopLossPrice: currentPrice + stopLossDistance,
        takeProfitPrice: currentPrice - takeProfitDistance
      };
    }
  }

  private calculateTrailingStop(
    currentPrice: number,
    volatility: number,
    side: 'LONG' | 'SHORT' | 'BUY' | 'SELL'
  ): number {
    const trailingDistance = (volatility / 100) * currentPrice * 1.5; // 1.5x volatility

    if (side === 'LONG' || side === 'BUY') {
      return currentPrice - trailingDistance;
    } else {
      return currentPrice + trailingDistance;
    }
  }

  private calculateVolatility(): number {
    if (this.tradeHistory.length < 2) {
      return 0;
    }

    const returns = this.tradeHistory.map(trade => trade.pnl);
    const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
    
    return Math.sqrt(variance);
  }

  private calculateSharpeRatio(): number {
    if (this.tradeHistory.length < 2) {
      return 0;
    }

    const returns = this.tradeHistory.map(trade => trade.pnl);
    const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const volatility = this.calculateVolatility();

    return volatility > 0 ? mean / volatility : 0;
  }
} 