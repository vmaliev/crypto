import dotenv from 'dotenv';
import { webhookServer } from './webhook/server';
import { bingxClient } from './api/bingx/client';
import logger from './utils/logger';
import config from './utils/config';

// Load environment variables
dotenv.config();

class TradingBot {
  private isRunning: boolean = false;
  private shutdownInProgress: boolean = false;

  constructor() {
    this.setupGracefulShutdown();
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Trading bot is already running');
      return;
    }

    try {
      logger.logSystem('STARTUP_INITIATED', {
        environment: config.getEnvironmentInfo(),
        version: '1.0.0',
      });

      // Test BingX connectivity
      logger.info('Testing BingX API connectivity...');
      const isConnected = await bingxClient.testConnectivity();
      
      if (!isConnected) {
        throw new Error('Failed to connect to BingX API');
      }

      logger.logSystem('BINGX_CONNECTED', { testnet: config.isTestnet() });

      // Start webhook server
      logger.info('Starting webhook server...');
      await webhookServer.start();

      this.isRunning = true;

      logger.logSystem('TRADING_BOT_STARTED', {
        webhookPort: config.getWebhookConfig().port,
        paperTrading: config.isPaperTrading(),
        environment: config.getEnvironmentInfo(),
      });

      // Log configuration summary (without sensitive data)
      logger.info('Bot configuration loaded', {
        trading: {
          positionSizePercent: config.getTradingConfig().positionSizePercent,
          maxDailyLoss: config.getTradingConfig().maxDailyLoss,
          maxOpenPositions: config.getTradingConfig().maxOpenPositions,
          leverageMultiplier: config.getTradingConfig().leverageMultiplier,
          paperTrading: config.getTradingConfig().paperTrading,
        },
        riskManagement: {
          stopLossPercent: config.getRiskManagementConfig().stopLossPercent,
          takeProfitPercent: config.getRiskManagementConfig().takeProfitPercent,
          trailingStopPercent: config.getRiskManagementConfig().trailingStopPercent,
          useVolatilityStops: config.getRiskManagementConfig().useVolatilityStops,
        },
        webhook: {
          port: config.getWebhookConfig().port,
          ipWhitelistEnabled: config.getWebhookConfig().allowedIPs.length > 0,
          secretConfigured: !!config.getWebhookConfig().secret,
        },
      });

      // Keep the process running
      this.keepAlive();

    } catch (error) {
      logger.logError(error as Error, 'Bot Startup');
      await this.shutdown();
      process.exit(1);
    }
  }

  public async shutdown(): Promise<void> {
    if (this.shutdownInProgress) {
      logger.warn('Shutdown already in progress');
      return;
    }

    this.shutdownInProgress = true;
    logger.logSystem('SHUTDOWN_INITIATED');

    try {
      // Stop webhook server
      if (webhookServer.isServerRunning()) {
        logger.info('Stopping webhook server...');
        await webhookServer.stop();
      }

      // Flush logs
      await logger.flush();

      this.isRunning = false;
      logger.logSystem('TRADING_BOT_STOPPED');

    } catch (error) {
      logger.logError(error as Error, 'Bot Shutdown');
    }
  }

  private setupGracefulShutdown(): void {
    // Handle SIGTERM (Docker, PM2, etc.)
    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM signal');
      await this.shutdown();
      process.exit(0);
    });

    // Handle SIGINT (Ctrl+C)
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT signal');
      await this.shutdown();
      process.exit(0);
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', async (error: Error) => {
      logger.logError(error, 'Uncaught Exception');
      await this.shutdown();
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', async (reason: any, promise: Promise<any>) => {
      logger.logError(new Error(`Unhandled Rejection: ${reason}`), 'Unhandled Promise Rejection');
      await this.shutdown();
      process.exit(1);
    });
  }

  private keepAlive(): void {
    // Log periodic health check
    setInterval(() => {
      if (this.isRunning && !this.shutdownInProgress) {
        logger.debug('Health check', {
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          webhookServerRunning: webhookServer.isServerRunning(),
        });
      }
    }, 60000); // Every minute

    // Log daily summary
    setInterval(() => {
      if (this.isRunning && !this.shutdownInProgress) {
        logger.logSystem('DAILY_SUMMARY', {
          uptime: process.uptime(),
          environment: config.getEnvironmentInfo(),
          memoryUsage: process.memoryUsage(),
        });
      }
    }, 24 * 60 * 60 * 1000); // Every 24 hours
  }

  public isRunningStatus(): boolean {
    return this.isRunning;
  }
}

// Create and start the bot
async function main() {
  const bot = new TradingBot();
  
  try {
    await bot.start();
  } catch (error) {
    console.error('Failed to start trading bot:', error);
    process.exit(1);
  }
}

// Start the application
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { TradingBot };
export default main;