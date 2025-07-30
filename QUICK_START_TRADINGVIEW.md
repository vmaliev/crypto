# 🚀 Quick Start: TradingView Webhook Setup

Get your TradingView alerts connected to your trading bot in 5 minutes!

## ⚡ Quick Setup Steps

### 1. Start Your Bot
```bash
npm run dev
```

### 2. Test Your Webhook
```bash
./scripts/test-webhook.sh
```

### 3. Get Public URL (if running locally)
```bash
# Install ngrok
npm install -g ngrok

# Expose your local server
ngrok http 3000
```

### 4. Copy Pine Script
Copy the entire content from `scripts/tradingview-strategy.pine` and paste it into TradingView Pine Editor.

### 5. Configure TradingView
1. Open TradingView
2. Go to Pine Editor
3. Paste the script
4. Click "Add to Chart"
5. In strategy settings, enter your webhook URL:
   - **Local**: `http://localhost:3000/webhook/tradingview`
   - **Public**: `https://your-ngrok-url.ngrok.io/webhook/tradingview`

### 6. Create Alerts
1. Right-click on chart → "Create Alert"
2. Select "Webhook URL" action
3. Enter your webhook URL
4. Use this message format:

```json
{
  "symbol": "{{ticker}}",
  "action": "{{strategy.order.action}}",
  "price": {{close}},
  "strategy": "MFI_RSI",
  "timeframe": "{{timeframe}}",
  "signal_strength": "STRONG",
  "mfi_value": {{ta.mfi(close, 14)}},
  "rsi_value": {{ta.rsi(close, 14)}},
  "timestamp": "{{time}}",
  "secret": "your-webhook-secret"
}
```

## 🎯 That's It!

Your TradingView alerts will now automatically trigger trades in your bot!

## 📊 Monitor Your Bot

Check logs to see incoming signals:
```bash
tail -f logs/trading-bot.log
```

## 🔧 Troubleshooting

- **Webhook not working?** Run `./scripts/test-webhook.sh`
- **Bot not receiving signals?** Check your webhook URL
- **Need help?** See the full guide in `docs/TRADINGVIEW_SETUP.md`

## 🎉 Success!

You now have a fully automated trading system connected to TradingView! 🚀 