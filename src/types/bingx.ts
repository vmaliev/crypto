// BingX API Response Types
export interface BingXApiResponse<T = any> {
  code: number;
  msg: string;
  data: T;
  timestamp: number;
}

export interface BingXError {
  code: number;
  msg: string;
}

// Account & Balance Types
export interface BingXAccountBalance {
  asset: string;
  balance: string;
  crossWalletBalance: string;
  crossUnPnl: string;
  availableBalance: string;
  maxWithdrawAmount: string;
  marginAvailable: boolean;
  updateTime: number;
}

export interface BingXAccountInfo {
  feeTier: number;
  canTrade: boolean;
  canDeposit: boolean;
  canWithdraw: boolean;
  updateTime: number;
  totalInitialMargin: string;
  totalMaintMargin: string;
  totalWalletBalance: string;
  totalUnrealizedProfit: string;
  totalMarginBalance: string;
  totalPositionInitialMargin: string;
  totalOpenOrderInitialMargin: string;
  totalCrossWalletBalance: string;
  totalCrossUnPnl: string;
  availableBalance: string;
  maxWithdrawAmount: string;
  assets: BingXAccountBalance[];
  positions: BingXPosition[];
}

// Position Types
export interface BingXPosition {
  symbol: string;
  initialMargin: string;
  maintMargin: string;
  unrealizedProfit: string;
  positionInitialMargin: string;
  openOrderInitialMargin: string;
  leverage: string;
  isolated: boolean;
  entryPrice: string;
  maxNotional: string;
  positionSide: 'BOTH' | 'LONG' | 'SHORT';
  positionAmt: string;
  notional: string;
  isolatedWallet: string;
  updateTime: number;
  bidNotional: string;
  askNotional: string;
}

// Order Types
export interface BingXOrderRequest {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'LIMIT' | 'MARKET' | 'STOP' | 'TAKE_PROFIT' | 'STOP_MARKET' | 'TAKE_PROFIT_MARKET';
  quantity?: string;
  quoteOrderQty?: string;
  price?: string;
  stopPrice?: string;
  timeInForce?: 'GTC' | 'IOC' | 'FOK';
  positionSide?: 'BOTH' | 'LONG' | 'SHORT';
  reduceOnly?: boolean;
  newClientOrderId?: string;
  closePosition?: boolean;
  activationPrice?: string;
  callbackRate?: string;
  workingType?: 'MARK_PRICE' | 'CONTRACT_PRICE';
  priceProtect?: boolean;
}

export interface BingXOrderResponse {
  orderId: number;
  symbol: string;
  status: 'NEW' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELED' | 'REJECTED' | 'EXPIRED';
  clientOrderId: string;
  price: string;
  avgPrice: string;
  origQty: string;
  executedQty: string;
  cumQty: string;
  cumQuote: string;
  timeInForce: string;
  type: string;
  reduceOnly: boolean;
  closePosition: boolean;
  side: string;
  positionSide: string;
  stopPrice: string;
  workingType: string;
  priceProtect: boolean;
  origType: string;
  updateTime: number;
}

export interface BingXOrderStatus {
  orderId: number;
  symbol: string;
  status: string;
  clientOrderId: string;
  price: string;
  avgPrice: string;
  origQty: string;
  executedQty: string;
  cumQty: string;
  cumQuote: string;
  timeInForce: string;
  type: string;
  reduceOnly: boolean;
  closePosition: boolean;
  side: string;
  positionSide: string;
  stopPrice: string;
  workingType: string;
  priceProtect: boolean;
  origType: string;
  time: number;
  updateTime: number;
}

// Market Data Types
export interface BingXTicker {
  symbol: string;
  priceChange: string;
  priceChangePercent: string;
  weightedAvgPrice: string;
  lastPrice: string;
  lastQty: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  openTime: number;
  closeTime: number;
  firstId: number;
  lastId: number;
  count: number;
}

export interface BingXKline {
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  closeTime: number;
  quoteAssetVolume: string;
  takerBuyBaseAssetVolume: string;
  takerBuyQuoteAssetVolume: string;
}

export interface BingXOrderBook {
  lastUpdateId: number;
  bids: [string, string][];
  asks: [string, string][];
}

// Trade History Types
export interface BingXTrade {
  id: number;
  price: string;
  qty: string;
  quoteQty: string;
  time: number;
  isBuyerMaker: boolean;
}

export interface BingXUserTrade {
  symbol: string;
  id: number;
  orderId: number;
  side: string;
  price: string;
  qty: string;
  realizedPnl: string;
  marginAsset: string;
  quoteQty: string;
  commission: string;
  commissionAsset: string;
  time: number;
  positionSide: string;
  buyer: boolean;
  maker: boolean;
}

// Leverage and Margin Types
export interface BingXLeverageRequest {
  symbol: string;
  leverage: number;
}

export interface BingXLeverageResponse {
  leverage: number;
  maxNotionalValue: string;
  symbol: string;
}

export interface BingXMarginTypeRequest {
  symbol: string;
  marginType: 'ISOLATED' | 'CROSSED';
}

// WebSocket Types
export interface BingXWebSocketMessage {
  stream: string;
  data: any;
}

export interface BingXWebSocketSubscription {
  method: 'SUBSCRIBE' | 'UNSUBSCRIBE';
  params: string[];
  id: number;
}

// API Configuration
export interface BingXApiConfig {
  apiKey: string;
  secretKey: string;
  baseUrl: string;
  testnet: boolean;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
}

// Request Headers
export interface BingXRequestHeaders {
  'X-BX-APIKEY': string;
  'X-BX-SIGN': string;
  'X-BX-TIMESTAMP': string;
  'Content-Type': string;
  'User-Agent': string;
  [key: string]: string;
}

// API Endpoints
export interface BingXEndpoints {
  // Account
  account: string;
  balance: string;
  positions: string;
  
  // Orders
  order: string;
  openOrders: string;
  allOrders: string;
  
  // Market Data
  ticker: string;
  klines: string;
  depth: string;
  trades: string;
  
  // User Data
  userTrades: string;
  income: string;
  
  // Leverage & Margin
  leverage: string;
  marginType: string;
  
  // WebSocket
  wsBaseUrl: string;
  wsUserDataStream: string;
}

// Rate Limiting
export interface BingXRateLimit {
  rateLimitType: 'REQUEST_WEIGHT' | 'ORDERS';
  interval: 'SECOND' | 'MINUTE' | 'DAY';
  intervalNum: number;
  limit: number;
  count: number;
}

// Error Codes
export enum BingXErrorCode {
  UNKNOWN = -1000,
  DISCONNECTED = -1001,
  UNAUTHORIZED = -1002,
  TOO_MANY_REQUESTS = -1003,
  UNEXPECTED_RESP = -1006,
  TIMEOUT = -1007,
  INVALID_MESSAGE = -1013,
  UNKNOWN_ORDER_COMPOSITION = -1014,
  TOO_MANY_ORDERS = -1015,
  SERVICE_SHUTTING_DOWN = -1016,
  UNSUPPORTED_OPERATION = -1020,
  INVALID_TIMESTAMP = -1021,
  INVALID_SIGNATURE = -1022,
  ILLEGAL_CHARS = -1100,
  TOO_MANY_PARAMETERS = -1101,
  MANDATORY_PARAM_EMPTY_OR_MALFORMED = -1102,
  UNKNOWN_PARAM = -1103,
  UNREAD_PARAMETERS = -1104,
  PARAM_EMPTY = -1105,
  PARAM_NOT_REQUIRED = -1106,
  NO_DEPTH = -1112,
  TIF_NOT_REQUIRED = -1114,
  INVALID_TIF = -1115,
  INVALID_ORDER_TYPE = -1116,
  INVALID_SIDE = -1117,
  EMPTY_NEW_CL_ORD_ID = -1118,
  EMPTY_ORG_CL_ORD_ID = -1119,
  BAD_INTERVAL = -1120,
  BAD_SYMBOL = -1121,
  INVALID_LISTEN_KEY = -1125,
  MORE_THAN_XX_HOURS = -1127,
  OPTIONAL_PARAMS_BAD_COMBO = -1128,
  INVALID_PARAMETER = -1130,
  BAD_API_ID = -2008,
  DUPLICATE_API_KEY_DESC = -2009,
  INSUFFICIENT_BALANCE = -2010,
  CANCEL_ALL_FAIL = -2012,
  NO_SUCH_ORDER = -2013,
  BAD_API_KEY_FMT = -2014,
  REJECTED_MBX_KEY = -2015,
}