import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import { DatabaseConfig } from '@/types/config';
import { RiskMetrics } from '@/trading/risk-manager';
import logger from '@/utils/logger';

export interface TradeRecord {
  id: string;
  signalId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  entryPrice: number;
  exitPrice?: number;
  pnl?: number;
  fees: number;
  status: 'OPEN' | 'CLOSED' | 'CANCELLED';
  entryTime: number;
  exitTime?: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  confidence: number;
  strategy: string;
}

export interface SignalRecord {
  id: string;
  symbol: string;
  action: 'BUY' | 'SELL' | 'CLOSE';
  strength: 'STRONG' | 'MEDIUM' | 'WEAK';
  price: number;
  mfi: number;
  rsi: number;
  timeframe: string;
  strategy: string;
  confidence: number;
  timestamp: number;
  processed: boolean;
}

export interface PerformanceRecord {
  id: string;
  date: string; // YYYY-MM-DD
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  totalPnL: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  maxDrawdown: number;
  sharpeRatio: number;
  volatility: number;
}

export class TradingDatabase {
  private db: Database | null = null;
  private config: DatabaseConfig;
  private _isInitialized: boolean = false;

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  /**
   * Initialize database and create tables
   */
  public async initialize(): Promise<void> {
    try {
      const dbPath = path.resolve(this.config.path);
      this.db = await open({
        filename: dbPath,
        driver: sqlite3.Database
      });

      await this.createTables();
      this._isInitialized = true;
      
      logger.logSystem('DATABASE_INITIALIZED', { path: dbPath });
    } catch (error) {
      logger.logError(error as Error, 'Database Initialization');
      throw error;
    }
  }

  /**
   * Create database tables
   */
  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Trades table
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS trades (
        id TEXT PRIMARY KEY,
        signal_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        side TEXT NOT NULL,
        quantity REAL NOT NULL,
        entry_price REAL NOT NULL,
        exit_price REAL,
        pnl REAL,
        fees REAL DEFAULT 0,
        status TEXT NOT NULL,
        entry_time INTEGER NOT NULL,
        exit_time INTEGER,
        stop_loss_price REAL NOT NULL,
        take_profit_price REAL NOT NULL,
        confidence REAL NOT NULL,
        strategy TEXT NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

    // Signals table
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS signals (
        id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        action TEXT NOT NULL,
        strength TEXT NOT NULL,
        price REAL NOT NULL,
        mfi REAL NOT NULL,
        rsi REAL NOT NULL,
        timeframe TEXT NOT NULL,
        strategy TEXT NOT NULL,
        confidence REAL NOT NULL,
        timestamp INTEGER NOT NULL,
        processed BOOLEAN DEFAULT FALSE,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

    // Performance table
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS performance (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL UNIQUE,
        total_trades INTEGER DEFAULT 0,
        winning_trades INTEGER DEFAULT 0,
        losing_trades INTEGER DEFAULT 0,
        total_pnl REAL DEFAULT 0,
        win_rate REAL DEFAULT 0,
        avg_win REAL DEFAULT 0,
        avg_loss REAL DEFAULT 0,
        max_drawdown REAL DEFAULT 0,
        sharpe_ratio REAL DEFAULT 0,
        volatility REAL DEFAULT 0,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

    // Risk metrics table
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS risk_metrics (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        current_drawdown REAL NOT NULL,
        daily_pnl REAL NOT NULL,
        total_pnl REAL NOT NULL,
        max_drawdown REAL NOT NULL,
        sharpe_ratio REAL NOT NULL,
        volatility REAL NOT NULL,
        correlation REAL NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

    // Create indexes for better performance
    await this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);
      CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
      CREATE INDEX IF NOT EXISTS idx_trades_entry_time ON trades(entry_time);
      CREATE INDEX IF NOT EXISTS idx_signals_symbol ON signals(symbol);
      CREATE INDEX IF NOT EXISTS idx_signals_timestamp ON signals(timestamp);
      CREATE INDEX IF NOT EXISTS idx_signals_processed ON signals(processed);
      CREATE INDEX IF NOT EXISTS idx_performance_date ON performance(date);
    `);
  }

  /**
   * Store a new trade
   */
  public async storeTrade(trade: TradeRecord): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      await this.db.run(`
        INSERT INTO trades (
          id, signal_id, symbol, side, quantity, entry_price, exit_price, pnl, fees,
          status, entry_time, exit_time, stop_loss_price, take_profit_price,
          confidence, strategy
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        trade.id, trade.signalId, trade.symbol, trade.side, trade.quantity,
        trade.entryPrice, trade.exitPrice, trade.pnl, trade.fees, trade.status,
        trade.entryTime, trade.exitTime, trade.stopLossPrice, trade.takeProfitPrice,
        trade.confidence, trade.strategy
      ]);

      logger.logTrade('STORED', { tradeId: trade.id, symbol: trade.symbol });
    } catch (error) {
      logger.logError(error as Error, 'Store Trade');
      throw error;
    }
  }

  /**
   * Update trade with exit information
   */
  public async updateTradeExit(
    tradeId: string,
    exitPrice: number,
    pnl: number,
    fees: number
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      await this.db.run(`
        UPDATE trades 
        SET exit_price = ?, pnl = ?, fees = ?, status = 'CLOSED', exit_time = ?
        WHERE id = ?
      `, [exitPrice, pnl, fees, Date.now(), tradeId]);

      logger.logTrade('UPDATED', { tradeId, exitPrice, pnl });
    } catch (error) {
      logger.logError(error as Error, 'Update Trade Exit');
      throw error;
    }
  }

  /**
   * Store a new signal
   */
  public async storeSignal(signal: SignalRecord): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      await this.db.run(`
        INSERT INTO signals (
          id, symbol, action, strength, price, mfi, rsi, timeframe, strategy,
          confidence, timestamp, processed
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        signal.id, signal.symbol, signal.action, signal.strength, signal.price,
        signal.mfi, signal.rsi, signal.timeframe, signal.strategy, signal.confidence,
        signal.timestamp, signal.processed
      ]);

      logger.logSignal('STORED', { signalId: signal.id, symbol: signal.symbol });
    } catch (error) {
      logger.logError(error as Error, 'Store Signal');
      throw error;
    }
  }

  /**
   * Mark signal as processed
   */
  public async markSignalProcessed(signalId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      await this.db.run(`
        UPDATE signals SET processed = TRUE WHERE id = ?
      `, [signalId]);
    } catch (error) {
      logger.logError(error as Error, 'Mark Signal Processed');
      throw error;
    }
  }

  /**
   * Store performance metrics
   */
  public async storePerformance(performance: PerformanceRecord): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      await this.db.run(`
        INSERT OR REPLACE INTO performance (
          id, date, total_trades, winning_trades, losing_trades, total_pnl,
          win_rate, avg_win, avg_loss, max_drawdown, sharpe_ratio, volatility,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        performance.id, performance.date, performance.totalTrades,
        performance.winningTrades, performance.losingTrades, performance.totalPnL,
        performance.winRate, performance.avgWin, performance.avgLoss,
        performance.maxDrawdown, performance.sharpeRatio, performance.volatility,
        Date.now()
      ]);

      logger.logPerformance({ date: performance.date, totalPnL: performance.totalPnL });
    } catch (error) {
      logger.logError(error as Error, 'Store Performance');
      throw error;
    }
  }

  /**
   * Store risk metrics
   */
  public async storeRiskMetrics(metrics: RiskMetrics): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      await this.db.run(`
        INSERT INTO risk_metrics (
          id, timestamp, current_drawdown, daily_pnl, total_pnl, max_drawdown,
          sharpe_ratio, volatility, correlation
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        `risk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        Date.now(), metrics.currentDrawdown, metrics.dailyPnL, metrics.totalPnL,
        metrics.maxDrawdown, metrics.sharpeRatio, metrics.volatility, metrics.correlation
      ]);
    } catch (error) {
      logger.logError(error as Error, 'Store Risk Metrics');
      throw error;
    }
  }

  /**
   * Get open trades
   */
  public async getOpenTrades(): Promise<TradeRecord[]> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const rows = await this.db.all(`
        SELECT * FROM trades WHERE status = 'OPEN' ORDER BY entry_time DESC
      `);
      return rows.map(this.mapTradeRecord);
    } catch (error) {
      logger.logError(error as Error, 'Get Open Trades');
      throw error;
    }
  }

  /**
   * Get trade history
   */
  public async getTradeHistory(
    symbol?: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<TradeRecord[]> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      let query = `
        SELECT * FROM trades 
        WHERE status = 'CLOSED'
      `;
      const params: any[] = [];

      if (symbol) {
        query += ` AND symbol = ?`;
        params.push(symbol);
      }

      query += ` ORDER BY exit_time DESC LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const rows = await this.db.all(query, params);
      return rows.map(this.mapTradeRecord);
    } catch (error) {
      logger.logError(error as Error, 'Get Trade History');
      throw error;
    }
  }

  /**
   * Get unprocessed signals
   */
  public async getUnprocessedSignals(): Promise<SignalRecord[]> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const rows = await this.db.all(`
        SELECT * FROM signals WHERE processed = FALSE ORDER BY timestamp ASC
      `);
      return rows.map(this.mapSignalRecord);
    } catch (error) {
      logger.logError(error as Error, 'Get Unprocessed Signals');
      throw error;
    }
  }

  /**
   * Get performance for a date range
   */
  public async getPerformance(
    startDate: string,
    endDate: string
  ): Promise<PerformanceRecord[]> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const rows = await this.db.all(`
        SELECT * FROM performance 
        WHERE date BETWEEN ? AND ? 
        ORDER BY date ASC
      `, [startDate, endDate]);
      return rows.map(this.mapPerformanceRecord);
    } catch (error) {
      logger.logError(error as Error, 'Get Performance');
      throw error;
    }
  }

  /**
   * Calculate daily performance
   */
  public async calculateDailyPerformance(date: string): Promise<PerformanceRecord> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const startOfDay = new Date(date).getTime();
      const endOfDay = startOfDay + 24 * 60 * 60 * 1000 - 1;

      const trades = await this.db.all(`
        SELECT * FROM trades 
        WHERE exit_time BETWEEN ? AND ? AND status = 'CLOSED'
      `, [startOfDay, endOfDay]);

      const totalTrades = trades.length;
      const winningTrades = trades.filter((t: TradeRecord) => (t.pnl || 0) > 0).length;
      const losingTrades = totalTrades - winningTrades;
      const totalPnL = trades.reduce((sum: number, t: TradeRecord) => sum + (t.pnl || 0), 0);
      const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

      const winningTradesData = trades.filter((t: TradeRecord) => (t.pnl || 0) > 0);
      const losingTradesData = trades.filter((t: TradeRecord) => (t.pnl || 0) <= 0);

      const avgWin = winningTradesData.length > 0 
        ? winningTradesData.reduce((sum: number, t: TradeRecord) => sum + (t.pnl || 0), 0) / winningTradesData.length 
        : 0;

      const avgLoss = losingTradesData.length > 0 
        ? losingTradesData.reduce((sum: number, t: TradeRecord) => sum + (t.pnl || 0), 0) / losingTradesData.length 
        : 0;

      return {
        id: `perf_${date}`,
        date,
        totalTrades,
        winningTrades,
        losingTrades,
        totalPnL,
        winRate,
        avgWin,
        avgLoss,
        maxDrawdown: 0, // Would need to calculate from risk metrics
        sharpeRatio: 0, // Would need to calculate from risk metrics
        volatility: 0   // Would need to calculate from risk metrics
      };
    } catch (error) {
      logger.logError(error as Error, 'Calculate Daily Performance');
      throw error;
    }
  }

  /**
   * Close database connection
   */
  public async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
      this._isInitialized = false;
      logger.logSystem('DATABASE_CLOSED');
    }
  }

  /**
   * Create backup of database
   */
  public async createBackup(backupPath: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      // For now, we'll use a simple file copy approach
      // In production, you might want to use a more sophisticated backup method
      const fs = require('fs');
      const originalPath = this.config.path;
      
      fs.copyFileSync(originalPath, backupPath);
      
      logger.logSystem('DATABASE_BACKUP_CREATED', { backupPath });
    } catch (error) {
      logger.logError(error as Error, 'Database Backup');
      throw error;
    }
  }

  private mapTradeRecord(row: any): TradeRecord {
    return {
      id: row.id,
      signalId: row.signal_id,
      symbol: row.symbol,
      side: row.side,
      quantity: row.quantity,
      entryPrice: row.entry_price,
      exitPrice: row.exit_price,
      pnl: row.pnl,
      fees: row.fees,
      status: row.status,
      entryTime: row.entry_time,
      exitTime: row.exit_time,
      stopLossPrice: row.stop_loss_price,
      takeProfitPrice: row.take_profit_price,
      confidence: row.confidence,
      strategy: row.strategy
    };
  }

  private mapSignalRecord(row: any): SignalRecord {
    return {
      id: row.id,
      symbol: row.symbol,
      action: row.action,
      strength: row.strength,
      price: row.price,
      mfi: row.mfi,
      rsi: row.rsi,
      timeframe: row.timeframe,
      strategy: row.strategy,
      confidence: row.confidence,
      timestamp: row.timestamp,
      processed: Boolean(row.processed)
    };
  }

  private mapPerformanceRecord(row: any): PerformanceRecord {
    return {
      id: row.id,
      date: row.date,
      totalTrades: row.total_trades,
      winningTrades: row.winning_trades,
      losingTrades: row.losing_trades,
      totalPnL: row.total_pnl,
      winRate: row.win_rate,
      avgWin: row.avg_win,
      avgLoss: row.avg_loss,
      maxDrawdown: row.max_drawdown,
      sharpeRatio: row.sharpe_ratio,
      volatility: row.volatility
    };
  }
} 