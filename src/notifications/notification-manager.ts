import axios from 'axios';
import nodemailer from 'nodemailer';
import { NotificationConfig } from '@/types/config';
import { ProcessedSignal } from '@/types/signals';
import { TradeExecutionResult } from '@/trading/execution-engine';
import { RiskMetrics } from '@/trading/risk-manager';
import { SafetyStatus } from '@/trading/safety-manager';
import logger from '@/utils/logger';

export interface NotificationMessage {
  title: string;
  message: string;
  type: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS' | 'ALERT';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  data?: any;
  timestamp: number;
}

export interface NotificationChannel {
  name: string;
  enabled: boolean;
  send(message: NotificationMessage): Promise<boolean>;
}

export class DiscordNotifier implements NotificationChannel {
  public name = 'Discord';
  public enabled: boolean;
  private webhookUrl: string;

  constructor(config: NotificationConfig['discord']) {
    this.enabled = config?.enabled || false;
    this.webhookUrl = config?.webhookUrl || '';
  }

  async send(message: NotificationMessage): Promise<boolean> {
    if (!this.enabled || !this.webhookUrl) {
      return false;
    }

    try {
      const embed = {
        title: message.title,
        description: message.message,
        color: this.getColorForType(message.type),
        timestamp: new Date(message.timestamp).toISOString(),
        fields: message.data ? this.formatDataFields(message.data) : [],
        footer: {
          text: `Trading Bot - ${message.type}`
        }
      };

      await axios.post(this.webhookUrl, {
        embeds: [embed]
      });

      logger.logSystem('DISCORD_NOTIFICATION_SENT', {
        title: message.title,
        type: message.type,
        priority: message.priority
      });

      return true;
    } catch (error) {
      logger.logError(error as Error, 'Discord Notification');
      return false;
    }
  }

  private getColorForType(type: string): number {
    switch (type) {
      case 'SUCCESS': return 0x00ff00; // Green
      case 'WARNING': return 0xffff00; // Yellow
      case 'ERROR': return 0xff0000;   // Red
      case 'ALERT': return 0xff6600;   // Orange
      default: return 0x0099ff;        // Blue
    }
  }

  private formatDataFields(data: any): any[] {
    const fields = [];
    for (const [key, value] of Object.entries(data)) {
      fields.push({
        name: key.charAt(0).toUpperCase() + key.slice(1),
        value: String(value),
        inline: true
      });
    }
    return fields;
  }
}

export class TelegramNotifier implements NotificationChannel {
  public name = 'Telegram';
  public enabled: boolean;
  private botToken: string;
  private chatId: string;

  constructor(config: NotificationConfig['telegram']) {
    this.enabled = config?.enabled || false;
    this.botToken = config?.botToken || '';
    this.chatId = config?.chatId || '';
  }

  async send(message: NotificationMessage): Promise<boolean> {
    if (!this.enabled || !this.botToken || !this.chatId) {
      return false;
    }

    try {
      const text = this.formatMessage(message);
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;

      await axios.post(url, {
        chat_id: this.chatId,
        text: text,
        parse_mode: 'HTML'
      });

      logger.logSystem('TELEGRAM_NOTIFICATION_SENT', {
        title: message.title,
        type: message.type,
        priority: message.priority
      });

      return true;
    } catch (error) {
      logger.logError(error as Error, 'Telegram Notification');
      return false;
    }
  }

  private formatMessage(message: NotificationMessage): string {
    const _emoji = this.getEmojiForType(message.type);
    const priority = this.getPriorityEmoji(message.priority);
    
    let text = `${priority} <b>${message.title}</b>\n\n`;
    text += `${message.message}\n\n`;
    text += `📅 ${new Date(message.timestamp).toLocaleString()}\n`;
    text += `🏷️ ${message.type}`;

    if (message.data) {
      text += '\n\n📊 <b>Details:</b>\n';
      for (const [key, value] of Object.entries(message.data)) {
        text += `• ${key}: ${value}\n`;
      }
    }

    return text;
  }

  private getEmojiForType(type: string): string {
    switch (type) {
      case 'SUCCESS': return '✅';
      case 'WARNING': return '⚠️';
      case 'ERROR': return '❌';
      case 'ALERT': return '🚨';
      default: return 'ℹ️';
    }
  }

  private getPriorityEmoji(priority: string): string {
    switch (priority) {
      case 'CRITICAL': return '🚨';
      case 'HIGH': return '🔴';
      case 'MEDIUM': return '🟡';
      case 'LOW': return '🟢';
      default: return 'ℹ️';
    }
  }
}

export class EmailNotifier implements NotificationChannel {
  public name = 'Email';
  public enabled: boolean;
  private transporter!: nodemailer.Transporter;
  private from: string;
  private to: string[];

  constructor(config: NotificationConfig['email']) {
    this.enabled = config?.enabled || false;
    this.from = config?.from || '';
    this.to = config?.to || [];

    if (this.enabled && config?.smtp) {
      this.transporter = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        auth: {
          user: config.smtp.auth.user,
          pass: config.smtp.auth.pass
        }
      });
    }
  }

  async send(message: NotificationMessage): Promise<boolean> {
    if (!this.enabled || !this.transporter || this.to.length === 0) {
      return false;
    }

    try {
      const mailOptions = {
        from: this.from,
        to: this.to.join(', '),
        subject: `[${message.priority}] ${message.title}`,
        html: this.formatEmail(message)
      };

      await this.transporter.sendMail(mailOptions);

      logger.logSystem('EMAIL_NOTIFICATION_SENT', {
        title: message.title,
        type: message.type,
        priority: message.priority,
        recipients: this.to.length
      });

      return true;
    } catch (error) {
      logger.logError(error as Error, 'Email Notification');
      return false;
    }
  }

  private formatEmail(message: NotificationMessage): string {
    const color = this.getColorForType(message.type);
    const priorityColor = this.getPriorityColor(message.priority);

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { background-color: ${color}; color: white; padding: 15px; border-radius: 5px; }
          .content { background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin-top: 10px; }
          .priority { background-color: ${priorityColor}; color: white; padding: 5px 10px; border-radius: 3px; display: inline-block; }
          .data { background-color: white; padding: 10px; border-radius: 3px; margin-top: 10px; }
          .data-item { margin: 5px 0; }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>${message.title}</h2>
          <span class="priority">${message.priority}</span>
        </div>
        <div class="content">
          <p>${message.message}</p>
          <p><strong>Time:</strong> ${new Date(message.timestamp).toLocaleString()}</p>
          <p><strong>Type:</strong> ${message.type}</p>
          ${message.data ? `
            <div class="data">
              <h4>Details:</h4>
              ${Object.entries(message.data).map(([key, value]) => 
                `<div class="data-item"><strong>${key}:</strong> ${value}</div>`
              ).join('')}
            </div>
          ` : ''}
        </div>
      </body>
      </html>
    `;
  }

  private getColorForType(type: string): string {
    switch (type) {
      case 'SUCCESS': return '#28a745';
      case 'WARNING': return '#ffc107';
      case 'ERROR': return '#dc3545';
      case 'ALERT': return '#fd7e14';
      default: return '#17a2b8';
    }
  }

  private getPriorityColor(priority: string): string {
    switch (priority) {
      case 'CRITICAL': return '#dc3545';
      case 'HIGH': return '#fd7e14';
      case 'MEDIUM': return '#ffc107';
      case 'LOW': return '#28a745';
      default: return '#6c757d';
    }
  }
}

export class NotificationManager {
  private channels: NotificationChannel[] = [];
  private messageQueue: NotificationMessage[] = [];
  private isProcessing: boolean = false;
  private rateLimit: number = 1000; // 1 second between messages
  private lastMessageTime: number = 0;

  constructor(config: NotificationConfig) {
    // Initialize notification channels
    if (config.discord) {
      this.channels.push(new DiscordNotifier(config.discord));
    }
    if (config.telegram) {
      this.channels.push(new TelegramNotifier(config.telegram));
    }
    if (config.email) {
      this.channels.push(new EmailNotifier(config.email));
    }

    logger.logSystem('NOTIFICATION_MANAGER_INITIALIZED', {
      channels: this.channels.map(c => c.name),
      enabledChannels: this.channels.filter(c => c.enabled).map(c => c.name)
    });
  }

  /**
   * Send a notification to all enabled channels
   */
  async sendNotification(
    title: string,
    message: string,
    type: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS' | 'ALERT' = 'INFO',
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'MEDIUM',
    data?: any
  ): Promise<void> {
    const notification: NotificationMessage = {
      title,
      message,
      type,
      priority,
      data,
      timestamp: Date.now()
    };

    // Add to queue and process
    this.messageQueue.push(notification);
    await this.processQueue();
  }

  /**
   * Send trading signal notification
   */
  async notifySignalReceived(signal: ProcessedSignal): Promise<void> {
    await this.sendNotification(
      'Trading Signal Received',
      `New ${signal.action} signal for ${signal.symbol}`,
      'INFO',
      'MEDIUM',
      {
        symbol: signal.symbol,
        action: signal.action,
        strength: signal.strength,
        price: signal.price,
        confidence: `${(signal.confidence * 100).toFixed(1)}%`,
        strategy: signal.strategy,
        timeframe: signal.timeframe
      }
    );
  }

  /**
   * Send trade execution notification
   */
  async notifyTradeExecuted(result: TradeExecutionResult, signal: ProcessedSignal): Promise<void> {
    const type = result.success ? 'SUCCESS' : 'ERROR';
    const priority = result.success ? 'MEDIUM' : 'HIGH';

    await this.sendNotification(
      result.success ? 'Trade Executed Successfully' : 'Trade Execution Failed',
      result.success 
        ? `Successfully executed ${signal.action} order for ${signal.symbol}`
        : `Failed to execute trade: ${result.error}`,
      type,
      priority,
      {
        symbol: signal.symbol,
        action: signal.action,
        quantity: result.executedQuantity,
        price: result.executedPrice,
        orderId: result.orderId,
        notionalValue: result.executedQuantity && result.executedPrice 
          ? result.executedQuantity * result.executedPrice 
          : 0
      }
    );
  }

  /**
   * Send risk alert notification
   */
  async notifyRiskAlert(metrics: RiskMetrics, message: string): Promise<void> {
    const priority = metrics.maxDrawdown > 10 ? 'CRITICAL' : 'HIGH';
    
    await this.sendNotification(
      'Risk Alert',
      message,
      'ALERT',
      priority,
      {
        currentDrawdown: `${metrics.currentDrawdown.toFixed(2)}%`,
        maxDrawdown: `${metrics.maxDrawdown.toFixed(2)}%`,
        dailyPnL: metrics.dailyPnL,
        volatility: `${metrics.volatility.toFixed(2)}%`,
        sharpeRatio: metrics.sharpeRatio.toFixed(2)
      }
    );
  }

  /**
   * Send safety status notification
   */
  async notifySafetyStatus(status: SafetyStatus): Promise<void> {
    if (status.riskLevel === 'CRITICAL' || status.emergencyStopActive) {
      await this.sendNotification(
        'Safety Alert',
        'Trading has been stopped due to safety concerns',
        'ALERT',
        'CRITICAL',
        {
          riskLevel: status.riskLevel,
          circuitBreakerActive: status.circuitBreakerActive,
          emergencyStopActive: status.emergencyStopActive,
          warnings: status.warnings.join(', ')
        }
      );
    }
  }

  /**
   * Send daily performance summary
   */
  async notifyDailySummary(
    totalTrades: number,
    winningTrades: number,
    totalPnL: number,
    winRate: number
  ): Promise<void> {
    const type = totalPnL > 0 ? 'SUCCESS' : totalPnL < 0 ? 'WARNING' : 'INFO';
    const priority = Math.abs(totalPnL) > 100 ? 'HIGH' : 'MEDIUM';

    await this.sendNotification(
      'Daily Trading Summary',
      `Daily trading session completed with ${totalPnL > 0 ? 'profit' : 'loss'}`,
      type,
      priority,
      {
        totalTrades,
        winningTrades,
        losingTrades: totalTrades - winningTrades,
        totalPnL: totalPnL.toFixed(2),
        winRate: `${(winRate * 100).toFixed(1)}%`,
        date: new Date().toLocaleDateString()
      }
    );
  }

  /**
   * Send system status notification
   */
  async notifySystemStatus(status: 'STARTED' | 'STOPPED' | 'ERROR', details?: any): Promise<void> {
    const type = status === 'ERROR' ? 'ERROR' : status === 'STARTED' ? 'SUCCESS' : 'INFO';
    const priority = status === 'ERROR' ? 'HIGH' : 'LOW';

    await this.sendNotification(
      `System ${status}`,
      `Trading bot has ${status.toLowerCase()}`,
      type,
      priority,
      details
    );
  }

  /**
   * Process notification queue with rate limiting
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.messageQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.messageQueue.length > 0) {
      const now = Date.now();
      if (now - this.lastMessageTime < this.rateLimit) {
        await this.delay(this.rateLimit - (now - this.lastMessageTime));
      }

      const message = this.messageQueue.shift();
      if (message) {
        await this.sendToAllChannels(message);
        this.lastMessageTime = Date.now();
      }
    }

    this.isProcessing = false;
  }

  /**
   * Send message to all enabled channels
   */
  private async sendToAllChannels(message: NotificationMessage): Promise<void> {
    const enabledChannels = this.channels.filter(channel => channel.enabled);
    
    const results = await Promise.allSettled(
      enabledChannels.map(channel => channel.send(message))
    );

    const successful = results.filter(result => 
      result.status === 'fulfilled' && result.value
    ).length;

    logger.logSystem('NOTIFICATION_SENT', {
      messageTitle: message.title,
      type: message.type,
      priority: message.priority,
      channelsAttempted: enabledChannels.length,
      channelsSuccessful: successful
    });
  }

  /**
   * Get notification statistics
   */
  getStats(): {
    totalChannels: number;
    enabledChannels: number;
    queueLength: number;
    isProcessing: boolean;
  } {
    return {
      totalChannels: this.channels.length,
      enabledChannels: this.channels.filter(c => c.enabled).length,
      queueLength: this.messageQueue.length,
      isProcessing: this.isProcessing
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
} 