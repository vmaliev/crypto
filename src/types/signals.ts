export interface TradingViewWebhookPayload {
  timestamp: string;
  symbol: string;
  action: SignalAction;
  signal_strength: SignalStrength;
  price: number;
  mfi_value: number;
  rsi_value: number;
  timeframe: string;
  strategy: string;
  secret: string;
}

export type SignalAction = 'BUY' | 'SELL' | 'CLOSE';
export type SignalStrength = 'STRONG' | 'MEDIUM' | 'WEAK';

export interface ProcessedSignal {
  id: string;
  timestamp: Date;
  symbol: string;
  action: SignalAction;
  strength: SignalStrength;
  price: number;
  mfi: number;
  rsi: number;
  timeframe: string;
  strategy: string;
  confidence: number;
  isValid: boolean;
  validationErrors: string[];
}

export interface SignalValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  confidence: number;
}

export interface SignalFilter {
  minConfidence: number;
  allowedSymbols: string[];
  allowedTimeframes: string[];
  minMFI?: number;
  maxMFI?: number;
  minRSI?: number;
  maxRSI?: number;
  requiredStrength?: SignalStrength[];
}

export interface SignalHistory {
  id: string;
  signal: ProcessedSignal;
  processed: boolean;
  processedAt?: Date;
  tradeId?: string;
  result?: SignalResult;
  createdAt: Date;
}

export interface SignalResult {
  success: boolean;
  message: string;
  tradeExecuted: boolean;
  orderId?: string;
  error?: string;
}

export interface SignalMetrics {
  totalSignals: number;
  validSignals: number;
  processedSignals: number;
  successfulTrades: number;
  failedTrades: number;
  averageConfidence: number;
  signalsByStrength: Record<SignalStrength, number>;
  signalsByAction: Record<SignalAction, number>;
  lastSignalTime?: Date;
}

export interface WebhookRequest {
  headers: Record<string, string>;
  body: TradingViewWebhookPayload;
  ip: string;
  timestamp: Date;
  userAgent?: string;
}

export interface WebhookValidation {
  isValidIP: boolean;
  isValidSecret: boolean;
  isValidPayload: boolean;
  isRateLimited: boolean;
  errors: string[];
}