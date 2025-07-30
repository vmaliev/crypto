# Configuration Guide

This guide explains how to configure your trading bot with the necessary environment variables.

## Environment Variables

Create a `.env` file in the root directory with the following variables:

### Required Variables

```bash
# BingX API Configuration
BINGX_API_KEY=your_bingx_api_key_here
BINGX_SECRET_KEY=your_bingx_secret_key_here
BINGX_TESTNET=true
BINGX_BASE_URL=https://open-api.bingx.com

# Webhook Configuration
WEBHOOK_PORT=3000
WEBHOOK_SECRET=your_webhook_secret_here
ALLOWED_IPS=127.0.0.1,::1

# Trading Configuration
POSITION_SIZE_PERCENT=2
MAX_DAILY_LOSS=5
MAX_OPEN_POSITIONS=3
LEVERAGE_MULTIPLIER=10
PAPER_TRADING=true

# Risk Management
STOP_LOSS_PERCENT=2
TAKE_PROFIT_PERCENT=4
TRAILING_STOP_PERCENT=1
USE_VOLATILITY_STOPS=true

# Database Configuration
DATABASE_PATH=./data/trading.db

# Logging Configuration
LOG_LEVEL=info
LOG_FILE=./logs/trading.log
```

### Optional Variables

```bash
# Notification Configuration
DISCORD_WEBHOOK_URL=your_discord_webhook_url_here
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
TELEGRAM_CHAT_ID=your_telegram_chat_id_here
```

## Webhook Secret

The `WEBHOOK_SECRET` is required for webhook authentication. You can generate a secure secret using:

```bash
# Generate a random 32-character secret
openssl rand -hex 16
```

Or use this pre-generated secret for testing:
```
test-webhook-secret-12345
```

## Quick Setup

1. **Copy the example configuration**:
```bash
cp .env.example .env
```

2. **Edit the configuration**:
```bash
nano .env
```

3. **Set your BingX API credentials**:
```bash
BINGX_API_KEY=your_actual_api_key
BINGX_SECRET_KEY=your_actual_secret_key
```

4. **Set a webhook secret**:
```bash
WEBHOOK_SECRET=test-webhook-secret-12345
```

5. **Start the bot**:
```bash
npm run dev
```

## Testing Webhook

After setting up the configuration, you can test the webhook:

```bash
# Test with the correct secret
curl -X POST http://localhost:3000/webhook/tradingview \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "BTCUSDT",
    "action": "BUY",
    "price": 50000,
    "strategy": "Test",
    "timeframe": "1h",
    "signal_strength": "STRONG",
    "mfi_value": 25,
    "rsi_value": 30,
    "secret": "test-webhook-secret-12345",
    "timestamp": "2024-01-01T12:00:00Z"
  }'
```

## Security Notes

- **Never commit your `.env` file** to version control
- **Use strong, unique secrets** for production
- **Restrict IP addresses** in `ALLOWED_IPS` for production
- **Enable HTTPS** for production webhooks
- **Rotate secrets regularly** for security

## Troubleshooting

### "WEBHOOK_SECRET is required"
- Make sure you have set the `WEBHOOK_SECRET` environment variable
- Check that your `.env` file is in the correct location

### "Invalid webhook secret"
- Verify the secret in your webhook payload matches the `WEBHOOK_SECRET`
- Check for typos or extra spaces

### "IP not whitelisted"
- Add your IP address to the `ALLOWED_IPS` list
- Use `127.0.0.1,::1` for local testing 