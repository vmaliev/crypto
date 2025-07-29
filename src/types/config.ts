export interface BotConfig {
  trading: TradingConfig;
  riskManagement: RiskManagementConfig;
  webhook: WebhookConfig;
  bingx: BingXConfig;
  notifications: NotificationConfig;
  database: DatabaseConfig;
  logging: LoggingConfig;
}

export interface TradingConfig {
  positionSizePercent: number;
  maxDailyLoss: number;
  maxOpenPositions: number;
  leverageMultiplier: number;
  paperTrading: boolean;
}

export interface RiskManagementConfig {
  stopLossPercent: number;
  takeProfitPercent: number;
  trailingStopPercent: number;
  useVolatilityStops: boolean;
  maxRiskPerTrade: number;
  riskRewardRatio: number;
}

export interface WebhookConfig {
  port: number;
  secret: string;
  allowedIPs: string[];
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
}

export interface BingXConfig {
  apiKey: string;
  secretKey: string;
  testnet: boolean;
  baseUrl: string;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
}

export interface NotificationConfig {
  discord?: {
    webhookUrl: string;
    enabled: boolean;
  } | undefined;
  telegram?: {
    botToken: string;
    chatId: string;
    enabled: boolean;
  } | undefined;
  email?: {
    smtp: {
      host: string;
      port: number;
      secure: boolean;
      auth: {
        user: string;
        pass: string;
      };
    };
    from: string;
    to: string[];
    enabled: boolean;
  } | undefined;
}

export interface DatabaseConfig {
  path: string;
  backupInterval: number;
  maxBackups: number;
}

export interface LoggingConfig {
  level: 'error' | 'warn' | 'info' | 'debug';
  file: string;
  maxSize: string;
  maxFiles: number;
  console: boolean;
}

export interface EnvironmentVariables {
  // BingX API
  BINGX_API_KEY: string;
  BINGX_SECRET_KEY: string;
  BINGX_TESTNET: string;
  BINGX_BASE_URL: string;

  // Webhook
  WEBHOOK_PORT: string;
  WEBHOOK_SECRET: string;
  ALLOWED_IPS: string;

  // Trading
  POSITION_SIZE_PERCENT: string;
  MAX_DAILY_LOSS: string;
  MAX_OPEN_POSITIONS: string;
  LEVERAGE_MULTIPLIER: string;

  // Risk Management
  STOP_LOSS_PERCENT: string;
  TAKE_PROFIT_PERCENT: string;
  TRAILING_STOP_PERCENT: string;
  USE_VOLATILITY_STOPS: string;

  // Notifications
  DISCORD_WEBHOOK_URL?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;

  // Database
  DATABASE_PATH: string;

  // Logging
  LOG_LEVEL: string;
  LOG_FILE: string;

  // Paper Trading
  PAPER_TRADING: string;
}