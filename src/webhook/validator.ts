import Joi from 'joi';
import { 
  TradingViewWebhookPayload, 
  SignalValidationResult, 
  SignalAction, 
  SignalStrength 
} from '@/types/signals';
import logger from '@/utils/logger';

// Joi schema for TradingView webhook payload validation
const webhookPayloadSchema = Joi.object({
  timestamp: Joi.string().isoDate().required(),
  symbol: Joi.string().min(3).max(20).required(),
  action: Joi.string().valid('BUY', 'SELL', 'CLOSE').required(),
  signal_strength: Joi.string().valid('STRONG', 'MEDIUM', 'WEAK').required(),
  price: Joi.number().positive().required(),
  mfi_value: Joi.number().min(0).max(100).required(),
  rsi_value: Joi.number().min(0).max(100).required(),
  timeframe: Joi.string().valid('1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M').required(),
  strategy: Joi.string().min(1).max(50).required(),
  secret: Joi.string().min(1).required(),
});

// Additional validation rules for signal logic
const signalLogicRules = {
  // MFI and RSI correlation rules
  mfiRsiCorrelation: (mfi: number, rsi: number, action: SignalAction): boolean => {
    if (action === 'BUY') {
      // For buy signals, both MFI and RSI should indicate oversold conditions
      return mfi < 50 && rsi < 50;
    } else if (action === 'SELL') {
      // For sell signals, both MFI and RSI should indicate overbought conditions
      return mfi > 50 && rsi > 50;
    }
    return true; // CLOSE signals don't need correlation check
  },

  // Signal strength validation
  signalStrengthLogic: (mfi: number, rsi: number, strength: SignalStrength): boolean => {
    const extremeOversold = mfi < 20 && rsi < 30;
    const extremeOverbought = mfi > 80 && rsi > 70;
    const moderateOversold = mfi < 40 && rsi < 40;
    const moderateOverbought = mfi > 60 && rsi > 60;

    switch (strength) {
      case 'STRONG':
        return extremeOversold || extremeOverbought;
      case 'MEDIUM':
        return moderateOversold || moderateOverbought;
      case 'WEAK':
        return !extremeOversold && !extremeOverbought && !moderateOversold && !moderateOverbought;
      default:
        return false;
    }
  },

  // Price validation (basic sanity check)
  priceValidation: (price: number, symbol: string): boolean => {
    // Basic price range validation based on common crypto prices
    if (symbol.includes('BTC')) {
      return price > 1000 && price < 200000; // BTC price range
    } else if (symbol.includes('ETH')) {
      return price > 10 && price < 10000; // ETH price range
    } else {
      return price > 0.000001 && price < 100000; // General crypto range
    }
  },

  // Timestamp validation (not too old, not in future)
  timestampValidation: (timestamp: string): boolean => {
    const signalTime = new Date(timestamp);
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const oneMinuteInFuture = new Date(now.getTime() + 60 * 1000);

    return signalTime >= fiveMinutesAgo && signalTime <= oneMinuteInFuture;
  },
};

export function validateWebhookPayload(payload: any): SignalValidationResult {
  const result: SignalValidationResult = {
    isValid: true,
    errors: [],
    warnings: [],
    confidence: 1.0,
  };

  try {
    // Basic schema validation
    const { error, value } = webhookPayloadSchema.validate(payload, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      result.isValid = false;
      result.errors = error.details.map(detail => detail.message);
      result.confidence = 0;
      return result;
    }

    const validatedPayload = value as TradingViewWebhookPayload;

    // Advanced signal logic validation
    const validationResults = [
      {
        rule: 'MFI-RSI Correlation',
        valid: signalLogicRules.mfiRsiCorrelation(
          validatedPayload.mfi_value,
          validatedPayload.rsi_value,
          validatedPayload.action
        ),
        impact: 0.2,
      },
      {
        rule: 'Signal Strength Logic',
        valid: signalLogicRules.signalStrengthLogic(
          validatedPayload.mfi_value,
          validatedPayload.rsi_value,
          validatedPayload.signal_strength
        ),
        impact: 0.15,
      },
      {
        rule: 'Price Validation',
        valid: signalLogicRules.priceValidation(
          validatedPayload.price,
          validatedPayload.symbol
        ),
        impact: 0.1,
      },
      {
        rule: 'Timestamp Validation',
        valid: signalLogicRules.timestampValidation(validatedPayload.timestamp),
        impact: 0.05,
      },
    ];

    // Process validation results
    for (const validation of validationResults) {
      if (!validation.valid) {
        result.warnings.push(`${validation.rule} check failed`);
        result.confidence -= validation.impact;
      }
    }

    // Additional warnings for edge cases
    if (validatedPayload.mfi_value > 95 || validatedPayload.mfi_value < 5) {
      result.warnings.push('Extreme MFI value detected');
    }

    if (validatedPayload.rsi_value > 95 || validatedPayload.rsi_value < 5) {
      result.warnings.push('Extreme RSI value detected');
    }

    // Check for conflicting signals
    if (validatedPayload.action === 'BUY' && 
        (validatedPayload.mfi_value > 70 || validatedPayload.rsi_value > 70)) {
      result.warnings.push('Buy signal in overbought conditions');
      result.confidence -= 0.1;
    }

    if (validatedPayload.action === 'SELL' && 
        (validatedPayload.mfi_value < 30 || validatedPayload.rsi_value < 30)) {
      result.warnings.push('Sell signal in oversold conditions');
      result.confidence -= 0.1;
    }

    // Ensure confidence is within bounds
    result.confidence = Math.max(0, Math.min(1, result.confidence));

    // Log validation results
    if (result.warnings.length > 0) {
      logger.warn('Signal validation warnings', {
        symbol: validatedPayload.symbol,
        action: validatedPayload.action,
        warnings: result.warnings,
        confidence: result.confidence,
      });
    }

  } catch (error) {
    result.isValid = false;
    result.errors.push(`Validation error: ${(error as Error).message}`);
    result.confidence = 0;
    
    logger.logError(error as Error, 'Webhook Payload Validation');
  }

  return result;
}

export function validateSignalConsistency(
  currentSignal: TradingViewWebhookPayload,
  previousSignals: TradingViewWebhookPayload[]
): SignalValidationResult {
  const result: SignalValidationResult = {
    isValid: true,
    errors: [],
    warnings: [],
    confidence: 1.0,
  };

  if (previousSignals.length === 0) {
    return result; // No previous signals to compare
  }

  const recentSignals = previousSignals
    .filter(signal => signal.symbol === currentSignal.symbol)
    .slice(-5); // Check last 5 signals for the same symbol

  if (recentSignals.length === 0) {
    return result; // No previous signals for this symbol
  }

  // Check for signal flip-flopping (rapid changes in direction)
  const recentActions = recentSignals.map(s => s.action);
  const uniqueActions = new Set(recentActions);
  
  if (uniqueActions.size > 2 && recentSignals.length >= 3) {
    result.warnings.push('Rapid signal direction changes detected');
    result.confidence -= 0.15;
  }

  // Check for duplicate signals
  const lastSignal = recentSignals[recentSignals.length - 1];
  if (lastSignal) {
    const timeDiff = new Date(currentSignal.timestamp).getTime() - new Date(lastSignal.timestamp).getTime();
    
    if (timeDiff < 60000 && // Less than 1 minute apart
        lastSignal.action === currentSignal.action &&
        Math.abs(lastSignal.price - currentSignal.price) < (lastSignal.price * 0.001)) { // Price difference < 0.1%
      result.warnings.push('Potential duplicate signal detected');
      result.confidence -= 0.2;
    }
  }

  // Check for signal strength consistency
  const strengthValues = { 'WEAK': 1, 'MEDIUM': 2, 'STRONG': 3 };
  const currentStrengthValue = strengthValues[currentSignal.signal_strength];
  const avgRecentStrength = recentSignals.reduce((sum, signal) => 
    sum + strengthValues[signal.signal_strength], 0) / recentSignals.length;

  if (Math.abs(currentStrengthValue - avgRecentStrength) > 1.5) {
    result.warnings.push('Signal strength inconsistent with recent signals');
    result.confidence -= 0.1;
  }

  result.confidence = Math.max(0, Math.min(1, result.confidence));

  return result;
}

export function sanitizeWebhookPayload(payload: any): TradingViewWebhookPayload | null {
  try {
    const { error, value } = webhookPayloadSchema.validate(payload, {
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      logger.warn('Failed to sanitize webhook payload', { error: error.message });
      return null;
    }

    return value as TradingViewWebhookPayload;
  } catch (error) {
    logger.logError(error as Error, 'Webhook Payload Sanitization');
    return null;
  }
}

// Export validation rules for testing
export { signalLogicRules };