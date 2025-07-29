import dotenv from 'dotenv';
import { BotConfig, EnvironmentVariables } from '@/types/config';

// Load environment variables
dotenv.config();

class ConfigManager {
  private static instance: ConfigManager;
  private config: BotConfig;

  private constructor() {
    this.config = this.loadConfig();
    this.validateConfig();
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  private loadConfig(): BotConfig {
    const env = process.env as unknown as EnvironmentVariables;

    return {
      trading: {
        positionSizePercent: parseFloat(env.POSITION_SIZE_PERCENT || '2'),
        maxDailyLoss: parseFloat(env.MAX_DAILY_LOSS || '5'),
        maxOpenPositions: parseInt(env.MAX_OPEN_POSITIONS || '3'),
        leverageMultiplier: parseInt(env.LEVERAGE_MULTIPLIER || '10'),
        paperTrading: env.PAPER_TRADING?.toLowerCase() === 'true',
      },
      riskManagement: {
        stopLossPercent: parseFloat(env.STOP_LOSS_PERCENT || '2'),
        takeProfitPercent: parseFloat(env.TAKE_PROFIT_PERCENT || '4'),
        trailingStopPercent: parseFloat(env.TRAILING_STOP_PERCENT || '1'),
        useVolatilityStops: env.USE_VOLATILITY_STOPS?.toLowerCase() === 'true',
        maxRiskPerTrade: parseFloat(env.POSITION_SIZE_PERCENT || '2'),
        riskRewardRatio: parseFloat(env.TAKE_PROFIT_PERCENT || '4') / parseFloat(env.STOP_LOSS_PERCENT || '2'),
      },
      webhook: {
        port: parseInt(env.WEBHOOK_PORT || '3000'),
        secret: env.WEBHOOK_SECRET || '',
        allowedIPs: env.ALLOWED_IPS?.split(',').map(ip => ip.trim()) || ['127.0.0.1'],
        rateLimitWindowMs: 60000, // 1 minute
        rateLimitMaxRequests: 100,
      },
      bingx: {
        apiKey: env.BINGX_API_KEY || '',
        secretKey: env.BINGX_SECRET_KEY || '',
        testnet: env.BINGX_TESTNET?.toLowerCase() === 'true',
        baseUrl: env.BINGX_BASE_URL || 'https://open-api.bingx.com',
        timeout: 10000,
        retryAttempts: 3,
        retryDelay: 1000,
      },
      notifications: {
        discord: env.DISCORD_WEBHOOK_URL ? {
          webhookUrl: env.DISCORD_WEBHOOK_URL,
          enabled: true,
        } : undefined,
        telegram: env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID ? {
          botToken: env.TELEGRAM_BOT_TOKEN,
          chatId: env.TELEGRAM_CHAT_ID,
          enabled: true,
        } : undefined,
      },
      database: {
        path: env.DATABASE_PATH || './data/trading.db',
        backupInterval: 24 * 60 * 60 * 1000, // 24 hours
        maxBackups: 7,
      },
      logging: {
        level: (env.LOG_LEVEL as any) || 'info',
        file: env.LOG_FILE || './logs/trading.log',
        maxSize: '10m',
        maxFiles: 5,
        console: true,
      },
    };
  }

  private validateConfig(): void {
    const errors: string[] = [];

    // Validate required BingX credentials
    if (!this.config.bingx.apiKey) {
      errors.push('BINGX_API_KEY is required');
    }
    if (!this.config.bingx.secretKey) {
      errors.push('BINGX_SECRET_KEY is required');
    }

    // Validate webhook secret
    if (!this.config.webhook.secret) {
      errors.push('WEBHOOK_SECRET is required');
    }

    // Validate trading parameters
    if (this.config.trading.positionSizePercent <= 0 || this.config.trading.positionSizePercent > 100) {
      errors.push('POSITION_SIZE_PERCENT must be between 0 and 100');
    }
    if (this.config.trading.maxDailyLoss <= 0 || this.config.trading.maxDailyLoss > 100) {
      errors.push('MAX_DAILY_LOSS must be between 0 and 100');
    }
    if (this.config.trading.maxOpenPositions <= 0) {
      errors.push('MAX_OPEN_POSITIONS must be greater than 0');
    }
    if (this.config.trading.leverageMultiplier <= 0 || this.config.trading.leverageMultiplier > 125) {
      errors.push('LEVERAGE_MULTIPLIER must be between 1 and 125');
    }

    // Validate risk management
    if (this.config.riskManagement.stopLossPercent <= 0) {
      errors.push('STOP_LOSS_PERCENT must be greater than 0');
    }
    if (this.config.riskManagement.takeProfitPercent <= 0) {
      errors.push('TAKE_PROFIT_PERCENT must be greater than 0');
    }
    if (this.config.riskManagement.trailingStopPercent <= 0) {
      errors.push('TRAILING_STOP_PERCENT must be greater than 0');
    }

    // Validate webhook configuration
    if (this.config.webhook.port < 1000 || this.config.webhook.port > 65535) {
      errors.push('WEBHOOK_PORT must be between 1000 and 65535');
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }
  }

  public getConfig(): BotConfig {
    return { ...this.config };
  }

  public getTradingConfig() {
    return { ...this.config.trading };
  }

  public getRiskManagementConfig() {
    return { ...this.config.riskManagement };
  }

  public getWebhookConfig() {
    return { ...this.config.webhook };
  }

  public getBingXConfig() {
    return { ...this.config.bingx };
  }

  public getNotificationConfig() {
    return { ...this.config.notifications };
  }

  public getDatabaseConfig() {
    return { ...this.config.database };
  }

  public getLoggingConfig() {
    return { ...this.config.logging };
  }

  public updateConfig(updates: Partial<BotConfig>): void {
    this.config = { ...this.config, ...updates };
    this.validateConfig();
  }

  public isPaperTrading(): boolean {
    return this.config.trading.paperTrading;
  }

  public isTestnet(): boolean {
    return this.config.bingx.testnet;
  }

  public getEnvironmentInfo(): string {
    const env = this.isPaperTrading() ? 'PAPER' : 'LIVE';
    const net = this.isTestnet() ? 'TESTNET' : 'MAINNET';
    return `${env}_${net}`;
  }

  public exportConfig(): string {
    // Export config without sensitive data
    const safeConfig = {
      ...this.config,
      bingx: {
        ...this.config.bingx,
        apiKey: '***',
        secretKey: '***',
      },
      webhook: {
        ...this.config.webhook,
        secret: '***',
      },
      notifications: {
        discord: this.config.notifications.discord ? {
          ...this.config.notifications.discord,
          webhookUrl: '***',
        } : undefined,
        telegram: this.config.notifications.telegram ? {
          ...this.config.notifications.telegram,
          botToken: '***',
        } : undefined,
      },
    };

    return JSON.stringify(safeConfig, null, 2);
  }
}

// Export singleton instance
export const config = ConfigManager.getInstance();
export default config;

// Helper functions
export function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value;
}

export function getOptionalEnvVar(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

export function getBooleanEnvVar(name: string, defaultValue: boolean = false): boolean {
  const value = process.env[name];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}

export function getNumberEnvVar(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (!value) return defaultValue;
  const parsed = parseFloat(value);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a valid number`);
  }
  return parsed;
}

export function getIntEnvVar(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a valid integer`);
  }
  return parsed;
}