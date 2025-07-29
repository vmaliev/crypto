# BingX Futures Trading Bot - Setup Guide

## Overview

This guide will help you set up and configure the BingX futures trading bot that responds to TradingView MFI+RSI signals.

## Prerequisites

- Node.js 18+ installed
- BingX account with API access
- TradingView account with alert capabilities
- Basic understanding of cryptocurrency trading and risk management

## Installation

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd crypto
npm install
```

### 2. Environment Configuration

Copy the example environment file and configure your settings:

```bash
cp .env.example .env
```

Edit the `.env` file with your configuration:

```bash
# BingX API Configuration
BINGX_API_KEY=your_api_key_here
BINGX_SECRET_KEY=your_secret_key_here
BINGX_TESTNET=true
BINGX_BASE_URL=https://open-api.bingx.com

# Webhook Configuration
WEBHOOK_PORT=3000
WEBHOOK_SECRET=your_secure_webhook_secret
ALLOWED_IPS=127.0.0.1,your.tradingview.ip

# Trading Configuration
POSITION_SIZE_PERCENT=2
MAX_DAILY_LOSS=5
MAX_OPEN_POSITIONS=3
LEVERAGE_MULTIPLIER=10

# Risk Management
STOP_LOSS_PERCENT=2
TAKE_PROFIT_PERCENT=4
TRAILING_STOP_PERCENT=1
USE_VOLATILITY_STOPS=true

# Notifications (Optional)
DISCORD_WEBHOOK_URL=your_discord_webhook_url
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_telegram_chat_id

# Database
DATABASE_PATH=./data/trading.db

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/trading.log

# Paper Trading Mode (Recommended for testing)
PAPER_TRADING=true
```

### 3. BingX API Setup

1. **Create BingX Account**: Sign up at [BingX](https://bingx.com)
2. **Enable API Access**: 
   - Go to Account Settings → API Management
   - Create new API key with futures trading permissions
   - **Important**: Start with testnet for testing
3. **Configure IP Whitelist**: Add your server's IP address to BingX API whitelist
4. **Set Permissions**: Enable "Futures Trading" permissions for your API key

### 4. TradingView Setup

#### MFI+RSI Indicator Setup

1. **Add the Indicator**: Use the MFI+RSI script from the provided TradingView link
2. **Configure Alerts**: Set up alerts with the following webhook message:

```json
{
  "timestamp": "{{time}}",
  "symbol": "{{ticker}}",
  "action": "{{strategy.order.action}}",
  "signal_strength": "STRONG",
  "price": {{close}},
  "mfi_value": {{plot_0}},
  "rsi_value": {{plot_1}},
  "timeframe": "{{interval}}",
  "strategy": "MFI_RSI",
  "secret": "your_webhook_secret_here"
}
```

3. **Webhook URL**: Set to `https://your-server.com/webhook/tradingview`

## Configuration Details

### Trading Parameters

| Parameter | Description | Default | Range |
|-----------|-------------|---------|-------|
| `POSITION_SIZE_PERCENT` | Percentage of account balance per trade | 2% | 0.1-10% |
| `MAX_DAILY_LOSS` | Maximum daily loss limit | 5% | 1-20% |
| `MAX_OPEN_POSITIONS` | Maximum concurrent positions | 3 | 1-10 |
| `LEVERAGE_MULTIPLIER` | Leverage to use for trades | 10x | 1-125x |

### Risk Management

| Parameter | Description | Default | Range |
|-----------|-------------|---------|-------|
| `STOP_LOSS_PERCENT` | Default stop-loss percentage | 2% | 0.5-10% |
| `TAKE_PROFIT_PERCENT` | Default take-profit percentage | 4% | 1-20% |
| `TRAILING_STOP_PERCENT` | Trailing stop distance | 1% | 0.1-5% |
| `USE_VOLATILITY_STOPS` | Use ATR-based dynamic stops | true | true/false |

### Security Settings

| Parameter | Description | Example |
|-----------|-------------|---------|
| `WEBHOOK_SECRET` | Secret for webhook authentication | `secure_random_string_here` |
| `ALLOWED_IPS` | Comma-separated list of allowed IPs | `127.0.0.1,52.89.214.238` |

## Running the Bot

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
npm run build
npm start
```

### Using PM2 (Recommended for Production)

```bash
# Install PM2 globally
npm install -g pm2

# Start the bot
pm2 start dist/index.js --name "bingx-trading-bot"

# Monitor logs
pm2 logs bingx-trading-bot

# Restart bot
pm2 restart bingx-trading-bot

# Stop bot
pm2 stop bingx-trading-bot
```

## Testing

### 1. Paper Trading Mode

Always start with paper trading enabled:

```bash
PAPER_TRADING=true
```

This mode simulates trades without executing real orders.

### 2. Webhook Testing

Test your webhook endpoint:

```bash
curl -X POST http://localhost:3000/webhook/test \
  -H "Content-Type: application/json" \
  -d '{"test": "message"}'
```

### 3. TradingView Signal Testing

Send a test signal from TradingView or use curl:

```bash
curl -X POST http://localhost:3000/webhook/tradingview \
  -H "Content-Type: application/json" \
  -d '{
    "timestamp": "2025-01-29T16:00:00Z",
    "symbol": "BTCUSDT",
    "action": "BUY",
    "signal_strength": "STRONG",
    "price": 45000,
    "mfi_value": 25,
    "rsi_value": 30,
    "timeframe": "1h",
    "strategy": "MFI_RSI",
    "secret": "your_webhook_secret"
  }'
```

## Monitoring

### Health Check

Check if the bot is running:

```bash
curl http://localhost:3000/health
```

### Webhook Status

Check webhook configuration:

```bash
curl http://localhost:3000/webhook/status
```

### Logs

Monitor bot activity:

```bash
# Real-time logs
tail -f logs/trading.log

# Error logs only
tail -f logs/trading.error.log

# Using PM2
pm2 logs bingx-trading-bot
```

## Security Best Practices

### 1. API Key Security

- **Never commit API keys** to version control
- Use **testnet** for development and testing
- Set **IP whitelist** on BingX API settings
- Use **minimal permissions** (only futures trading)
- **Rotate keys** regularly

### 2. Webhook Security

- Use a **strong webhook secret** (32+ characters)
- Configure **IP whitelist** for TradingView IPs
- Use **HTTPS** in production
- Monitor for **suspicious requests**

### 3. Server Security

- Keep server **updated**
- Use **firewall** to restrict access
- Enable **fail2ban** for SSH protection
- Use **SSL certificates** for HTTPS

## Troubleshooting

### Common Issues

#### 1. BingX API Connection Failed

```
Error: Failed to connect to BingX API
```

**Solutions:**
- Check API key and secret
- Verify IP whitelist on BingX
- Ensure testnet setting matches API key type
- Check network connectivity

#### 2. Webhook Authentication Failed

```
Error: Webhook validation failed - Invalid webhook secret
```

**Solutions:**
- Verify webhook secret matches in both .env and TradingView
- Check IP whitelist configuration
- Ensure JSON payload format is correct

#### 3. Invalid Signal Format

```
Error: Signal validation failed
```

**Solutions:**
- Check TradingView alert message format
- Verify all required fields are present
- Ensure MFI and RSI values are within 0-100 range

#### 4. Rate Limit Exceeded

```
Error: Too Many Requests - Rate limit exceeded
```

**Solutions:**
- Reduce alert frequency in TradingView
- Check for duplicate signals
- Verify rate limit configuration

### Debug Mode

Enable debug logging:

```bash
LOG_LEVEL=debug npm run dev
```

### Support

For additional support:

1. Check the logs for detailed error messages
2. Review the troubleshooting section
3. Ensure all configuration parameters are correct
4. Test with paper trading mode first

## Next Steps

1. **Start with Paper Trading**: Always test with `PAPER_TRADING=true`
2. **Monitor Performance**: Watch logs and trading results
3. **Adjust Parameters**: Fine-tune based on performance
4. **Scale Gradually**: Start with small position sizes
5. **Regular Monitoring**: Check bot status and performance regularly

## Important Disclaimers

⚠️ **Risk Warning**: 
- Cryptocurrency trading involves significant risk
- Never trade with money you cannot afford to lose
- Past performance does not guarantee future results
- Always start with paper trading mode

⚠️ **No Financial Advice**: 
- This bot is for educational and automation purposes only
- Not financial advice - trade at your own risk
- Consult with financial advisors before trading

⚠️ **Technical Risks**: 
- Software bugs may cause unexpected behavior
- Network issues may affect trade execution
- Always monitor bot performance closely