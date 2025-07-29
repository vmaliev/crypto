# TradingView Webhook Setup Guide

This guide will help you set up TradingView webhook alerts to send trading signals directly to your BingX trading bot.

## 📋 Prerequisites

- TradingView Pro account (required for webhook alerts)
- Your trading bot running and accessible via HTTP
- Basic understanding of Pine Script

## 🔧 Step 1: Configure Your Bot's Webhook Endpoint

Your bot is already configured to receive webhooks at:
```
http://your-server-ip:3000/webhook/tradingview
```

### Local Development
If running locally, you'll need to expose your local server:
```bash
# Using ngrok (recommended for testing)
npm install -g ngrok
ngrok http 3000
```

This will give you a public URL like: `https://abc123.ngrok.io`

### Production Deployment
For production, ensure your server has a public IP or domain name accessible from the internet.

## 📊 Step 2: Create TradingView Alert

### 2.1 Basic Alert Setup

1. **Open TradingView** and navigate to your chart
2. **Right-click** on the chart and select "Create Alert"
3. **Configure the alert:**
   - **Condition**: Choose your signal condition (e.g., "RSI crosses above 30")
   - **Actions**: Select "Webhook URL"
   - **URL**: Enter your webhook endpoint
   - **Message**: Use the JSON format below

### 2.2 Alert Message Format

Use this JSON format for your TradingView alert message:

```json
{
  "symbol": "{{ticker}}",
  "action": "{{strategy.order.action}}",
  "price": {{close}},
  "strategy": "MFI_RSI_Strategy",
  "timeframe": "{{timeframe}}",
  "strength": "{{strategy.order.action == 'buy' ? 'STRONG' : 'WEAK'}}",
  "confidence": 0.8,
  "mfi": {{ta.mfi(close, 14)}},
  "rsi": {{ta.rsi(close, 14)}},
  "volume": {{volume}},
  "timestamp": "{{time}}"
}
```

### 2.3 Advanced Alert with Multiple Conditions

For more sophisticated signals, you can create multiple alerts or use conditional logic:

```json
{
  "symbol": "{{ticker}}",
  "action": "{{strategy.order.action}}",
  "price": {{close}},
  "strategy": "Multi_Strategy",
  "timeframe": "{{timeframe}}",
  "strength": "{{strategy.order.action == 'buy' and volume > volume[1] * 1.5 ? 'STRONG' : 'MEDIUM'}}",
  "confidence": {{strategy.order.action == 'buy' ? 0.85 : 0.75}},
  "mfi": {{ta.mfi(close, 14)}},
  "rsi": {{ta.rsi(close, 14)}},
  "macd": {{ta.macd(close, 12, 26, 9)}},
  "volume": {{volume}},
  "volume_ratio": {{volume / volume[1]}},
  "timestamp": "{{time}}"
}
```

## 🎯 Step 3: Pine Script Strategy Example

Here's a complete Pine Script strategy that generates webhook alerts:

```pinescript
//@version=5
strategy("MFI RSI Trading Strategy", overlay=true, margin_long=100, margin_short=100)

// Input parameters
rsi_length = input(14, "RSI Length")
mfi_length = input(14, "MFI Length")
rsi_oversold = input(30, "RSI Oversold Level")
rsi_overbought = input(70, "RSI Overbought Level")
mfi_oversold = input(20, "MFI Oversold Level")
mfi_overbought = input(80, "MFI Overbought Level")

// Calculate indicators
rsi = ta.rsi(close, rsi_length)
mfi = ta.mfi(close, mfi_length)

// Define entry conditions
long_condition = rsi < rsi_oversold and mfi < mfi_oversold and volume > volume[1]
short_condition = rsi > rsi_overbought and mfi > mfi_overbought and volume > volume[1]

// Calculate signal strength
long_strength = long_condition ? (rsi_oversold - rsi) / rsi_oversold * 100 : 0
short_strength = short_condition ? (rsi - rsi_overbought) / (100 - rsi_overbought) * 100 : 0

// Strategy logic
if long_condition
    strategy.entry("Long", strategy.long)
    alert("{\"symbol\": \"" + syminfo.ticker + "\", \"action\": \"BUY\", \"price\": " + str.tostring(close) + ", \"strategy\": \"MFI_RSI\", \"timeframe\": \"" + timeframe.period + "\", \"strength\": \"STRONG\", \"confidence\": 0.8, \"mfi\": " + str.tostring(mfi) + ", \"rsi\": " + str.tostring(rsi) + ", \"volume\": " + str.tostring(volume) + ", \"timestamp\": \"" + str.tostring(time) + "\"}", alert.freq_once_per_bar)

if short_condition
    strategy.entry("Short", strategy.short)
    alert("{\"symbol\": \"" + syminfo.ticker + "\", \"action\": \"SELL\", \"price\": " + str.tostring(close) + ", \"strategy\": \"MFI_RSI\", \"timeframe\": \"" + timeframe.period + "\", \"strength\": \"STRONG\", \"confidence\": 0.8, \"mfi\": " + str.tostring(mfi) + ", \"rsi\": " + str.tostring(rsi) + ", \"volume\": " + str.tostring(volume) + ", \"timestamp\": \"" + str.tostring(time) + "\"}", alert.freq_once_per_bar)

// Plot indicators
plot(rsi, "RSI", color=color.blue)
plot(mfi, "MFI", color=color.red)
hline(rsi_oversold, "RSI Oversold", color=color.green)
hline(rsi_overbought, "RSI Overbought", color=color.red)
hline(mfi_oversold, "MFI Oversold", color=color.green)
hline(mfi_overbought, "MFI Overbought", color=color.red)
```

## 🔄 Step 4: Alternative Alert Methods

### 4.1 Simple Price-Based Alerts

For basic price breakouts:

```json
{
  "symbol": "{{ticker}}",
  "action": "{{close > high[1] ? 'BUY' : 'SELL'}}",
  "price": {{close}},
  "strategy": "Breakout",
  "timeframe": "{{timeframe}}",
  "strength": "MEDIUM",
  "confidence": 0.6,
  "volume": {{volume}},
  "timestamp": "{{time}}"
}
```

### 4.2 Volume-Based Alerts

For volume spike detection:

```json
{
  "symbol": "{{ticker}}",
  "action": "{{volume > volume[1] * 2 ? 'BUY' : 'HOLD'}}",
  "price": {{close}},
  "strategy": "Volume_Spike",
  "timeframe": "{{timeframe}}",
  "strength": "{{volume > volume[1] * 3 ? 'STRONG' : 'MEDIUM'}}",
  "confidence": 0.7,
  "volume": {{volume}},
  "volume_ratio": {{volume / volume[1]}},
  "timestamp": "{{time}}"
}
```

## 🧪 Step 5: Testing Your Webhook

### 5.1 Manual Test

You can test your webhook manually using curl:

```bash
curl -X POST http://localhost:3000/webhook/tradingview \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "BTCUSDT",
    "action": "BUY",
    "price": 50000,
    "strategy": "MFI_RSI",
    "timeframe": "1h",
    "strength": "STRONG",
    "confidence": 0.8,
    "mfi": 25,
    "rsi": 30,
    "volume": 1000000,
    "timestamp": "2024-01-01T12:00:00Z"
  }'
```

### 5.2 Check Bot Logs

Monitor your bot's logs to ensure signals are being received:

```bash
tail -f logs/trading-bot.log
```

## ⚙️ Step 6: Advanced Configuration

### 6.1 Multiple Timeframes

Create alerts for different timeframes:

- **1m**: Scalping signals
- **5m**: Short-term trades
- **1h**: Swing trades
- **4h**: Position trades
- **1d**: Long-term positions

### 6.2 Risk Management Alerts

Add alerts for risk management:

```json
{
  "symbol": "{{ticker}}",
  "action": "CLOSE",
  "price": {{close}},
  "strategy": "Risk_Management",
  "reason": "Stop_Loss",
  "timeframe": "{{timeframe}}",
  "strength": "CRITICAL",
  "confidence": 1.0,
  "timestamp": "{{time}}"
}
```

### 6.3 Market Condition Alerts

Monitor market conditions:

```json
{
  "symbol": "{{ticker}}",
  "action": "HOLD",
  "price": {{close}},
  "strategy": "Market_Condition",
  "condition": "{{volatility > 50 ? 'HIGH_VOLATILITY' : 'NORMAL'}}",
  "volatility": {{ta.atr(14) / close * 100}},
  "timestamp": "{{time}}"
}
```

## 🔒 Step 7: Security Considerations

### 7.1 Webhook Authentication

Your bot includes webhook validation. Ensure your TradingView alerts include proper authentication if configured.

### 7.2 Rate Limiting

TradingView has rate limits on alerts. Avoid creating too many alerts to prevent throttling.

### 7.3 Signal Validation

Your bot validates incoming signals. Ensure your alert messages match the expected format.

## 📊 Step 8: Monitoring and Optimization

### 8.1 Track Signal Performance

Monitor your bot's performance dashboard to see how TradingView signals perform.

### 8.2 Optimize Alert Conditions

Based on performance data, adjust your Pine Script conditions for better results.

### 8.3 A/B Testing

Create multiple alerts with different conditions and compare their performance.

## 🚨 Troubleshooting

### Common Issues:

1. **Webhook not received**: Check your server's firewall and network configuration
2. **Invalid JSON**: Ensure your alert message is valid JSON
3. **Authentication failed**: Verify webhook security settings
4. **Rate limiting**: Reduce alert frequency if hitting limits

### Debug Commands:

```bash
# Check if webhook server is running
curl http://localhost:3000/health

# Test webhook endpoint
curl -X POST http://localhost:3000/webhook/tradingview -H "Content-Type: application/json" -d '{"test": true}'

# View webhook logs
tail -f logs/webhook.log
```

## 📈 Next Steps

1. **Start with simple alerts** and gradually add complexity
2. **Monitor performance** and adjust strategies
3. **Scale up** by adding more symbols and timeframes
4. **Optimize** based on trading results

Your trading bot is now ready to receive and process TradingView webhook alerts! 🎯 