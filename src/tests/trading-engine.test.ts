import { PositionSizer, PositionSizeRequest, PositionSizeResult } from '@/trading/position-sizer';
import { RiskManager, RiskCheckResult, RiskMetrics } from '@/trading/risk-manager';
import { TradeExecutionEngine, TradeExecutionRequest } from '@/trading/execution-engine';
import { SafetyManager, SafetyThresholds, SafetyStatus } from '@/trading/safety-manager';
import { TradingConfig, RiskManagementConfig } from '@/types/config';
import { ProcessedSignal } from '@/types/signals';
import { BingXAccountInfo, BingXPosition } from '@/types/bingx';

// Mock BingX client for testing
class MockBingXClient {
  async placeOrder() {
    return {
      orderId: 12345,
      clientOrderId: 'test_order_123'
    };
  }
}

describe('Trading Engine Components', () => {
  let positionSizer: PositionSizer;
  let riskManager: RiskManager;
  let executionEngine: TradeExecutionEngine;
  let safetyManager: SafetyManager;

  const mockTradingConfig: TradingConfig = {
    positionSizePercent: 2,
    maxDailyLoss: 5,
    maxOpenPositions: 3,
    leverageMultiplier: 10,
    paperTrading: true
  };

  const mockRiskConfig: RiskManagementConfig = {
    stopLossPercent: 2,
    takeProfitPercent: 4,
    trailingStopPercent: 1,
    useVolatilityStops: true,
    maxRiskPerTrade: 2,
    riskRewardRatio: 2
  };

  const mockSafetyThresholds: SafetyThresholds = {
    maxDailyLoss: 5,
    maxDrawdown: 10,
    maxOpenPositions: 3,
    maxPositionSize: 1000,
    maxLeverage: 10,
    minBalance: 100,
    maxConsecutiveLosses: 5,
    maxVolatility: 50,
    emergencyStopLoss: 5
  };

  beforeEach(() => {
    positionSizer = new PositionSizer(mockTradingConfig, mockRiskConfig);
    riskManager = new RiskManager(mockRiskConfig);
    executionEngine = new TradeExecutionEngine(new MockBingXClient() as any);
    safetyManager = new SafetyManager(mockSafetyThresholds);
  });

  describe('PositionSizer', () => {
    const mockRequest: PositionSizeRequest = {
      symbol: 'BTCUSDT',
      price: 50000,
      confidence: 0.8,
      signalStrength: 'STRONG',
      accountBalance: 10000,
      currentPositions: 1,
      volatility: 30
    };

    it('should calculate position size correctly', () => {
      const result = positionSizer.calculatePositionSize(mockRequest);
      
      expect(result.success).toBe(true);
      expect(result.quantity).toBeGreaterThan(0);
      expect(result.notionalValue).toBeGreaterThan(0);
      expect(result.riskAmount).toBeGreaterThan(0);
      expect(result.confidence).toBe(0.8);
    });

    it('should return zero position when max positions reached', () => {
      const request = { ...mockRequest, currentPositions: 3 };
      const result = positionSizer.calculatePositionSize(request);
      
      expect(result.quantity).toBe(0);
      expect(result.warnings).toContain('Maximum open positions (3) reached');
    });

    it('should handle high volatility correctly', () => {
      const request = { ...mockRequest, volatility: 80 };
      const result = positionSizer.calculatePositionSize(request);
      
      expect(result.quantity).toBeLessThan(
        positionSizer.calculatePositionSize({ ...mockRequest, volatility: 20 }).quantity
      );
    });

    it('should validate position size against account limits', () => {
      const mockAccountInfo: BingXAccountInfo = {
        availableBalance: '5000',
        totalBalance: '10000',
        totalUnrealizedProfit: '0',
        totalMarginBalance: '10000',
        totalMaintMargin: '0',
        totalInitialMargin: '0',
        totalPositionInitialMargin: '0',
        totalOpenOrderInitialMargin: '0',
        totalCrossWalletBalance: '10000',
        totalCrossUnPnl: '0',
        availableBalance: '5000',
        maxWithdrawAmount: '5000'
      };

      const result = positionSizer.validatePositionSize(0.1, 50000, mockAccountInfo);
      expect(result).toBe(true);
    });
  });

  describe('RiskManager', () => {
    const mockSignal: ProcessedSignal = {
      id: 'signal_123',
      timestamp: new Date(),
      symbol: 'BTCUSDT',
      action: 'BUY',
      strength: 'STRONG',
      price: 50000,
      mfi: 25,
      rsi: 30,
      timeframe: '1h',
      strategy: 'MFI_RSI',
      confidence: 0.8,
      isValid: true,
      validationErrors: []
    };

    const mockPositions: BingXPosition[] = [];

    it('should check trade risk correctly', () => {
      const result = riskManager.checkTradeRisk(
        mockSignal,
        50000,
        10000,
        mockPositions,
        30
      );

      expect(result.shouldTrade).toBe(true);
      expect(result.riskLevel).toBe('LOW');
      expect(result.stopLossPrice).toBeLessThan(50000);
      expect(result.takeProfitPrice).toBeGreaterThan(50000);
    });

    it('should prevent trading when daily loss limit reached', () => {
      riskManager.updateRiskMetrics(-600); // Exceed 5% daily loss
      
      const result = riskManager.checkTradeRisk(
        mockSignal,
        50000,
        10000,
        mockPositions
      );

      expect(result.shouldTrade).toBe(false);
      expect(result.riskLevel).toBe('CRITICAL');
      expect(result.warnings).toContain('Daily loss limit reached');
    });

    it('should calculate volatility correctly', () => {
      const prices = [100, 102, 98, 105, 103, 107, 104, 106];
      prices.forEach(price => riskManager.updateVolatility('BTCUSDT', price));
      
      const volatility = riskManager.getVolatility('BTCUSDT');
      expect(volatility).toBeGreaterThan(0);
    });

    it('should update risk metrics correctly', () => {
      riskManager.updateRiskMetrics(100);
      const metrics = riskManager.getRiskMetrics(10000);
      
      expect(metrics.dailyPnL).toBe(100);
      expect(metrics.maxDrawdown).toBeGreaterThanOrEqual(0);
    });
  });

  describe('SafetyManager', () => {
    const mockAccountInfo: BingXAccountInfo = {
      availableBalance: '10000',
      totalBalance: '10000',
      totalUnrealizedProfit: '0',
      totalMarginBalance: '10000',
      totalMaintMargin: '0',
      totalInitialMargin: '0',
      totalPositionInitialMargin: '0',
      totalOpenOrderInitialMargin: '0',
      totalCrossWalletBalance: '10000',
      totalCrossUnPnl: '0',
      maxWithdrawAmount: '10000'
    };

    const mockRiskMetrics: RiskMetrics = {
      currentDrawdown: 2,
      dailyPnL: -100,
      totalPnL: -100,
      maxDrawdown: 5,
      sharpeRatio: 1.2,
      volatility: 25,
      correlation: 0.1
    };

    it('should check safety status correctly', () => {
      const status = safetyManager.checkSafety(
        mockAccountInfo,
        [],
        mockRiskMetrics,
        []
      );

      expect(status.isTradingEnabled).toBe(true);
      expect(status.riskLevel).toBe('LOW');
      expect(status.circuitBreakerActive).toBe(false);
      expect(status.emergencyStopActive).toBe(false);
    });

    it('should trigger circuit breaker on excessive losses', () => {
      safetyManager.updateDailyLoss(-600); // Exceed 5% daily loss
      
      const status = safetyManager.checkSafety(
        mockAccountInfo,
        [],
        mockRiskMetrics,
        []
      );

      expect(status.isTradingEnabled).toBe(false);
      expect(status.circuitBreakerActive).toBe(true);
      expect(status.riskLevel).toBe('CRITICAL');
    });

    it('should activate emergency stop', () => {
      safetyManager.activateEmergencyStop();
      
      const status = safetyManager.checkSafety(
        mockAccountInfo,
        [],
        mockRiskMetrics,
        []
      );

      expect(status.isTradingEnabled).toBe(false);
      expect(status.emergencyStopActive).toBe(true);
      expect(status.riskLevel).toBe('CRITICAL');
    });

    it('should provide safety recommendations', () => {
      safetyManager.updateDailyLoss(-400); // Approach 5% limit
      
      const recommendations = safetyManager.getSafetyRecommendations(
        mockAccountInfo,
        []
      );

      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations[0]).toContain('daily loss limit');
    });

    it('should track trading sessions', () => {
      safetyManager.startTradingSession();
      safetyManager.endTradingSession(100, 5);
      
      const stats = safetyManager.getSessionStats();
      expect(stats.totalSessions).toBe(1);
      expect(stats.averageSessionPnL).toBe(100);
    });
  });

  describe('Integration Tests', () => {
    it('should process a complete trade flow', async () => {
      const signal: ProcessedSignal = {
        id: 'signal_123',
        timestamp: new Date(),
        symbol: 'BTCUSDT',
        action: 'BUY',
        strength: 'STRONG',
        price: 50000,
        mfi: 25,
        rsi: 30,
        timeframe: '1h',
        strategy: 'MFI_RSI',
        confidence: 0.8,
        isValid: true,
        validationErrors: []
      };

      const accountInfo: BingXAccountInfo = {
        availableBalance: '10000',
        totalBalance: '10000',
        totalUnrealizedProfit: '0',
        totalMarginBalance: '10000',
        totalMaintMargin: '0',
        totalInitialMargin: '0',
        totalPositionInitialMargin: '0',
        totalOpenOrderInitialMargin: '0',
        totalCrossWalletBalance: '10000',
        totalCrossUnPnl: '0',
        maxWithdrawAmount: '10000'
      };

      // 1. Calculate position size
      const positionRequest: PositionSizeRequest = {
        symbol: signal.symbol,
        price: signal.price,
        confidence: signal.confidence,
        signalStrength: signal.strength,
        accountBalance: parseFloat(accountInfo.availableBalance),
        currentPositions: 0,
        volatility: 30
      };

      const positionSize = positionSizer.calculatePositionSize(positionRequest);

      // 2. Check risk
      const riskCheck = riskManager.checkTradeRisk(
        signal,
        signal.price,
        parseFloat(accountInfo.availableBalance),
        [],
        30
      );

      // 3. Check safety
      const safetyStatus = safetyManager.checkSafety(
        accountInfo,
        [],
        riskManager.getRiskMetrics(parseFloat(accountInfo.availableBalance)),
        []
      );

      // 4. Execute trade if all checks pass
      if (positionSize.quantity > 0 && riskCheck.shouldTrade && safetyStatus.isTradingEnabled) {
        const executionRequest: TradeExecutionRequest = {
          signal,
          positionSize,
          riskCheck,
          currentPrice: signal.price,
          accountInfo
        };

        const result = await executionEngine.executeTrade(executionRequest);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid position size requests', () => {
      const invalidRequest: PositionSizeRequest = {
        symbol: 'BTCUSDT',
        price: 0, // Invalid price
        confidence: 0.8,
        signalStrength: 'STRONG',
        accountBalance: 10000,
        currentPositions: 0
      };

      expect(() => {
        positionSizer.calculatePositionSize(invalidRequest);
      }).toThrow('Invalid price: must be greater than 0');
    });

    it('should handle negative account balance', () => {
      const invalidRequest: PositionSizeRequest = {
        symbol: 'BTCUSDT',
        price: 50000,
        confidence: 0.8,
        signalStrength: 'STRONG',
        accountBalance: -1000, // Invalid balance
        currentPositions: 0
      };

      expect(() => {
        positionSizer.calculatePositionSize(invalidRequest);
      }).toThrow('Invalid account balance: must be greater than 0');
    });
  });

  describe('Performance Tests', () => {
    it('should handle high-frequency position sizing', () => {
      const startTime = Date.now();
      const iterations = 1000;

      for (let i = 0; i < iterations; i++) {
        const request: PositionSizeRequest = {
          symbol: 'BTCUSDT',
          price: 50000 + (i % 1000),
          confidence: 0.5 + (i % 50) / 100,
          signalStrength: 'MEDIUM',
          accountBalance: 10000,
          currentPositions: i % 3,
          volatility: 20 + (i % 30)
        };

        positionSizer.calculatePositionSize(request);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
    });
  });
}); 