// Export all types from individual modules
export * from './config';
export * from './signals';
export * from './trading';
export * from './bingx';

// Common utility types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Date;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface ErrorResponse {
  error: string;
  code: string;
  message: string;
  details?: any;
  timestamp: Date;
}

export interface HealthCheck {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: Date;
  uptime: number;
  version: string;
  services: {
    database: 'connected' | 'disconnected';
    bingx: 'connected' | 'disconnected';
    webhook: 'active' | 'inactive';
  };
  metrics: {
    totalSignals: number;
    totalTrades: number;
    activePositions: number;
    lastSignalTime?: Date;
    lastTradeTime?: Date;
  };
}

export interface SystemMetrics {
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  cpu: {
    usage: number;
  };
  uptime: number;
  timestamp: Date;
}

// Event types for internal communication
export interface SystemEvent {
  type: EventType;
  data: any;
  timestamp: Date;
  source: string;
}

export type EventType =
  | 'SIGNAL_RECEIVED'
  | 'SIGNAL_PROCESSED'
  | 'TRADE_EXECUTED'
  | 'TRADE_COMPLETED'
  | 'POSITION_OPENED'
  | 'POSITION_CLOSED'
  | 'RISK_LIMIT_HIT'
  | 'ERROR_OCCURRED'
  | 'SYSTEM_SHUTDOWN'
  | 'SYSTEM_STARTUP';

// Legacy types (keeping for backward compatibility)
export interface CryptoCurrency {
    id: string;
    name: string;
    symbol: string;
    price: number;
    marketCap: number;
    volume: number;
    changePercentage: number;
}

export interface User {
    id: string;
    username: string;
    email: string;
    balance: number;
}

export interface Transaction {
    id: string;
    userId: string;
    currencyId: string;
    amount: number;
    transactionType: 'buy' | 'sell';
    timestamp: Date;
}