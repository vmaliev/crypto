export interface Position {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  size: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  realizedPnl: number;
  leverage: number;
  margin: number;
  liquidationPrice: number;
  markPrice: number;
  timestamp: Date;
  status: PositionStatus;
}

export type PositionStatus = 'OPEN' | 'CLOSED' | 'LIQUIDATED';

export interface Order {
  id: string;
  clientOrderId: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  price?: number;
  stopPrice?: number;
  timeInForce: TimeInForce;
  status: OrderStatus;
  executedQuantity: number;
  executedPrice: number;
  commission: number;
  commissionAsset: string;
  timestamp: Date;
  updateTime: Date;
}

export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_MARKET' | 'TAKE_PROFIT' | 'TAKE_PROFIT_MARKET';
export type TimeInForce = 'GTC' | 'IOC' | 'FOK';
export type OrderStatus = 'NEW' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELED' | 'REJECTED' | 'EXPIRED';

export interface TradeParameters {
  symbol: string;
  action: 'BUY' | 'SELL' | 'CLOSE';
  quantity: number;
  leverage: number;
  stopLoss?: number;
  takeProfit?: number;
  trailingStop?: number;
  signalId: string;
  confidence: number;
}

export interface TradeResult {
  success: boolean;
  orderId?: string;
  executedPrice?: number;
  executedQuantity?: number;
  commission?: number;
  error?: string;
  timestamp: Date;
}

export interface RiskParameters {
  stopLossPrice: number;
  takeProfitPrice: number;
  trailingStopDistance: number;
  maxLoss: number;
  riskRewardRatio: number;
  positionSize: number;
  leverage: number;
}

export interface PositionSizing {
  accountBalance: number;
  riskPercentage: number;
  entryPrice: number;
  stopLossPrice: number;
  leverage: number;
  calculatedSize: number;
  maxSize: number;
  riskAmount: number;
}

export interface AccountInfo {
  totalBalance: number;
  availableBalance: number;
  usedMargin: number;
  freeMargin: number;
  equity: number;
  unrealizedPnl: number;
  marginRatio: number;
  positions: Position[];
  orders: Order[];
  lastUpdate: Date;
}

export interface TradingSession {
  id: string;
  startTime: Date;
  endTime?: Date;
  totalTrades: number;
  successfulTrades: number;
  failedTrades: number;
  totalPnl: number;
  totalCommission: number;
  maxDrawdown: number;
  winRate: number;
  averageWin: number;
  averageLoss: number;
  profitFactor: number;
  sharpeRatio: number;
  isActive: boolean;
}

export interface TradeHistory {
  id: string;
  signalId: string;
  symbol: string;
  side: OrderSide;
  entryPrice: number;
  exitPrice?: number;
  quantity: number;
  leverage: number;
  pnl: number;
  commission: number;
  duration?: number; // in milliseconds
  entryTime: Date;
  exitTime?: Date;
  status: 'OPEN' | 'CLOSED' | 'CANCELLED';
  stopLoss?: number;
  takeProfit?: number;
  exitReason?: 'TAKE_PROFIT' | 'STOP_LOSS' | 'MANUAL' | 'SIGNAL';
}

export interface MarketData {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  volume24h: number;
  change24h: number;
  changePercent24h: number;
  high24h: number;
  low24h: number;
  timestamp: Date;
}

export interface TradingMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnl: number;
  totalCommission: number;
  netPnl: number;
  averageWin: number;
  averageLoss: number;
  largestWin: number;
  largestLoss: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  currentDrawdown: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  averageTradeDuration: number;
  dailyPnl: Record<string, number>;
  monthlyPnl: Record<string, number>;
}

export interface SafetyLimits {
  maxDailyLoss: number;
  maxOpenPositions: number;
  maxPositionSize: number;
  maxLeverage: number;
  dailyLossUsed: number;
  currentOpenPositions: number;
  isEmergencyStop: boolean;
  lastResetTime: Date;
}