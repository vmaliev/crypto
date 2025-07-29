import { BingXEndpoints } from '@/types/bingx';

export const BINGX_ENDPOINTS: BingXEndpoints = {
  // Account endpoints
  account: '/openApi/swap/v2/user/account',
  balance: '/openApi/swap/v2/user/balance',
  positions: '/openApi/swap/v2/user/positions',
  
  // Order endpoints
  order: '/openApi/swap/v2/trade/order',
  openOrders: '/openApi/swap/v2/trade/openOrders',
  allOrders: '/openApi/swap/v2/trade/allOrders',
  
  // Market data endpoints
  ticker: '/openApi/swap/v2/quote/ticker',
  klines: '/openApi/swap/v2/quote/klines',
  depth: '/openApi/swap/v2/quote/depth',
  trades: '/openApi/swap/v2/quote/trades',
  
  // User data endpoints
  userTrades: '/openApi/swap/v2/trade/userTrades',
  income: '/openApi/swap/v2/user/income',
  
  // Leverage & margin endpoints
  leverage: '/openApi/swap/v2/trade/leverage',
  marginType: '/openApi/swap/v2/trade/marginType',
  
  // WebSocket endpoints
  wsBaseUrl: 'wss://open-api-ws.bingx.com/market',
  wsUserDataStream: '/openApi/user/auth/userDataStream',
};

// API Rate Limits (requests per minute)
export const BINGX_RATE_LIMITS = {
  // General API limits
  GENERAL: 1200,
  
  // Order-specific limits
  ORDER_PLACEMENT: 100,
  ORDER_CANCELLATION: 100,
  
  // Market data limits
  MARKET_DATA: 2400,
  
  // Account data limits
  ACCOUNT_DATA: 180,
};

// Symbol mappings from TradingView to BingX format
export const SYMBOL_MAPPINGS: Record<string, string> = {
  'BTCUSD': 'BTC-USDT',
  'ETHUSD': 'ETH-USDT',
  'ADAUSD': 'ADA-USDT',
  'DOTUSD': 'DOT-USDT',
  'LINKUSD': 'LINK-USDT',
  'LTCUSD': 'LTC-USDT',
  'BCHUSD': 'BCH-USDT',
  'XRPUSD': 'XRP-USDT',
  'EOSUSD': 'EOS-USDT',
  'TRXUSD': 'TRX-USDT',
  'BNBUSD': 'BNB-USDT',
  'SOLUSD': 'SOL-USDT',
  'MATICUSD': 'MATIC-USDT',
  'AVAXUSD': 'AVAX-USDT',
  'DOGEUSD': 'DOGE-USDT',
  'SHIBUSD': 'SHIB-USDT',
  'APEUSD': 'APE-USDT',
  'SANDUSD': 'SAND-USDT',
  'MANAUSD': 'MANA-USDT',
  'AXSUSD': 'AXS-USDT',
};

// Reverse mapping for BingX to TradingView
export const REVERSE_SYMBOL_MAPPINGS: Record<string, string> = Object.fromEntries(
  Object.entries(SYMBOL_MAPPINGS).map(([tv, bx]) => [bx, tv])
);

// Helper function to convert TradingView symbol to BingX format
export function convertTradingViewSymbol(tvSymbol: string): string {
  // Remove any exchange prefix (e.g., "BINANCE:BTCUSDT" -> "BTCUSDT")
  const cleanSymbol = tvSymbol.includes(':') ? tvSymbol.split(':')[1] || tvSymbol : tvSymbol;
  
  // Check direct mapping first
  if (cleanSymbol && SYMBOL_MAPPINGS[cleanSymbol]) {
    return SYMBOL_MAPPINGS[cleanSymbol];
  }
  
  // Try to convert USDT symbols
  if (cleanSymbol && cleanSymbol.endsWith('USDT')) {
    const base = cleanSymbol.replace('USDT', '');
    return `${base}-USDT`;
  }
  
  // Try to convert USD symbols to USDT
  if (cleanSymbol && cleanSymbol.endsWith('USD') && !cleanSymbol.endsWith('USDT')) {
    const base = cleanSymbol.replace('USD', '');
    return `${base}-USDT`;
  }
  
  // Default: assume it's already in correct format or add -USDT
  if (!cleanSymbol) return tvSymbol;
  return cleanSymbol.includes('-') ? cleanSymbol : `${cleanSymbol}-USDT`;
}

// Helper function to convert BingX symbol to TradingView format
export function convertBingXSymbol(bxSymbol: string): string {
  // Check reverse mapping first
  if (REVERSE_SYMBOL_MAPPINGS[bxSymbol]) {
    return REVERSE_SYMBOL_MAPPINGS[bxSymbol];
  }
  
  // Convert BTC-USDT to BTCUSDT format
  if (bxSymbol.includes('-USDT')) {
    return bxSymbol.replace('-USDT', 'USDT');
  }
  
  // Default: return as is
  return bxSymbol;
}

// Validate if symbol is supported
export function isSupportedSymbol(symbol: string): boolean {
  const bxSymbol = convertTradingViewSymbol(symbol);
  // This would typically check against a list of supported symbols from the exchange
  // For now, we'll assume all converted symbols are supported
  return bxSymbol.includes('-USDT') || bxSymbol.includes('USDT');
}

// Get minimum order quantities for different symbols
export const MIN_ORDER_QUANTITIES: Record<string, number> = {
  'BTC-USDT': 0.001,
  'ETH-USDT': 0.01,
  'ADA-USDT': 1,
  'DOT-USDT': 0.1,
  'LINK-USDT': 0.1,
  'LTC-USDT': 0.01,
  'BCH-USDT': 0.001,
  'XRP-USDT': 1,
  'EOS-USDT': 0.1,
  'TRX-USDT': 10,
  'BNB-USDT': 0.01,
  'SOL-USDT': 0.01,
  'MATIC-USDT': 1,
  'AVAX-USDT': 0.01,
  'DOGE-USDT': 10,
  'SHIB-USDT': 100000,
  'APE-USDT': 0.1,
  'SAND-USDT': 1,
  'MANA-USDT': 1,
  'AXS-USDT': 0.1,
};

// Get minimum order quantity for a symbol
export function getMinOrderQuantity(symbol: string): number {
  const bxSymbol = convertTradingViewSymbol(symbol);
  return MIN_ORDER_QUANTITIES[bxSymbol] || 0.001; // Default minimum
}

// Price precision for different symbols
export const PRICE_PRECISION: Record<string, number> = {
  'BTC-USDT': 2,
  'ETH-USDT': 2,
  'ADA-USDT': 4,
  'DOT-USDT': 3,
  'LINK-USDT': 3,
  'LTC-USDT': 2,
  'BCH-USDT': 2,
  'XRP-USDT': 4,
  'EOS-USDT': 3,
  'TRX-USDT': 5,
  'BNB-USDT': 2,
  'SOL-USDT': 2,
  'MATIC-USDT': 4,
  'AVAX-USDT': 2,
  'DOGE-USDT': 5,
  'SHIB-USDT': 8,
  'APE-USDT': 3,
  'SAND-USDT': 4,
  'MANA-USDT': 4,
  'AXS-USDT': 3,
};

// Get price precision for a symbol
export function getPricePrecision(symbol: string): number {
  const bxSymbol = convertTradingViewSymbol(symbol);
  return PRICE_PRECISION[bxSymbol] || 4; // Default precision
}

// Format price according to symbol precision
export function formatPrice(price: number, symbol: string): string {
  const precision = getPricePrecision(symbol);
  return price.toFixed(precision);
}

// Format quantity according to symbol minimum
export function formatQuantity(quantity: number, symbol: string): string {
  const minQty = getMinOrderQuantity(symbol);
  const precision = minQty < 1 ? Math.abs(Math.log10(minQty)) : 0;
  return quantity.toFixed(precision);
}

export default BINGX_ENDPOINTS;