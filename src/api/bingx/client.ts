import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import crypto from 'crypto';
import { 
  BingXApiConfig, 
  BingXApiResponse, 
  BingXAccountInfo, 
  BingXPosition, 
  BingXOrderRequest, 
  BingXOrderResponse,
  BingXOrderStatus,
  BingXTicker,
  BingXUserTrade,
  BingXLeverageRequest,
  BingXLeverageResponse,
  BingXMarginTypeRequest,

  BingXErrorCode
} from '@/types/bingx';
import logger from '@/utils/logger';
import config from '@/utils/config';

export class BingXClient {
  private axiosInstance: AxiosInstance;
  private config: BingXApiConfig;
  private rateLimitQueue: Array<() => Promise<any>> = [];
  private isProcessingQueue = false;

  constructor(apiConfig?: Partial<BingXApiConfig>) {
    const bingxConfig = config.getBingXConfig();
    this.config = { ...bingxConfig, ...apiConfig };
    
    this.axiosInstance = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'BingX-Trading-Bot/1.0.0',
      },
    });

    this.setupInterceptors();
    logger.logSystem('BingX Client initialized', { 
      baseUrl: this.config.baseUrl, 
      testnet: this.config.testnet 
    });
  }

  private setupInterceptors(): void {
    // Request interceptor for authentication
    this.axiosInstance.interceptors.request.use(
      (config) => {
        if (config.url && this.requiresAuthentication(config.url)) {
          const timestamp = Date.now().toString();
          const signature = this.generateSignature(config, timestamp);
          
          // Set authentication headers
          (config.headers as any)['X-BX-APIKEY'] = this.config.apiKey;
          (config.headers as any)['X-BX-TIMESTAMP'] = timestamp;
          (config.headers as any)['X-BX-SIGN'] = signature;
        }
        
        logger.logAPI('REQUEST', config.url || '', {
          method: config.method?.toUpperCase(),
          params: config.params,
        });
        
        return config;
      },
      (error) => {
        logger.logError(error, 'BingX Request Interceptor');
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.axiosInstance.interceptors.response.use(
      (response: AxiosResponse<BingXApiResponse>) => {
        logger.logAPI('RESPONSE', response.config.url || '', {
          status: response.status,
          code: response.data.code,
        });

        if (response.data.code !== 0) {
          throw new BingXApiError(response.data.code, response.data.msg);
        }

        return response;
      },
      (error) => {
        if (error.response) {
          const { status, data } = error.response;
          logger.logError(new Error(`BingX API Error: ${status} - ${JSON.stringify(data)}`), 'BingX Response');
          
          if (status === 429) {
            // Rate limit exceeded
            throw new BingXApiError(BingXErrorCode.TOO_MANY_REQUESTS, 'Rate limit exceeded');
          }
        }
        
        logger.logError(error, 'BingX API Request');
        return Promise.reject(error);
      }
    );
  }

  private requiresAuthentication(url: string): boolean {
    const publicEndpoints = ['/openApi/swap/v2/quote/ticker', '/openApi/swap/v2/quote/depth'];
    return !publicEndpoints.some(endpoint => url.includes(endpoint));
  }

  private generateSignature(config: AxiosRequestConfig, timestamp: string): string {
    let queryString = '';
    
    if (config.method?.toUpperCase() === 'GET' && config.params) {
      queryString = new URLSearchParams(config.params).toString();
    } else if (config.method?.toUpperCase() === 'POST' && config.data) {
      queryString = typeof config.data === 'string' ? config.data : JSON.stringify(config.data);
    }

    const signaturePayload = timestamp + (config.method?.toUpperCase() || 'GET') + (config.url || '') + queryString;
    
    return crypto
      .createHmac('sha256', this.config.secretKey)
      .update(signaturePayload)
      .digest('hex');
  }

  private async makeRequest<T>(
    method: 'GET' | 'POST' | 'DELETE',
    endpoint: string,
    params?: any,
    data?: any
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const requestFn = async () => {
        try {
          const response = await this.axiosInstance.request<BingXApiResponse<T>>({
            method,
            url: endpoint,
            params: method === 'GET' ? params : undefined,
            data: method !== 'GET' ? data || params : undefined,
          });

          resolve(response.data.data);
        } catch (error) {
          reject(error);
        }
      };

      this.rateLimitQueue.push(requestFn);
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.rateLimitQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.rateLimitQueue.length > 0) {
      const requestFn = this.rateLimitQueue.shift();
      if (requestFn) {
        try {
          await requestFn();
        } catch (error) {
          // Error handling is done in the request function
        }
        
        // Add delay between requests to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    this.isProcessingQueue = false;
  }

  // Account Information
  async getAccountInfo(): Promise<BingXAccountInfo> {
    return this.makeRequest<BingXAccountInfo>('GET', '/openApi/swap/v2/user/account');
  }

  async getPositions(symbol?: string): Promise<BingXPosition[]> {
    const params = symbol ? { symbol } : {};
    return this.makeRequest<BingXPosition[]>('GET', '/openApi/swap/v2/user/positions', params);
  }

  // Order Management
  async placeOrder(orderRequest: BingXOrderRequest): Promise<BingXOrderResponse> {
    logger.logTrade('PLACE_ORDER', orderRequest);
    return this.makeRequest<BingXOrderResponse>('POST', '/openApi/swap/v2/trade/order', orderRequest);
  }

  async cancelOrder(symbol: string, orderId?: number, clientOrderId?: string): Promise<BingXOrderResponse> {
    const params: any = { symbol };
    if (orderId) params.orderId = orderId;
    if (clientOrderId) params.origClientOrderId = clientOrderId;
    
    logger.logTrade('CANCEL_ORDER', params);
    return this.makeRequest<BingXOrderResponse>('DELETE', '/openApi/swap/v2/trade/order', params);
  }

  async getOrderStatus(symbol: string, orderId?: number, clientOrderId?: string): Promise<BingXOrderStatus> {
    const params: any = { symbol };
    if (orderId) params.orderId = orderId;
    if (clientOrderId) params.origClientOrderId = clientOrderId;
    
    return this.makeRequest<BingXOrderStatus>('GET', '/openApi/swap/v2/trade/order', params);
  }

  async getOpenOrders(symbol?: string): Promise<BingXOrderStatus[]> {
    const params = symbol ? { symbol } : {};
    return this.makeRequest<BingXOrderStatus[]>('GET', '/openApi/swap/v2/trade/openOrders', params);
  }

  async getAllOrders(symbol: string, limit: number = 500): Promise<BingXOrderStatus[]> {
    return this.makeRequest<BingXOrderStatus[]>('GET', '/openApi/swap/v2/trade/allOrders', {
      symbol,
      limit,
    });
  }

  // Market Data
  async getTicker(symbol?: string): Promise<BingXTicker | BingXTicker[]> {
    const params = symbol ? { symbol } : {};
    return this.makeRequest<BingXTicker | BingXTicker[]>('GET', '/openApi/swap/v2/quote/ticker', params);
  }

  async getPrice(symbol: string): Promise<{ symbol: string; price: string }> {
    return this.makeRequest<{ symbol: string; price: string }>('GET', '/openApi/swap/v2/quote/price', { symbol });
  }

  // Trading History
  async getUserTrades(symbol: string, limit: number = 500): Promise<BingXUserTrade[]> {
    return this.makeRequest<BingXUserTrade[]>('GET', '/openApi/swap/v2/trade/userTrades', {
      symbol,
      limit,
    });
  }

  // Leverage and Margin
  async changeLeverage(leverageRequest: BingXLeverageRequest): Promise<BingXLeverageResponse> {
    logger.logSystem('CHANGE_LEVERAGE', leverageRequest);
    return this.makeRequest<BingXLeverageResponse>('POST', '/openApi/swap/v2/trade/leverage', leverageRequest);
  }

  async changeMarginType(marginRequest: BingXMarginTypeRequest): Promise<{ symbol: string; marginType: string }> {
    logger.logSystem('CHANGE_MARGIN_TYPE', marginRequest);
    return this.makeRequest<{ symbol: string; marginType: string }>('POST', '/openApi/swap/v2/trade/marginType', marginRequest);
  }

  // Utility Methods
  async testConnectivity(): Promise<boolean> {
    try {
      await this.makeRequest<any>('GET', '/openApi/swap/v2/server/time');
      logger.logSystem('CONNECTIVITY_TEST', { status: 'SUCCESS' });
      return true;
    } catch (error) {
      logger.logError(error as Error, 'Connectivity Test');
      return false;
    }
  }

  async getServerTime(): Promise<number> {
    const response = await this.makeRequest<{ serverTime: number }>('GET', '/openApi/swap/v2/server/time');
    return response.serverTime;
  }

  // Helper method to create market buy order
  async marketBuy(symbol: string, quantity: string, positionSide: 'LONG' | 'SHORT' = 'LONG'): Promise<BingXOrderResponse> {
    return this.placeOrder({
      symbol,
      side: 'BUY',
      type: 'MARKET',
      quantity,
      positionSide,
    });
  }

  // Helper method to create market sell order
  async marketSell(symbol: string, quantity: string, positionSide: 'LONG' | 'SHORT' = 'LONG'): Promise<BingXOrderResponse> {
    return this.placeOrder({
      symbol,
      side: 'SELL',
      type: 'MARKET',
      quantity,
      positionSide,
    });
  }

  // Helper method to create stop loss order
  async placeStopLoss(symbol: string, quantity: string, stopPrice: string, positionSide: 'LONG' | 'SHORT' = 'LONG'): Promise<BingXOrderResponse> {
    return this.placeOrder({
      symbol,
      side: positionSide === 'LONG' ? 'SELL' : 'BUY',
      type: 'STOP_MARKET',
      quantity,
      stopPrice,
      positionSide,
      reduceOnly: true,
    });
  }

  // Helper method to create take profit order
  async placeTakeProfit(symbol: string, quantity: string, stopPrice: string, positionSide: 'LONG' | 'SHORT' = 'LONG'): Promise<BingXOrderResponse> {
    return this.placeOrder({
      symbol,
      side: positionSide === 'LONG' ? 'SELL' : 'BUY',
      type: 'TAKE_PROFIT_MARKET',
      quantity,
      stopPrice,
      positionSide,
      reduceOnly: true,
    });
  }

  // Close all positions for a symbol
  async closePosition(symbol: string, positionSide: 'LONG' | 'SHORT' = 'LONG'): Promise<BingXOrderResponse> {
    return this.placeOrder({
      symbol,
      side: positionSide === 'LONG' ? 'SELL' : 'BUY',
      type: 'MARKET',
      positionSide,
      closePosition: true,
    });
  }
}

// Custom error class for BingX API errors
export class BingXApiError extends Error {
  public code: number;
  public originalMessage: string;

  constructor(code: number, message: string) {
    super(`BingX API Error ${code}: ${message}`);
    this.name = 'BingXApiError';
    this.code = code;
    this.originalMessage = message;
  }

  public isRateLimitError(): boolean {
    return this.code === BingXErrorCode.TOO_MANY_REQUESTS;
  }

  public isAuthenticationError(): boolean {
    return [
      BingXErrorCode.UNAUTHORIZED,
      BingXErrorCode.INVALID_SIGNATURE,
      BingXErrorCode.INVALID_TIMESTAMP,
    ].includes(this.code);
  }

  public isInsufficientBalanceError(): boolean {
    return this.code === BingXErrorCode.INSUFFICIENT_BALANCE;
  }
}

// Export singleton instance
export const bingxClient = new BingXClient();
export default bingxClient;