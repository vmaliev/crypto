import crypto from 'crypto';
import { WebhookRequest } from '@/types/signals';
import config from '@/utils/config';
import logger from '@/utils/logger';

/**
 * Check if the request IP is in the allowed whitelist
 */
export function checkIPWhitelist(requestIP: string): boolean {
  const webhookConfig = config.getWebhookConfig();
  const allowedIPs = webhookConfig.allowedIPs;

  // If no IPs are configured, allow all (not recommended for production)
  if (allowedIPs.length === 0) {
    logger.warn('No IP whitelist configured - allowing all IPs');
    return true;
  }

  // Check for exact IP match
  if (allowedIPs.includes(requestIP)) {
    return true;
  }

  // Check for localhost variations
  const localhostIPs = ['127.0.0.1', '::1', 'localhost'];
  if (localhostIPs.includes(requestIP) && allowedIPs.some(ip => localhostIPs.includes(ip))) {
    return true;
  }

  // Check for CIDR ranges (basic implementation)
  for (const allowedIP of allowedIPs) {
    if (allowedIP.includes('/')) {
      if (isIPInCIDR(requestIP, allowedIP)) {
        return true;
      }
    }
  }

  logger.logRisk('IP_NOT_WHITELISTED', {
    requestIP,
    allowedIPs: allowedIPs.length > 0 ? '[CONFIGURED]' : '[NONE]',
  });

  return false;
}

/**
 * Authenticate webhook request using secret verification
 */
export function authenticateWebhook(webhookRequest: WebhookRequest): boolean {
  const webhookConfig = config.getWebhookConfig();
  const expectedSecret = webhookConfig.secret;

  if (!expectedSecret) {
    logger.warn('No webhook secret configured - skipping authentication');
    return true;
  }

  // Check for secret in payload
  const payloadSecret = webhookRequest.body.secret;
  if (!payloadSecret) {
    logger.logRisk('WEBHOOK_MISSING_SECRET', {
      ip: webhookRequest.ip,
      hasSecret: false,
    });
    return false;
  }

  // Simple secret comparison
  if (payloadSecret === expectedSecret) {
    return true;
  }

  // Try HMAC verification if the secret looks like a signature
  if (payloadSecret.length > 32) {
    return verifyHMACSignature(webhookRequest, expectedSecret);
  }

  logger.logRisk('WEBHOOK_INVALID_SECRET', {
    ip: webhookRequest.ip,
    providedSecretLength: payloadSecret.length,
  });

  return false;
}

/**
 * Verify HMAC signature for enhanced security
 */
export function verifyHMACSignature(webhookRequest: WebhookRequest, secret: string): boolean {
  try {
    // Get signature from headers (common webhook pattern)
    const signature = webhookRequest.headers['x-signature'] || 
                     webhookRequest.headers['x-hub-signature-256'] ||
                     webhookRequest.headers['signature'];

    if (!signature) {
      return false;
    }

    // Create payload string for verification
    const payload = JSON.stringify(webhookRequest.body);
    
    // Generate expected signature
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    // Compare signatures (timing-safe comparison)
    const providedSignature = signature.replace('sha256=', '');
    
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(providedSignature, 'hex')
    );

  } catch (error) {
    logger.logError(error as Error, 'HMAC Signature Verification');
    return false;
  }
}

/**
 * Generate HMAC signature for outgoing webhooks
 */
export function generateHMACSignature(payload: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}

/**
 * Basic CIDR range check implementation
 */
function isIPInCIDR(ip: string, cidr: string): boolean {
  try {
    const parts = cidr.split('/');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return false;
    }
    
    const [network, prefixLengthStr] = parts;
    const prefix = parseInt(prefixLengthStr, 10);

    if (isNaN(prefix) || prefix < 0 || prefix > 32) {
      return false;
    }

    // Convert IPs to integers for comparison
    const ipInt = ipToInt(ip);
    const networkInt = ipToInt(network);
    
    if (ipInt === null || networkInt === null) {
      return false;
    }

    // Create subnet mask
    const mask = (0xFFFFFFFF << (32 - prefix)) >>> 0;
    
    // Check if IP is in the network
    return (ipInt & mask) === (networkInt & mask);

  } catch (error) {
    logger.logError(error as Error, 'CIDR Range Check');
    return false;
  }
}

/**
 * Convert IP address string to integer
 */
function ipToInt(ip: string): number | null {
  try {
    const parts = ip.split('.');
    if (parts.length !== 4) {
      return null;
    }

    let result = 0;
    for (let i = 0; i < 4; i++) {
      const partStr = parts[i];
      if (!partStr) {
        return null;
      }
      const part = parseInt(partStr, 10);
      if (isNaN(part) || part < 0 || part > 255) {
        return null;
      }
      result = (result << 8) + part;
    }

    return result >>> 0; // Convert to unsigned 32-bit integer
  } catch (error) {
    return null;
  }
}

/**
 * Validate webhook headers for security
 */
export function validateWebhookHeaders(headers: Record<string, string>): {
  isValid: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];
  let isValid = true;

  // Check Content-Type
  const contentType = headers['content-type'] || headers['Content-Type'];
  if (!contentType || !contentType.includes('application/json')) {
    warnings.push('Invalid or missing Content-Type header');
  }

  // Check User-Agent
  const userAgent = headers['user-agent'] || headers['User-Agent'];
  if (!userAgent) {
    warnings.push('Missing User-Agent header');
  } else if (userAgent.length > 200) {
    warnings.push('Suspicious User-Agent header length');
  }

  // Check for suspicious headers
  const suspiciousHeaders = ['x-forwarded-for', 'x-real-ip', 'x-originating-ip'];
  for (const header of suspiciousHeaders) {
    if (headers[header]) {
      warnings.push(`Potentially spoofed header detected: ${header}`);
    }
  }

  // Check Content-Length
  const contentLength = headers['content-length'] || headers['Content-Length'];
  if (contentLength) {
    const length = parseInt(contentLength, 10);
    if (length > 10000) { // 10KB limit
      warnings.push('Request payload too large');
      isValid = false;
    }
  }

  return { isValid, warnings };
}

/**
 * Rate limiting key generator
 */
export function generateRateLimitKey(request: WebhookRequest): string {
  // Combine IP and User-Agent for more granular rate limiting
  const userAgent = request.userAgent || 'unknown';
  const key = `${request.ip}:${crypto.createHash('md5').update(userAgent).digest('hex').substring(0, 8)}`;
  return key;
}

/**
 * Security audit log entry
 */
export function logSecurityEvent(
  event: 'IP_BLOCKED' | 'AUTH_FAILED' | 'RATE_LIMITED' | 'SUSPICIOUS_REQUEST',
  details: Record<string, any>
): void {
  logger.logRisk(`SECURITY_${event}`, {
    timestamp: new Date().toISOString(),
    ...details,
  });
}

/**
 * Check for common attack patterns in webhook payload
 */
export function detectAttackPatterns(payload: any): {
  isAttack: boolean;
  patterns: string[];
} {
  const patterns: string[] = [];
  let isAttack = false;

  const payloadString = JSON.stringify(payload).toLowerCase();

  // SQL injection patterns
  const sqlPatterns = ['union select', 'drop table', 'insert into', '1=1', 'or 1=1'];
  for (const pattern of sqlPatterns) {
    if (payloadString.includes(pattern)) {
      patterns.push(`SQL injection: ${pattern}`);
      isAttack = true;
    }
  }

  // XSS patterns
  const xssPatterns = ['<script', 'javascript:', 'onerror=', 'onload='];
  for (const pattern of xssPatterns) {
    if (payloadString.includes(pattern)) {
      patterns.push(`XSS attempt: ${pattern}`);
      isAttack = true;
    }
  }

  // Command injection patterns
  const cmdPatterns = ['$(', '`', '&&', '||', ';rm ', ';cat '];
  for (const pattern of cmdPatterns) {
    if (payloadString.includes(pattern)) {
      patterns.push(`Command injection: ${pattern}`);
      isAttack = true;
    }
  }

  // Path traversal patterns
  const pathPatterns = ['../', '..\\', '/etc/passwd', '/proc/'];
  for (const pattern of pathPatterns) {
    if (payloadString.includes(pattern)) {
      patterns.push(`Path traversal: ${pattern}`);
      isAttack = true;
    }
  }

  if (isAttack) {
    logSecurityEvent('SUSPICIOUS_REQUEST', {
      patterns,
      payloadSize: payloadString.length,
    });
  }

  return { isAttack, patterns };
}

/**
 * Sanitize string input to prevent injection attacks
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, '') // Remove HTML tags
    .replace(/['"]/g, '') // Remove quotes
    .replace(/[;\\]/g, '') // Remove command separators
    .trim()
    .substring(0, 1000); // Limit length
}

/**
 * Generate secure random token for webhook secrets
 */
export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

export default {
  checkIPWhitelist,
  authenticateWebhook,
  verifyHMACSignature,
  generateHMACSignature,
  validateWebhookHeaders,
  generateRateLimitKey,
  logSecurityEvent,
  detectAttackPatterns,
  sanitizeInput,
  generateSecureToken,
};