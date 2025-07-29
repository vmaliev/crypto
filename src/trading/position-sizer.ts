import { BingXAccountInfo, BingXTicker } from '@/types/bingx';
import { TradingConfig, RiskManagementConfig } from '@/types/config';
import logger from '@/utils/logger';

export interface PositionSizeRequest {
  symbol: string;
  price: number;
  confidence: number;
  signalStrength: 'STRONG' | 'MEDIUM' | 'WEAK';
  accountBalance: number;
  currentPositions: number;
  volatility?: number;
  maxRiskPerTrade?: number;
}

export interface PositionSizeResult {
  quantity: number;
  notionalValue: number;
  riskAmount: number;
  riskPercentage: number;
  leverage: number;
  strategy: string;
  confidence: number;
  warnings: string[];
}

export class PositionSizer {
  private config: TradingConfig;
  private riskConfig: RiskManagementConfig;

  constructor(config: TradingConfig, riskConfig: RiskManagementConfig) {
    this.config = config;
    this.riskConfig = riskConfig;
  }

  /**
   * Calculate optimal position size based on multiple factors
   */
  public calculatePositionSize(request: PositionSizeRequest): PositionSizeResult {
    const warnings: string[] = [];
    
    // Validate inputs
    if (request.price <= 0) {
      throw new Error('Invalid price: must be greater than 0');
    }
    
    if (request.accountBalance <= 0) {
      throw new Error('Invalid account balance: must be greater than 0');
    }

    // Check position limits
    if (request.currentPositions >= this.config.maxOpenPositions) {
      warnings.push(`Maximum open positions (${this.config.maxOpenPositions}) reached`);
      return this.createZeroPosition(request, warnings);
    }

    // Calculate base position size using multiple strategies
    const strategies = {
      fixedPercentage: this.calculateFixedPercentage(request),
      kellyCriterion: this.calculateKellyCriterion(request),
      volatilityAdjusted: this.calculateVolatilityAdjusted(request),
      confidenceBased: this.calculateConfidenceBased(request)
    };

    // Combine strategies with weights
    const finalSize = this.combineStrategies(strategies, request.confidence);
    
    // Apply risk management constraints
    const constrainedSize = this.applyRiskConstraints(finalSize, request);
    
    // Calculate final metrics
    const notionalValue = constrainedSize.quantity * request.price;
    const riskAmount = notionalValue * (this.riskConfig.stopLossPercent / 100);
    const riskPercentage = (riskAmount / request.accountBalance) * 100;
    const leverage = notionalValue / (notionalValue / this.config.leverageMultiplier);

    logger.logSystem('POSITION_SIZE_CALCULATED', {
      symbol: request.symbol,
      quantity: constrainedSize.quantity,
      notionalValue,
      riskAmount,
      riskPercentage,
      confidence: request.confidence,
      strategy: constrainedSize.strategy
    });

    return {
      quantity: constrainedSize.quantity,
      notionalValue,
      riskAmount,
      riskPercentage,
      leverage,
      strategy: constrainedSize.strategy,
      confidence: request.confidence,
      warnings
    };
  }

  private calculateFixedPercentage(request: PositionSizeRequest): number {
    const basePercentage = this.config.positionSizePercent / 100;
    const adjustedPercentage = basePercentage * this.getSignalStrengthMultiplier(request.signalStrength);
    
    return (request.accountBalance * adjustedPercentage) / request.price;
  }

  private calculateKellyCriterion(request: PositionSizeRequest): number {
    // Kelly Criterion: f = (bp - q) / b
    // where: f = fraction of bankroll to bet
    //        b = odds received on bet - 1
    //        p = probability of winning
    //        q = probability of losing (1 - p)
    
    const winProbability = request.confidence;
    const lossProbability = 1 - winProbability;
    const winLossRatio = 2.5; // Assuming 2.5:1 reward-to-risk ratio
    
    const kellyFraction = (winProbability * winLossRatio - lossProbability) / winLossRatio;
    const conservativeKelly = Math.max(0, kellyFraction * 0.25); // Use 25% of Kelly for safety
    
    return (request.accountBalance * conservativeKelly) / request.price;
  }

  private calculateVolatilityAdjusted(request: PositionSizeRequest): number {
    if (!request.volatility) {
      return 0; // Can't calculate without volatility data
    }

    // Higher volatility = smaller position size
    const volatilityMultiplier = Math.max(0.1, 1 - (request.volatility / 100));
    const baseSize = this.calculateFixedPercentage(request);
    
    return baseSize * volatilityMultiplier;
  }

  private calculateConfidenceBased(request: PositionSizeRequest): number {
    // Scale position size based on confidence level
    const confidenceMultiplier = Math.pow(request.confidence, 1.5); // Exponential scaling
    const baseSize = this.calculateFixedPercentage(request);
    
    return baseSize * confidenceMultiplier;
  }

  private combineStrategies(strategies: Record<string, number>, confidence: number): { quantity: number; strategy: string } {
    // Weight strategies based on confidence and market conditions
    const weights = {
      fixedPercentage: 0.3,
      kellyCriterion: 0.25,
      volatilityAdjusted: 0.25,
      confidenceBased: 0.2
    };

    // Adjust weights based on confidence
    if (confidence > 0.8) {
      weights.kellyCriterion += 0.1;
      weights.confidenceBased += 0.1;
      weights.fixedPercentage -= 0.1;
      weights.volatilityAdjusted -= 0.1;
    } else if (confidence < 0.5) {
      weights.fixedPercentage += 0.1;
      weights.volatilityAdjusted += 0.1;
      weights.kellyCriterion -= 0.1;
      weights.confidenceBased -= 0.1;
    }

    const weightedQuantity = 
      (strategies.fixedPercentage || 0) * weights.fixedPercentage +
      (strategies.kellyCriterion || 0) * weights.kellyCriterion +
      (strategies.volatilityAdjusted || 0) * weights.volatilityAdjusted +
      (strategies.confidenceBased || 0) * weights.confidenceBased;

    return {
      quantity: weightedQuantity,
      strategy: 'COMBINED_STRATEGY'
    };
  }

  private applyRiskConstraints(size: { quantity: number; strategy: string }, request: PositionSizeRequest): { quantity: number; strategy: string } {
    let finalQuantity = size.quantity;

    // Maximum risk per trade constraint
    const maxRiskAmount = request.maxRiskPerTrade || (request.accountBalance * this.riskConfig.stopLossPercent / 100);
    const maxQuantityByRisk = maxRiskAmount / (request.price * this.riskConfig.stopLossPercent / 100);
    
    if (finalQuantity * request.price > maxRiskAmount) {
      finalQuantity = maxQuantityByRisk;
    }

    // Maximum daily loss constraint
    const dailyLossLimit = request.accountBalance * (this.config.maxDailyLoss / 100);
    // This would need to be tracked in the trading engine

    // Minimum position size
    const minQuantity = 0.001; // Minimum tradeable quantity
    if (finalQuantity < minQuantity) {
      finalQuantity = 0;
    }

    // Maximum position size (5% of account)
    const maxPositionSize = request.accountBalance * 0.05;
    const maxQuantityBySize = maxPositionSize / request.price;
    
    if (finalQuantity * request.price > maxPositionSize) {
      finalQuantity = maxQuantityBySize;
    }

    return {
      quantity: Math.max(0, finalQuantity),
      strategy: size.strategy
    };
  }

  private getSignalStrengthMultiplier(strength: 'STRONG' | 'MEDIUM' | 'WEAK'): number {
    switch (strength) {
      case 'STRONG': return 1.2;
      case 'MEDIUM': return 1.0;
      case 'WEAK': return 0.7;
      default: return 1.0;
    }
  }

  private createZeroPosition(request: PositionSizeRequest, warnings: string[]): PositionSizeResult {
    return {
      quantity: 0,
      notionalValue: 0,
      riskAmount: 0,
      riskPercentage: 0,
      leverage: 0,
      strategy: 'ZERO_POSITION',
      confidence: request.confidence,
      warnings
    };
  }

  /**
   * Calculate position size for closing positions
   */
  public calculateCloseSize(currentPosition: number, closePercentage: number = 100): number {
    return (currentPosition * closePercentage) / 100;
  }

  /**
   * Validate position size against account limits
   */
  public validatePositionSize(quantity: number, price: number, accountInfo: BingXAccountInfo): boolean {
    const notionalValue = quantity * price;
    const availableBalance = parseFloat(accountInfo.availableBalance);
    
    // Check if we have enough balance
    if (notionalValue > availableBalance * this.config.leverageMultiplier) {
      logger.logRisk('INSUFFICIENT_BALANCE', {
        required: notionalValue,
        available: availableBalance,
        leverage: this.config.leverageMultiplier
      });
      return false;
    }

    return true;
  }
} 