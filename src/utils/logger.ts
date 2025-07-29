import winston from 'winston';
import path from 'path';
import fs from 'fs';
import config from './config';

class Logger {
  private static instance: Logger;
  private logger: winston.Logger;

  private constructor() {
    this.createLogDirectory();
    this.logger = this.createLogger();
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private createLogDirectory(): void {
    const logConfig = config.getLoggingConfig();
    const logDir = path.dirname(logConfig.file);
    
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  private createLogger(): winston.Logger {
    const logConfig = config.getLoggingConfig();
    
    const formats = [
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss.SSS'
      }),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ];

    const consoleFormat = winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss.SSS'
      }),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let metaStr = '';
        if (Object.keys(meta).length > 0) {
          metaStr = ' ' + JSON.stringify(meta);
        }
        return `${timestamp} [${level}]: ${message}${metaStr}`;
      })
    );

    const transports: winston.transport[] = [
      new winston.transports.File({
        filename: logConfig.file,
        level: logConfig.level,
        format: winston.format.combine(...formats),
        maxsize: this.parseSize(logConfig.maxSize),
        maxFiles: logConfig.maxFiles,
        tailable: true,
      }),
      new winston.transports.File({
        filename: logConfig.file.replace('.log', '.error.log'),
        level: 'error',
        format: winston.format.combine(...formats),
        maxsize: this.parseSize(logConfig.maxSize),
        maxFiles: logConfig.maxFiles,
        tailable: true,
      })
    ];

    if (logConfig.console) {
      transports.push(
        new winston.transports.Console({
          level: logConfig.level,
          format: consoleFormat,
        })
      );
    }

    return winston.createLogger({
      level: logConfig.level,
      transports,
      exitOnError: false,
    });
  }

  private parseSize(size: string): number {
    const units: { [key: string]: number } = {
      'b': 1,
      'k': 1024,
      'm': 1024 * 1024,
      'g': 1024 * 1024 * 1024,
    };

    const match = size.toLowerCase().match(/^(\d+)([bkmg]?)$/);
    if (!match) {
      return 10 * 1024 * 1024; // Default 10MB
    }

    const [, num, unit = 'b'] = match;
    if (!num) return 10 * 1024 * 1024; // Default 10MB
    return parseInt(num) * (units[unit] || 1);
  }

  // Core logging methods
  public error(message: string, meta?: any): void {
    this.logger.error(message, meta);
  }

  public warn(message: string, meta?: any): void {
    this.logger.warn(message, meta);
  }

  public info(message: string, meta?: any): void {
    this.logger.info(message, meta);
  }

  public debug(message: string, meta?: any): void {
    this.logger.debug(message, meta);
  }

  // Trading-specific logging methods
  public logSignal(action: string, signal: any): void {
    this.info(`Signal ${action}`, {
      type: 'SIGNAL',
      action,
      signal: {
        symbol: signal.symbol,
        action: signal.action,
        price: signal.price,
        strength: signal.signal_strength,
        mfi: signal.mfi_value,
        rsi: signal.rsi_value,
      }
    });
  }

  public logTrade(action: string, trade: any): void {
    this.info(`Trade ${action}`, {
      type: 'TRADE',
      action,
      trade: {
        symbol: trade.symbol,
        side: trade.side,
        quantity: trade.quantity,
        price: trade.price,
        orderId: trade.orderId,
      }
    });
  }

  public logPosition(action: string, position: any): void {
    this.info(`Position ${action}`, {
      type: 'POSITION',
      action,
      position: {
        symbol: position.symbol,
        side: position.side,
        size: position.size,
        entryPrice: position.entryPrice,
        unrealizedPnl: position.unrealizedPnl,
      }
    });
  }

  public logRisk(action: string, risk: any): void {
    this.warn(`Risk ${action}`, {
      type: 'RISK',
      action,
      risk
    });
  }

  public logSystem(action: string, data?: any): void {
    this.info(`System ${action}`, {
      type: 'SYSTEM',
      action,
      data
    });
  }

  public logPerformance(metrics: any): void {
    this.info('Performance metrics', {
      type: 'PERFORMANCE',
      metrics
    });
  }

  public logWebhook(action: string, data: any): void {
    this.info(`Webhook ${action}`, {
      type: 'WEBHOOK',
      action,
      data: {
        ip: data.ip,
        symbol: data.symbol,
        action: data.action,
        timestamp: data.timestamp,
      }
    });
  }

  public logAPI(action: string, endpoint: string, data?: any): void {
    this.debug(`API ${action}`, {
      type: 'API',
      action,
      endpoint,
      data
    });
  }

  public logError(error: Error, context?: string): void {
    this.error(`Error${context ? ` in ${context}` : ''}`, {
      type: 'ERROR',
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      context
    });
  }

  // Utility methods
  public setLevel(level: string): void {
    this.logger.level = level;
  }

  public getLevel(): string {
    return this.logger.level;
  }

  public flush(): Promise<void> {
    return new Promise((resolve) => {
      this.logger.on('finish', resolve);
      this.logger.end();
    });
  }

  // Create child logger with additional context
  public child(context: any): winston.Logger {
    return this.logger.child(context);
  }
}

// Export singleton instance
export const logger = Logger.getInstance();
export default logger;

// Helper function for structured logging
export function createLogContext(type: string, action: string, data?: any) {
  return {
    type: type.toUpperCase(),
    action,
    timestamp: new Date().toISOString(),
    environment: config.getEnvironmentInfo(),
    ...data
  };
}

// Performance timing utility
export class PerformanceTimer {
  private startTime: number;
  private name: string;

  constructor(name: string) {
    this.name = name;
    this.startTime = Date.now();
  }

  public end(additionalData?: any): number {
    const duration = Date.now() - this.startTime;
    logger.debug(`Performance: ${this.name}`, {
      type: 'PERFORMANCE',
      name: this.name,
      duration,
      ...additionalData
    });
    return duration;
  }
}

// Request ID generator for tracing
let requestIdCounter = 0;
export function generateRequestId(): string {
  return `req_${Date.now()}_${++requestIdCounter}`;
}