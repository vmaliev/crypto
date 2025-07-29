import { BingXClient } from '@/api/bingx/client';
import { 
  BingXOrderRequest, 
  BingXAccountInfo 
} from '@/types/bingx';
import { ProcessedSignal } from '@/types/signals';
import { PositionSizeResult } from './position-sizer';
import { RiskCheckResult } from './risk-manager';
import logger from '@/utils/logger';

export interface TradeExecutionRequest {
  signal: ProcessedSignal;
  positionSize: PositionSizeResult;
  riskCheck: RiskCheckResult;
  currentPrice: number;
  accountInfo: BingXAccountInfo;
}

export interface TradeExecutionResult {
  success: boolean;
  orderId?: string;
  clientOrderId?: string;
  executedPrice?: number;
  executedQuantity?: number;
  fees?: number;
  error?: string;
  warnings: string[];
  timestamp: number;
}

export interface OrderManagementData {
  orderId: string;
  clientOrderId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  status: 'PENDING' | 'FILLED' | 'CANCELLED' | 'REJECTED';
  timestamp: number;
  retryCount: number;
  maxRetries: number;
}

export class TradeExecutionEngine {
  private client: BingXClient;
  private activeOrders: Map<string, OrderManagementData> = new Map();
  private orderHistory: OrderManagementData[] = [];
  private maxRetries: number = 3;
  private retryDelay: number = 1000; // 1 second

  constructor(client: BingXClient) {
    this.client = client;
  }

  /**
   * Execute a trade based on signal and position sizing
   */
  public async executeTrade(request: TradeExecutionRequest): Promise<TradeExecutionResult> {
    const { signal, positionSize, riskCheck, currentPrice, accountInfo } = request;
    const warnings: string[] = [];

    try {
      // Validate execution conditions
      if (!riskCheck.shouldTrade) {
        return {
          success: false,
          error: 'Risk check failed: ' + riskCheck.warnings.join(', '),
          warnings: riskCheck.warnings,
          timestamp: Date.now()
        };
      }

      if (positionSize.quantity <= 0) {
        return {
          success: false,
          error: 'Invalid position size',
          warnings: positionSize.warnings,
          timestamp: Date.now()
        };
      }

      // Create order request
      const orderRequest: BingXOrderRequest = {
        symbol: signal.symbol,
        side: signal.action === 'BUY' ? 'BUY' : 'SELL',
        type: 'MARKET',
        quantity: positionSize.quantity.toString(),
        positionSide: signal.action === 'BUY' ? 'LONG' : 'SHORT',
        timeInForce: 'IOC', // Immediate or Cancel
        reduceOnly: false,
        newClientOrderId: `bot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };

      // Execute the order
      const orderResponse = await this.placeOrderWithRetry(orderRequest);
      
      if (!orderResponse.success) {
        return {
          success: false,
          error: orderResponse.error || 'Order placement failed',
          warnings: warnings.concat(orderResponse.warnings || []),
          timestamp: Date.now()
        };
      }

      // Place stop loss and take profit orders
      const stopLossOrder = await this.placeStopLossOrder(
        signal.symbol,
        positionSize.quantity,
        riskCheck.stopLossPrice,
        signal.action === 'BUY' ? 'LONG' : 'SHORT',
        orderResponse.clientOrderId
      );

      const takeProfitOrder = await this.placeTakeProfitOrder(
        signal.symbol,
        positionSize.quantity,
        riskCheck.takeProfitPrice,
        signal.action === 'BUY' ? 'LONG' : 'SHORT',
        orderResponse.clientOrderId
      );

      // Log successful execution
      logger.logTrade('EXECUTED', {
        symbol: signal.symbol,
        side: signal.action,
        quantity: positionSize.quantity,
        price: currentPrice,
        orderId: orderResponse.orderId,
        notionalValue: positionSize.notionalValue,
        confidence: signal.confidence
      });

      return {
        success: true,
        orderId: orderResponse.orderId,
        clientOrderId: orderResponse.clientOrderId,
        executedPrice: currentPrice,
        executedQuantity: positionSize.quantity,
        fees: 0, // Would need to calculate from response
        warnings: warnings.concat(stopLossOrder.warnings || []).concat(takeProfitOrder.warnings || []),
        timestamp: Date.now()
      };

    } catch (error) {
      logger.logError(error as Error, 'Trade Execution');
      return {
        success: false,
        error: (error as Error).message,
        warnings,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Place order with retry logic
   */
  private async placeOrderWithRetry(orderRequest: BingXOrderRequest): Promise<TradeExecutionResult> {
    let lastError: string = '';
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.client.placeOrder(orderRequest);
        
        // Store order for management
        const orderData: OrderManagementData = {
          orderId: response.orderId.toString(),
          clientOrderId: orderRequest.newClientOrderId!,
          symbol: orderRequest.symbol,
          side: orderRequest.side,
          quantity: parseFloat(orderRequest.quantity),
          price: 0, // Will be updated when filled
          stopLossPrice: 0,
          takeProfitPrice: 0,
          status: 'PENDING',
          timestamp: Date.now(),
          retryCount: attempt - 1,
          maxRetries: this.maxRetries
        };

        this.activeOrders.set(orderData.clientOrderId, orderData);

        return {
          success: true,
          orderId: response.orderId.toString(),
          clientOrderId: orderRequest.newClientOrderId,
          timestamp: Date.now(),
          warnings: []
        };

      } catch (error) {
        lastError = (error as Error).message;
        logger.logError(error as Error, `Order Placement Attempt ${attempt}`);
        
        if (attempt < this.maxRetries) {
          await this.delay(this.retryDelay * attempt); // Exponential backoff
        }
      }
    }

    return {
      success: false,
      error: `Order placement failed after ${this.maxRetries} attempts: ${lastError}`,
      warnings: [],
      timestamp: Date.now()
    };
  }

  /**
   * Place stop loss order
   */
  private async placeStopLossOrder(
    symbol: string,
    quantity: number,
    stopPrice: number,
    positionSide: 'LONG' | 'SHORT',
    parentOrderId: string
  ): Promise<TradeExecutionResult> {
    try {
      const stopLossRequest: BingXOrderRequest = {
        symbol,
        side: positionSide === 'LONG' ? 'SELL' : 'BUY',
        orderType: 'STOP_MARKET',
        quantity: quantity.toString(),
        positionSide,
        stopPrice: stopPrice.toString(),
        reduceOnly: true,
        timeInForce: 'GTC',
        newClientOrderId: `sl_${parentOrderId}_${Date.now()}`
      };

      const response = await this.client.placeOrder(stopLossRequest);
      
      return {
        success: true,
        orderId: response.orderId.toString(),
        clientOrderId: stopLossRequest.newClientOrderId,
        timestamp: Date.now(),
        warnings: []
      };

    } catch (error) {
      logger.logError(error as Error, 'Stop Loss Order Placement');
      return {
        success: false,
        error: (error as Error).message,
        warnings: ['Failed to place stop loss order'],
        timestamp: Date.now()
      };
    }
  }

  /**
   * Place take profit order
   */
  private async placeTakeProfitOrder(
    symbol: string,
    quantity: number,
    takeProfitPrice: number,
    positionSide: 'LONG' | 'SHORT',
    parentOrderId: string
  ): Promise<TradeExecutionResult> {
    try {
      const takeProfitRequest: BingXOrderRequest = {
        symbol,
        side: positionSide === 'LONG' ? 'SELL' : 'BUY',
        orderType: 'LIMIT',
        quantity: quantity.toString(),
        positionSide,
        price: takeProfitPrice.toString(),
        reduceOnly: true,
        timeInForce: 'GTC',
        newClientOrderId: `tp_${parentOrderId}_${Date.now()}`
      };

      const response = await this.client.placeOrder(takeProfitRequest);
      
      return {
        success: true,
        orderId: response.orderId.toString(),
        clientOrderId: takeProfitRequest.newClientOrderId,
        timestamp: Date.now(),
        warnings: []
      };

    } catch (error) {
      logger.logError(error as Error, 'Take Profit Order Placement');
      return {
        success: false,
        error: (error as Error).message,
        warnings: ['Failed to place take profit order'],
        timestamp: Date.now()
      };
    }
  }

  /**
   * Close a position
   */
  public async closePosition(
    symbol: string,
    positionSide: 'LONG' | 'SHORT',
    quantity: number
  ): Promise<TradeExecutionResult> {
    try {
      const closeRequest: BingXOrderRequest = {
        symbol,
        side: positionSide === 'LONG' ? 'SELL' : 'BUY',
        orderType: 'MARKET',
        quantity: quantity.toString(),
        positionSide,
        reduceOnly: true,
        timeInForce: 'IOC',
        newClientOrderId: `close_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };

      const response = await this.client.placeOrder(closeRequest);
      
      logger.logTrade('CLOSED', {
        symbol,
        side: positionSide === 'LONG' ? 'SELL' : 'BUY',
        quantity,
        orderId: response.orderId.toString()
      });

      return {
        success: true,
        orderId: response.orderId.toString(),
        clientOrderId: closeRequest.newClientOrderId,
        executedQuantity: quantity,
        timestamp: Date.now(),
        warnings: []
      };

    } catch (error) {
      logger.logError(error as Error, 'Position Close');
      return {
        success: false,
        error: (error as Error).message,
        warnings: [],
        timestamp: Date.now()
      };
    }
  }

  /**
   * Update order status
   */
  public async updateOrderStatus(clientOrderId: string): Promise<OrderManagementData | null> {
    const orderData = this.activeOrders.get(clientOrderId);
    if (!orderData) {
      return null;
    }

    try {
      const status = await this.client.getOrderStatus(orderData.symbol, parseInt(orderData.orderId));
      
      orderData.status = this.mapOrderStatus(status.status);
      if (status.status === 'FILLED') {
        orderData.price = parseFloat(status.avgPrice || '0');
        this.orderHistory.push(orderData);
        this.activeOrders.delete(clientOrderId);
      }

      return orderData;

    } catch (error) {
      logger.logError(error as Error, 'Order Status Update');
      return null;
    }
  }

  /**
   * Cancel an order
   */
  public async cancelOrder(clientOrderId: string): Promise<boolean> {
    const orderData = this.activeOrders.get(clientOrderId);
    if (!orderData) {
      return false;
    }

    try {
      await this.client.cancelOrder(orderData.symbol, parseInt(orderData.orderId));
      
      orderData.status = 'CANCELLED';
      this.orderHistory.push(orderData);
      this.activeOrders.delete(clientOrderId);
      
      logger.logTrade('CANCELLED', {
        symbol: orderData.symbol,
        orderId: orderData.orderId,
        clientOrderId
      });

      return true;

    } catch (error) {
      logger.logError(error as Error, 'Order Cancellation');
      return false;
    }
  }

  /**
   * Get active orders
   */
  public getActiveOrders(): OrderManagementData[] {
    return Array.from(this.activeOrders.values());
  }

  /**
   * Get order history
   */
  public getOrderHistory(): OrderManagementData[] {
    return this.orderHistory;
  }

  /**
   * Clean up old orders
   */
  public cleanupOldOrders(maxAge: number = 24 * 60 * 60 * 1000): void { // 24 hours
    const now = Date.now();
    
    for (const [clientOrderId, orderData] of this.activeOrders.entries()) {
      if (now - orderData.timestamp > maxAge) {
        this.activeOrders.delete(clientOrderId);
        logger.logSystem('OLD_ORDER_CLEANED', {
          clientOrderId,
          symbol: orderData.symbol,
          age: now - orderData.timestamp
        });
      }
    }
  }

  private mapOrderStatus(bingxStatus: string): 'PENDING' | 'FILLED' | 'CANCELLED' | 'REJECTED' {
    switch (bingxStatus) {
      case 'NEW':
      case 'PARTIALLY_FILLED':
        return 'PENDING';
      case 'FILLED':
        return 'FILLED';
      case 'CANCELED':
        return 'CANCELLED';
      case 'REJECTED':
      case 'EXPIRED':
        return 'REJECTED';
      default:
        return 'PENDING';
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
} 