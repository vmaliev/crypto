import express, { Express, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { 
  TradingViewWebhookPayload, 
  WebhookRequest, 
  WebhookValidation,
  ProcessedSignal 
} from '@/types/signals';
import { validateWebhookPayload } from './validator';
import { authenticateWebhook, checkIPWhitelist } from './security';
import logger from '@/utils/logger';
import config from '@/utils/config';

export class WebhookServer {
  private app: Express;
  private server: any;
  private rateLimiter!: RateLimiterMemory;
  private isRunning: boolean = false;

  constructor() {
    this.app = express();
    this.setupRateLimiter();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupRateLimiter(): void {
    const webhookConfig = config.getWebhookConfig();
    
    this.rateLimiter = new RateLimiterMemory({
      points: webhookConfig.rateLimitMaxRequests,
      duration: Math.floor(webhookConfig.rateLimitWindowMs / 1000),
      blockDuration: 60, // Block for 1 minute if limit exceeded
    });
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: false, // Disable CSP for webhook endpoints
    }));

    // CORS configuration
    this.app.use(cors({
      origin: false, // Disable CORS for webhook endpoints
      credentials: false,
    }));

    // Body parsing middleware
    this.app.use(express.json({ 
      limit: '1mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      }
    }));
    this.app.use(express.urlencoded({ extended: true, limit: '1mb' }));

    // Request logging middleware
    this.app.use((req: Request, _res: Response, next: NextFunction) => {
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      req.headers['x-request-id'] = requestId;
      
      logger.logWebhook('REQUEST_RECEIVED', {
        requestId,
        ip: req.ip,
        method: req.method,
        url: req.url,
        userAgent: req.get('User-Agent'),
        contentLength: req.get('Content-Length'),
      });
      
      next();
    });

    // Rate limiting middleware
    this.app.use(async (req: Request, res: Response, next: NextFunction) => {
      try {
        const clientIP = req.ip || 'unknown';
        await this.rateLimiter.consume(clientIP);
        next();
      } catch (rateLimiterRes: any) {
        logger.logRisk('RATE_LIMIT_EXCEEDED', {
          ip: req.ip || 'unknown',
          remainingPoints: rateLimiterRes?.remainingPoints || 0,
          msBeforeNext: rateLimiterRes?.msBeforeNext || 60000,
        });
        
        res.status(429).json({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded',
          retryAfter: Math.round((rateLimiterRes?.msBeforeNext || 60000) / 1000),
        });
      }
    });
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0',
        environment: config.getEnvironmentInfo(),
      });
    });

    // Main TradingView webhook endpoint
    this.app.post('/webhook/tradingview', async (req: Request, res: Response): Promise<void> => {
      try {
        const webhookRequest: WebhookRequest = {
          headers: req.headers as Record<string, string>,
          body: req.body as TradingViewWebhookPayload,
          ip: req.ip || 'unknown',
          timestamp: new Date(),
          userAgent: req.get('User-Agent') || 'unknown',
        };

        // Validate webhook
        const validation = await this.validateWebhook(webhookRequest);
        
        if (!validation.isValidPayload || !validation.isValidSecret || !validation.isValidIP) {
          logger.logRisk('WEBHOOK_VALIDATION_FAILED', {
            ip: req.ip,
            errors: validation.errors,
            payload: req.body,
          });

          res.status(400).json({
            error: 'Webhook validation failed',
            errors: validation.errors,
          });
          return;
        }

        // Process the signal
        const processedSignal = await this.processSignal(webhookRequest.body);
        
        logger.logSignal('PROCESSED', processedSignal);

        // Emit signal event for trading engine
        this.emitSignalEvent(processedSignal);

        res.json({
          success: true,
          message: 'Signal received and processed',
          signalId: processedSignal.id,
          timestamp: new Date().toISOString(),
        });

      } catch (error) {
        logger.logError(error as Error, 'Webhook Processing');
        
        res.status(500).json({
          error: 'Internal server error',
          message: 'Failed to process webhook',
        });
      }
    });

    // Generic webhook endpoint for testing
    this.app.post('/webhook/test', (req: Request, res: Response) => {
      logger.info('Test webhook received', {
        body: req.body,
        headers: req.headers,
        ip: req.ip,
      });

      res.json({
        success: true,
        message: 'Test webhook received',
        echo: req.body,
      });
    });

    // Webhook status endpoint
    this.app.get('/webhook/status', (_req: Request, res: Response) => {
      res.json({
        status: 'active',
        rateLimiter: {
          windowMs: config.getWebhookConfig().rateLimitWindowMs,
          maxRequests: config.getWebhookConfig().rateLimitMaxRequests,
        },
        security: {
          ipWhitelistEnabled: config.getWebhookConfig().allowedIPs.length > 0,
          secretRequired: !!config.getWebhookConfig().secret,
        },
        uptime: process.uptime(),
      });
    });

    // 404 handler
    this.app.use('*', (req: Request, res: Response) => {
      res.status(404).json({
        error: 'Not Found',
        message: 'Endpoint not found',
        path: req.originalUrl,
      });
    });
  }

  private setupErrorHandling(): void {
    // Global error handler
    this.app.use((error: Error, req: Request, res: Response, _next: NextFunction) => {
      logger.logError(error, 'Express Error Handler');
      
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
        requestId: req.headers['x-request-id'],
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      logger.logError(error, 'Uncaught Exception');
      this.gracefulShutdown();
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: any) => {
      logger.logError(new Error(`Unhandled Rejection: ${reason}`), 'Unhandled Promise Rejection');
      this.gracefulShutdown();
    });
  }

  private async validateWebhook(webhookRequest: WebhookRequest): Promise<WebhookValidation> {
    const validation: WebhookValidation = {
      isValidIP: true,
      isValidSecret: true,
      isValidPayload: true,
      isRateLimited: false,
      errors: [],
    };

    // Check IP whitelist
    if (!checkIPWhitelist(webhookRequest.ip)) {
      validation.isValidIP = false;
      validation.errors.push(`IP ${webhookRequest.ip} not in whitelist`);
    }

    // Authenticate webhook secret
    if (!authenticateWebhook(webhookRequest)) {
      validation.isValidSecret = false;
      validation.errors.push('Invalid webhook secret');
    }

    // Validate payload structure
    const payloadValidation = validateWebhookPayload(webhookRequest.body);
    if (!payloadValidation.isValid) {
      validation.isValidPayload = false;
      validation.errors.push(...payloadValidation.errors);
    }

    return validation;
  }

  private async processSignal(payload: TradingViewWebhookPayload): Promise<ProcessedSignal> {
    const signalId = `signal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const processedSignal: ProcessedSignal = {
      id: signalId,
      timestamp: new Date(payload.timestamp),
      symbol: payload.symbol,
      action: payload.action,
      strength: payload.signal_strength,
      price: payload.price,
      mfi: payload.mfi_value,
      rsi: payload.rsi_value,
      timeframe: payload.timeframe,
      strategy: payload.strategy,
      confidence: this.calculateConfidence(payload),
      isValid: true,
      validationErrors: [],
    };

    return processedSignal;
  }

  private calculateConfidence(payload: TradingViewWebhookPayload): number {
    let confidence = 0.5; // Base confidence

    // Adjust based on signal strength
    switch (payload.signal_strength) {
      case 'STRONG':
        confidence += 0.3;
        break;
      case 'MEDIUM':
        confidence += 0.1;
        break;
      case 'WEAK':
        confidence -= 0.1;
        break;
    }

    // Adjust based on MFI and RSI values
    const mfi = payload.mfi_value;
    const rsi = payload.rsi_value;

    // Strong oversold/overbought conditions increase confidence
    if ((mfi < 20 && rsi < 30 && payload.action === 'BUY') ||
        (mfi > 80 && rsi > 70 && payload.action === 'SELL')) {
      confidence += 0.2;
    }

    // Conflicting signals decrease confidence
    if ((mfi > 50 && rsi < 50) || (mfi < 50 && rsi > 50)) {
      confidence -= 0.1;
    }

    // Ensure confidence is between 0 and 1
    return Math.max(0, Math.min(1, confidence));
  }

  private emitSignalEvent(signal: ProcessedSignal): void {
    // This would typically emit an event to the trading engine
    // For now, we'll just log it
    logger.info('Signal event emitted', {
      type: 'SIGNAL_EVENT',
      signalId: signal.id,
      symbol: signal.symbol,
      action: signal.action,
      confidence: signal.confidence,
    });

    // TODO: Implement event emitter or message queue integration
    // EventEmitter.emit('signal:received', signal);
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Webhook server is already running');
      return;
    }

    const port = config.getWebhookConfig().port;

    return new Promise((resolve, reject) => {
      this.server = this.app.listen(port, (error?: Error) => {
        if (error) {
          logger.logError(error, 'Failed to start webhook server');
          reject(error);
          return;
        }

        this.isRunning = true;
        logger.logSystem('WEBHOOK_SERVER_STARTED', { port });
        resolve();
      });
    });
  }

  public async stop(): Promise<void> {
    if (!this.isRunning || !this.server) {
      logger.warn('Webhook server is not running');
      return;
    }

    return new Promise((resolve) => {
      this.server.close(() => {
        this.isRunning = false;
        logger.logSystem('WEBHOOK_SERVER_STOPPED');
        resolve();
      });
    });
  }

  public isServerRunning(): boolean {
    return this.isRunning;
  }

  private async gracefulShutdown(): Promise<void> {
    logger.logSystem('GRACEFUL_SHUTDOWN_INITIATED');
    
    try {
      await this.stop();
      process.exit(0);
    } catch (error) {
      logger.logError(error as Error, 'Graceful Shutdown');
      process.exit(1);
    }
  }
}

// Export singleton instance
export const webhookServer = new WebhookServer();
export default webhookServer;