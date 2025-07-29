import { BingXPosition, BingXAccountInfo } from '@/types/bingx';
import { RiskMetrics } from './risk-manager';
import { TradeRecord } from '@/database/trading-db';
import logger from '@/utils/logger';

export interface SafetyThresholds {
  maxDailyLoss: number;
  maxDrawdown: number;
  maxOpenPositions: number;
  maxPositionSize: number;
  maxLeverage: number;
  minBalance: number;
  maxConsecutiveLosses: number;
  maxVolatility: number;
  emergencyStopLoss: number;
}

export interface SafetyStatus {
  isTradingEnabled: boolean;
  circuitBreakerActive: boolean;
  emergencyStopActive: boolean;
  warnings: string[];
  lastCheck: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface CircuitBreakerState {
  isActive: boolean;
  triggerTime: number;
  triggerReason: string;
  cooldownPeriod: number; // milliseconds
  autoReset: boolean;
}

export class SafetyManager {
  private thresholds: SafetyThresholds;
  private circuitBreaker: CircuitBreakerState;
  private emergencyStop: boolean = false;
  private consecutiveLosses: number = 0;
  private dailyLoss: number = 0;
  private lastResetTime: number = Date.now();
  private tradingSessions: Array<{
    startTime: number;
    endTime?: number;
    pnl: number;
    trades: number;
  }> = [];

  constructor(thresholds: SafetyThresholds) {
    this.thresholds = thresholds;
    this.circuitBreaker = {
      isActive: false,
      triggerTime: 0,
      triggerReason: '',
      cooldownPeriod: 30 * 60 * 1000, // 30 minutes
      autoReset: true
    };
  }

  /**
   * Check if trading is safe to continue
   */
  public checkSafety(
    accountInfo: BingXAccountInfo,
    openPositions: BingXPosition[],
    riskMetrics: RiskMetrics,
    recentTrades: TradeRecord[]
  ): SafetyStatus {
    const warnings: string[] = [];
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
    let isTradingEnabled = true;

    // Check emergency stop
    if (this.emergencyStop) {
      return {
        isTradingEnabled: false,
        circuitBreakerActive: false,
        emergencyStopActive: true,
        warnings: ['Emergency stop is active'],
        lastCheck: Date.now(),
        riskLevel: 'CRITICAL'
      };
    }

    // Check circuit breaker
    if (this.circuitBreaker.isActive) {
      const timeSinceTrigger = Date.now() - this.circuitBreaker.triggerTime;
      if (timeSinceTrigger < this.circuitBreaker.cooldownPeriod) {
        return {
          isTradingEnabled: false,
          circuitBreakerActive: true,
          emergencyStopActive: false,
          warnings: [`Circuit breaker active: ${this.circuitBreaker.triggerReason}`],
          lastCheck: Date.now(),
          riskLevel: 'HIGH'
        };
      } else if (this.circuitBreaker.autoReset) {
        this.resetCircuitBreaker();
      }
    }

    const balance = parseFloat(accountInfo.availableBalance);

    // Check minimum balance
    if (balance < this.thresholds.minBalance) {
      warnings.push(`Balance below minimum threshold: ${balance}`);
      riskLevel = 'CRITICAL';
      isTradingEnabled = false;
    }

    // Check daily loss limit
    if (this.dailyLoss < -this.thresholds.maxDailyLoss) {
      warnings.push(`Daily loss limit exceeded: ${this.dailyLoss}`);
      riskLevel = 'CRITICAL';
      isTradingEnabled = false;
      this.triggerCircuitBreaker('Daily loss limit exceeded');
    }

    // Check maximum drawdown
    if (riskMetrics.maxDrawdown > this.thresholds.maxDrawdown) {
      warnings.push(`Maximum drawdown exceeded: ${riskMetrics.maxDrawdown}%`);
      riskLevel = 'CRITICAL';
      isTradingEnabled = false;
      this.triggerCircuitBreaker('Maximum drawdown exceeded');
    }

    // Check open positions limit
    if (openPositions.length >= this.thresholds.maxOpenPositions) {
      warnings.push(`Maximum open positions reached: ${openPositions.length}`);
      riskLevel = 'HIGH';
    }

    // Check position size limits
    const totalPositionValue = openPositions.reduce((sum, pos) => {
      return sum + (parseFloat(pos.positionAmt) * parseFloat(pos.entryPrice));
    }, 0);

    if (totalPositionValue > this.thresholds.maxPositionSize) {
      warnings.push(`Maximum position size exceeded: ${totalPositionValue}`);
      riskLevel = 'HIGH';
    }

    // Check consecutive losses
    if (this.consecutiveLosses >= this.thresholds.maxConsecutiveLosses) {
      warnings.push(`Maximum consecutive losses reached: ${this.consecutiveLosses}`);
      riskLevel = 'HIGH';
      this.triggerCircuitBreaker('Maximum consecutive losses reached');
    }

    // Check volatility
    if (riskMetrics.volatility > this.thresholds.maxVolatility) {
      warnings.push(`High volatility detected: ${riskMetrics.volatility}%`);
      riskLevel = 'MEDIUM';
    }

    // Check leverage
    const currentLeverage = totalPositionValue / balance;
    if (currentLeverage > this.thresholds.maxLeverage) {
      warnings.push(`Maximum leverage exceeded: ${currentLeverage}x`);
      riskLevel = 'HIGH';
    }

    // Update consecutive losses count
    this.updateConsecutiveLosses(recentTrades);

    return {
      isTradingEnabled,
      circuitBreakerActive: this.circuitBreaker.isActive,
      emergencyStopActive: this.emergencyStop,
      warnings,
      lastCheck: Date.now(),
      riskLevel
    };
  }

  /**
   * Trigger circuit breaker
   */
  public triggerCircuitBreaker(reason: string): void {
    this.circuitBreaker = {
      isActive: true,
      triggerTime: Date.now(),
      triggerReason: reason,
      cooldownPeriod: 30 * 60 * 1000, // 30 minutes
      autoReset: true
    };

    logger.logRisk('CIRCUIT_BREAKER_TRIGGERED', {
      reason,
      triggerTime: new Date(this.circuitBreaker.triggerTime).toISOString(),
      cooldownPeriod: this.circuitBreaker.cooldownPeriod,
      data: { reason, triggerTime: this.circuitBreaker.triggerTime }
    });
  }

  /**
   * Reset circuit breaker
   */
  public resetCircuitBreaker(): void {
    this.circuitBreaker.isActive = false;
    logger.logSystem('CIRCUIT_BREAKER_RESET');
  }

  /**
   * Activate emergency stop
   */
  public activateEmergencyStop(): void {
    this.emergencyStop = true;
    logger.logRisk('EMERGENCY_STOP_ACTIVATED');
  }

  /**
   * Deactivate emergency stop
   */
  public deactivateEmergencyStop(): void {
    this.emergencyStop = false;
    logger.logSystem('EMERGENCY_STOP_DEACTIVATED');
  }

  /**
   * Update daily loss tracking
   */
  public updateDailyLoss(pnl: number): void {
    this.dailyLoss += pnl;
    
    // Reset daily loss at start of new day
    const now = Date.now();
    const lastReset = new Date(this.lastResetTime);
    const currentDay = new Date(now);
    
    if (lastReset.getDate() !== currentDay.getDate() || 
        lastReset.getMonth() !== currentDay.getMonth() || 
        lastReset.getFullYear() !== currentDay.getFullYear()) {
      this.dailyLoss = pnl;
      this.lastResetTime = now;
      this.consecutiveLosses = 0;
    }
  }

  /**
   * Start a new trading session
   */
  public startTradingSession(): void {
    this.tradingSessions.push({
      startTime: Date.now(),
      pnl: 0,
      trades: 0
    });
  }

  /**
   * End current trading session
   */
  public endTradingSession(pnl: number, trades: number): void {
    if (this.tradingSessions.length > 0) {
      const currentSession = this.tradingSessions[this.tradingSessions.length - 1];
      if (currentSession) {
        currentSession.endTime = Date.now();
        currentSession.pnl = pnl;
        currentSession.trades = trades;
      }
    }
  }

  /**
   * Get trading session statistics
   */
  public getSessionStats(): {
    totalSessions: number;
    averageSessionDuration: number;
    averageSessionPnL: number;
    bestSession: number;
    worstSession: number;
  } {
    const completedSessions = this.tradingSessions.filter(s => s.endTime);
    
    if (completedSessions.length === 0) {
      return {
        totalSessions: 0,
        averageSessionDuration: 0,
        averageSessionPnL: 0,
        bestSession: 0,
        worstSession: 0
      };
    }

    const durations = completedSessions.map(s => (s.endTime! - s.startTime) / 1000 / 60); // minutes
    const pnls = completedSessions.map(s => s.pnl);

    return {
      totalSessions: completedSessions.length,
      averageSessionDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
      averageSessionPnL: pnls.reduce((sum, p) => sum + p, 0) / pnls.length,
      bestSession: Math.max(...pnls),
      worstSession: Math.min(...pnls)
    };
  }

  /**
   * Check if position should be force-closed
   */
  public shouldForceClosePosition(
    position: BingXPosition,
    currentPrice: number,
    accountBalance: number
  ): { shouldClose: boolean; reason: string } {
    const positionValue = parseFloat(position.positionAmt) * currentPrice;
    const unrealizedPnL = parseFloat(position.unrealizedPnl);

    // Force close if position is losing more than emergency stop loss
    if (unrealizedPnL < -(accountBalance * this.thresholds.emergencyStopLoss / 100)) {
      return {
        shouldClose: true,
        reason: 'Emergency stop loss triggered'
      };
    }

    // Force close if position size is too large relative to account
    if (positionValue > accountBalance * 0.1) { // 10% of account
      return {
        shouldClose: true,
        reason: 'Position size too large'
      };
    }

    return {
      shouldClose: false,
      reason: ''
    };
  }

  /**
   * Get safety recommendations
   */
  public getSafetyRecommendations(
    accountInfo: BingXAccountInfo,
    openPositions: BingXPosition[]
  ): string[] {
    const recommendations: string[] = [];
    const balance = parseFloat(accountInfo.availableBalance);

    // Check if we're approaching limits
    if (this.dailyLoss < -(this.thresholds.maxDailyLoss * 0.8)) {
      recommendations.push('Approaching daily loss limit - consider reducing position sizes');
    }

    if (openPositions.length >= this.thresholds.maxOpenPositions * 0.8) {
      recommendations.push('Approaching maximum open positions - consider closing some positions');
    }

    if (this.consecutiveLosses >= this.thresholds.maxConsecutiveLosses * 0.8) {
      recommendations.push('Approaching maximum consecutive losses - consider reviewing strategy');
    }

    if (balance < this.thresholds.minBalance * 1.2) {
      recommendations.push('Balance approaching minimum threshold - consider reducing risk');
    }

    return recommendations;
  }

  /**
   * Update consecutive losses count
   */
  private updateConsecutiveLosses(recentTrades: TradeRecord[]): void {
    // Count consecutive losses from most recent trades
    let consecutiveLosses = 0;
    
    for (let i = recentTrades.length - 1; i >= 0; i--) {
      const trade = recentTrades[i];
      if (trade && trade.pnl && trade.pnl < 0) {
        consecutiveLosses++;
      } else {
        break;
      }
    }

    this.consecutiveLosses = consecutiveLosses;
  }

  /**
   * Get current safety status summary
   */
  public getSafetySummary(): {
    dailyLoss: number;
    consecutiveLosses: number;
    circuitBreakerActive: boolean;
    emergencyStopActive: boolean;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  } {
    return {
      dailyLoss: this.dailyLoss,
      consecutiveLosses: this.consecutiveLosses,
      circuitBreakerActive: this.circuitBreaker.isActive,
      emergencyStopActive: this.emergencyStop,
      riskLevel: this.getCurrentRiskLevel()
    };
  }

  /**
   * Get current risk level based on various factors
   */
  private getCurrentRiskLevel(): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    if (this.emergencyStop || this.circuitBreaker.isActive) {
      return 'CRITICAL';
    }

    if (this.dailyLoss < -(this.thresholds.maxDailyLoss * 0.8) ||
        this.consecutiveLosses >= this.thresholds.maxConsecutiveLosses) {
      return 'HIGH';
    }

    if (this.dailyLoss < -(this.thresholds.maxDailyLoss * 0.5) ||
        this.consecutiveLosses >= this.thresholds.maxConsecutiveLosses * 0.5) {
      return 'MEDIUM';
    }

    return 'LOW';
  }
} 