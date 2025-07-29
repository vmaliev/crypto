import { BingXClient } from '@/api/bingx/client';
import { BingXAccountInfo, BingXPosition } from '@/types/bingx';
import { ProcessedSignal } from '@/types/signals';
import { BotConfig } from '@/types/config';

import { PositionSizer, PositionSizeRequest } from './position-sizer';
import { RiskManager, RiskMetrics } from './risk-manager';
import { TradeExecutionEngine, TradeExecutionRequest } from './execution-engine';
import { SafetyManager, SafetyThresholds, SafetyStatus } from './safety-manager';
import { TradingDatabase } from '@/database/trading-db';
import { NotificationManager } from '@/notifications/notification-manager';

import logger from '@/utils/logger';

export interface TradingEngineConfig {
  config: BotConfig;
  client: BingXClient;
  database: TradingDatabase;
  notifications: NotificationManager;
}

export interface TradingSession {
  id: string;
  startTime: number;
  endTime?: number;
  totalTrades: number;
  winningTrades: number;
  totalPnL: number;
  status: 'ACTIVE' | 'COMPLETED' | 'STOPPED';
}

export interface TradingStats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnL: number;
  avgWin: number;
  avgLoss: number;
  maxDrawdown: number;
  sharpeRatio: number;
  currentSession: TradingSession | null;
}

export class TradingEngine {
  private config: BotConfig;
  private client: BingXClient;
  private database: TradingDatabase;
  private notifications: NotificationManager;

  // Core components
  private positionSizer: PositionSizer;
  private riskManager: RiskManager;
  private executionEngine: TradeExecutionEngine;
  private safetyManager: SafetyManager;

  // State management
  private isRunning: boolean = false;
  private currentSession: TradingSession | null = null;
  private accountInfo: BingXAccountInfo | null = null;
  private openPositions: BingXPosition[] = [];
  private lastUpdateTime: number = 0;

  // Monitoring
  private updateInterval: NodeJS.Timeout | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(tradingConfig: TradingEngineConfig) {
    this.config = tradingConfig.config;
    this.client = tradingConfig.client;
    this.database = tradingConfig.database;
    this.notifications = tradingConfig.notifications;

    // Initialize components
    this.positionSizer = new PositionSizer(
      this.config.trading,
      this.config.riskManagement
    );

    this.riskManager = new RiskManager(this.config.riskManagement);

    this.executionEngine = new TradeExecutionEngine(this.client);

    const safetyThresholds: SafetyThresholds = {
      maxDailyLoss: this.config.trading.maxDailyLoss,
      maxDrawdown: 10, // 10% max drawdown
      maxOpenPositions: this.config.trading.maxOpenPositions,
      maxPositionSize: 1000, // $1000 max position size
      maxLeverage: this.config.trading.leverageMultiplier,
      minBalance: 100, // $100 minimum balance
      maxConsecutiveLosses: 5,
      maxVolatility: 50, // 50% max volatility
      emergencyStopLoss: 5 // 5% emergency stop loss
    };

    this.safetyManager = new SafetyManager(safetyThresholds);

    logger.logSystem('TRADING_ENGINE_INITIALIZED', {
      paperTrading: this.config.trading.paperTrading,
      maxPositions: this.config.trading.maxOpenPositions,
      positionSize: this.config.trading.positionSizePercent
    });
  }

  /**
   * Start the trading engine
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      logger.logSystem('TRADING_ENGINE_ALREADY_RUNNING');
      return;
    }

    try {
      // Initialize database
      await this.database.initialize();

      // Get initial account information
      await this.updateAccountInfo();

      // Start new trading session
      this.startNewSession();

      // Start monitoring
      this.startMonitoring();

      this.isRunning = true;

      await this.notifications.notifySystemStatus('STARTED', {
        paperTrading: this.config.trading.paperTrading,
        maxPositions: this.config.trading.maxOpenPositions
      });

      logger.logSystem('TRADING_ENGINE_STARTED', {
        sessionId: this.currentSession?.id,
        accountBalance: this.accountInfo?.availableBalance
      });

    } catch (error) {
      logger.logError(error as Error, 'Trading Engine Start');
      await this.notifications.notifySystemStatus('ERROR', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Stop the trading engine
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      // Stop monitoring
      this.stopMonitoring();

      // End current session
      if (this.currentSession) {
        this.endCurrentSession();
      }

      // Close database connection
      await this.database.close();

      this.isRunning = false;

      await this.notifications.notifySystemStatus('STOPPED', {
        sessionDuration: this.currentSession ? 
          (Date.now() - this.currentSession.startTime) / 1000 / 60 : 0 // minutes
      });

      logger.logSystem('TRADING_ENGINE_STOPPED');

    } catch (error) {
      logger.logError(error as Error, 'Trading Engine Stop');
      throw error;
    }
  }

  /**
   * Process a trading signal
   */
  public async processSignal(signal: ProcessedSignal): Promise<boolean> {
    if (!this.isRunning) {
      logger.logSystem('TRADING_ENGINE_NOT_RUNNING');
      return false;
    }

    try {
      // Update account info and positions
      await this.updateAccountInfo();
      await this.updatePositions();

      // Notify signal received
      await this.notifications.notifySignalReceived(signal);

      // Get current price
      const currentPrice = await this.getCurrentPrice(signal.symbol);
      if (!currentPrice) {
        logger.logRisk('PRICE_FETCH_FAILED', { symbol: signal.symbol });
        return false;
      }

      // Check safety status
      const safetyStatus = this.safetyManager.checkSafety(
        this.accountInfo!,
        this.openPositions,
        this.riskManager.getRiskMetrics(parseFloat(this.accountInfo!.availableBalance)),
        await this.database.getTradeHistory(signal.symbol, 10)
      );

      if (!safetyStatus.isTradingEnabled) {
        logger.logRisk('SAFETY_CHECK_FAILED', {
          warnings: safetyStatus.warnings,
          riskLevel: safetyStatus.riskLevel
        });

        if (safetyStatus.riskLevel === 'CRITICAL') {
          await this.notifications.notifySafetyStatus(safetyStatus);
        }

        return false;
      }

      // Check risk
      const riskCheck = this.riskManager.checkTradeRisk(
        signal,
        currentPrice,
        parseFloat(this.accountInfo!.availableBalance),
        this.openPositions,
        this.riskManager.getVolatility(signal.symbol)
      );

      if (!riskCheck.shouldTrade) {
        logger.logRisk('RISK_CHECK_FAILED', {
          warnings: riskCheck.warnings,
          riskLevel: riskCheck.riskLevel
        });
        return false;
      }

      // Calculate position size
      const positionRequest: PositionSizeRequest = {
        symbol: signal.symbol,
        price: currentPrice,
        confidence: signal.confidence,
        signalStrength: signal.strength,
        accountBalance: parseFloat(this.accountInfo!.availableBalance),
        currentPositions: this.openPositions.length,
        volatility: this.riskManager.getVolatility(signal.symbol),
        maxRiskPerTrade: this.config.riskManagement.maxRiskPerTrade
      };

      const positionSize = this.positionSizer.calculatePositionSize(positionRequest);

      if (positionSize.quantity <= 0) {
        logger.logRisk('POSITION_SIZE_ZERO', {
          warnings: positionSize.warnings,
          symbol: signal.symbol
        });
        return false;
      }

      // Execute trade
      const executionRequest: TradeExecutionRequest = {
        signal,
        positionSize,
        riskCheck,
        currentPrice,
        accountInfo: this.accountInfo!
      };

      const executionResult = await this.executionEngine.executeTrade(executionRequest);

      // Notify trade execution
      await this.notifications.notifyTradeExecuted(executionResult, signal);

      if (executionResult.success) {
        // Store trade in database
        await this.database.storeTrade({
          id: executionResult.orderId!,
          signalId: signal.id,
          symbol: signal.symbol,
          side: signal.action === 'BUY' ? 'BUY' : 'SELL',
          quantity: executionResult.executedQuantity!,
          entryPrice: executionResult.executedPrice!,
          fees: executionResult.fees || 0,
          status: 'OPEN',
          entryTime: executionResult.timestamp,
          stopLossPrice: riskCheck.stopLossPrice,
          takeProfitPrice: riskCheck.takeProfitPrice,
          confidence: signal.confidence,
          strategy: positionSize.strategy
        });

        // Mark signal as processed
        await this.database.markSignalProcessed(signal.id);

        // Update session stats
        if (this.currentSession) {
          this.currentSession.totalTrades++;
        }

        logger.logTrade('EXECUTED', {
          symbol: signal.symbol,
          action: signal.action,
          quantity: executionResult.executedQuantity,
          price: executionResult.executedPrice,
          orderId: executionResult.orderId
        });

        return true;
      } else {
        logger.logError(new Error(executionResult.error || 'Trade execution failed'), 'Trade Execution');
        return false;
      }

    } catch (error) {
      logger.logError(error as Error, 'Signal Processing');
      return false;
    }
  }

  /**
   * Get trading statistics
   */
  public async getTradingStats(): Promise<TradingStats> {
    const trades = await this.database.getTradeHistory(undefined, 1000);
    const performance = await this.database.getPerformance(
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days ago
      new Date().toISOString().split('T')[0]
    );

    const totalTrades = trades.length;
    const winningTrades = trades.filter(t => (t.pnl || 0) > 0).length;
    const losingTrades = totalTrades - winningTrades;
    const winRate = totalTrades > 0 ? winningTrades / totalTrades : 0;
    const totalPnL = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);

    const winningTradesData = trades.filter(t => (t.pnl || 0) > 0);
    const losingTradesData = trades.filter(t => (t.pnl || 0) <= 0);

    const avgWin = winningTradesData.length > 0 
      ? winningTradesData.reduce((sum, t) => sum + (t.pnl || 0), 0) / winningTradesData.length 
      : 0;

    const avgLoss = losingTradesData.length > 0 
      ? losingTradesData.reduce((sum, t) => sum + (t.pnl || 0), 0) / losingTradesData.length 
      : 0;

    const latestPerformance = performance[performance.length - 1];

    return {
      totalTrades,
      winningTrades,
      losingTrades,
      winRate,
      totalPnL,
      avgWin,
      avgLoss,
      maxDrawdown: latestPerformance?.maxDrawdown || 0,
      sharpeRatio: latestPerformance?.sharpeRatio || 0,
      currentSession: this.currentSession
    };
  }

  /**
   * Get current status
   */
  public getStatus(): {
    isRunning: boolean;
    currentSession: TradingSession | null;
    accountBalance: string;
    openPositions: number;
    safetyStatus: SafetyStatus;
    riskMetrics: RiskMetrics;
  } {
    const accountBalance = this.accountInfo?.availableBalance || '0';
    const riskMetrics = this.riskManager.getRiskMetrics(parseFloat(accountBalance));
    const safetyStatus = this.safetyManager.checkSafety(
      this.accountInfo!,
      this.openPositions,
      riskMetrics,
      []
    );

    return {
      isRunning: this.isRunning,
      currentSession: this.currentSession,
      accountBalance,
      openPositions: this.openPositions.length,
      safetyStatus,
      riskMetrics
    };
  }

  /**
   * Force close all positions
   */
  public async closeAllPositions(): Promise<void> {
    logger.logSystem('CLOSING_ALL_POSITIONS');

    for (const position of this.openPositions) {
      try {
        const quantity = Math.abs(parseFloat(position.positionAmt));
        const side = parseFloat(position.positionAmt) > 0 ? 'LONG' : 'SHORT';

        await this.executionEngine.closePosition(
          position.symbol,
          side,
          quantity
        );

        logger.logTrade('FORCE_CLOSED', {
          symbol: position.symbol,
          side,
          quantity
        });

      } catch (error) {
        logger.logError(error as Error, 'Force Close Position');
      }
    }
  }

  /**
   * Update account information
   */
  private async updateAccountInfo(): Promise<void> {
    try {
      this.accountInfo = await this.client.getAccountInfo();
      this.lastUpdateTime = Date.now();
    } catch (error) {
      logger.logError(error as Error, 'Update Account Info');
    }
  }

  /**
   * Update open positions
   */
  private async updatePositions(): Promise<void> {
    try {
      this.openPositions = await this.client.getPositions();
    } catch (error) {
      logger.logError(error as Error, 'Update Positions');
    }
  }

  /**
   * Get current price for a symbol
   */
  private async getCurrentPrice(symbol: string): Promise<number | null> {
    try {
      const ticker = await this.client.getTicker(symbol);
      if (Array.isArray(ticker)) {
        return parseFloat(ticker[0].price);
      } else {
        return parseFloat(ticker.price);
      }
    } catch (error) {
      logger.logError(error as Error, 'Get Current Price');
      return null;
    }
  }

  /**
   * Start new trading session
   */
  private startNewSession(): void {
    this.currentSession = {
      id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      startTime: Date.now(),
      totalTrades: 0,
      winningTrades: 0,
      totalPnL: 0,
      status: 'ACTIVE'
    };

    this.safetyManager.startTradingSession();
    logger.logSystem('NEW_TRADING_SESSION_STARTED', { sessionId: this.currentSession.id });
  }

  /**
   * End current trading session
   */
  private endCurrentSession(): void {
    if (this.currentSession) {
      this.currentSession.endTime = Date.now();
      this.currentSession.status = 'COMPLETED';

      this.safetyManager.endTradingSession(
        this.currentSession.totalPnL,
        this.currentSession.totalTrades
      );

      logger.logSystem('TRADING_SESSION_ENDED', {
        sessionId: this.currentSession.id,
        duration: (this.currentSession.endTime - this.currentSession.startTime) / 1000 / 60, // minutes
        totalTrades: this.currentSession.totalTrades,
        totalPnL: this.currentSession.totalPnL
      });
    }
  }

  /**
   * Start monitoring intervals
   */
  private startMonitoring(): void {
    // Update account info every 30 seconds
    this.updateInterval = setInterval(async () => {
      await this.updateAccountInfo();
      await this.updatePositions();
    }, 30000);

    // Health check every 5 minutes
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, 300000);
  }

  /**
   * Stop monitoring intervals
   */
  private stopMonitoring(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Perform health check
   */
  private async performHealthCheck(): Promise<void> {
    try {
      // Test API connectivity
      const isConnected = await this.client.testConnectivity();
      
      if (!isConnected) {
        logger.logRisk('API_CONNECTIVITY_LOST');
        await this.notifications.notifySystemStatus('ERROR', { 
          error: 'API connectivity lost' 
        });
      }

      // Check for stale data
      const timeSinceUpdate = Date.now() - this.lastUpdateTime;
      if (timeSinceUpdate > 60000) { // More than 1 minute
        logger.logRisk('STALE_DATA_DETECTED', { timeSinceUpdate });
      }

    } catch (error) {
      logger.logError(error as Error, 'Health Check');
    }
  }
} 