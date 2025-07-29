# 🆓 Quick Start: Free TradingView Setup (No Pro Required)

Get your TradingView alerts connected to your trading bot in 10 minutes - **completely free!**

## ⚡ Quick Setup (3 Methods)

### Method 1: Email Bridge (Recommended) ⭐

#### Step 1: Set Up Email Alerts
1. **Open TradingView** and go to your chart
2. **Right-click** → "Create Alert"
3. **Set condition**: "Price crosses above $50,000" (example)
4. **Action**: "Send email"
5. **Message**: "BTC BUY SIGNAL at {{close}}"

#### Step 2: Run Email Bridge
```bash
# Install Python dependencies
pip install requests

# Edit the script with your email details
nano scripts/email-to-webhook.py

# Run the bridge
python scripts/email-to-webhook.py
```

#### Step 3: Test It
1. Create a test alert in TradingView
2. Check your email
3. Watch the bridge convert it to a webhook call

---

### Method 2: Free Pine Script Indicator

#### Step 1: Use Free Indicator
1. **Copy** the content from `scripts/free-tradingview-indicator.pine`
2. **Paste** into TradingView Pine Editor
3. **Click** "Add to Chart"
4. **Watch** for BUY/SELL signals

#### Step 2: Create Manual Alerts
1. **Right-click** on chart when you see a signal
2. **Create Alert** with condition: "Price crosses above current level"
3. **Action**: "Send email"
4. **Message**: "BUY BTCUSDT at {{close}} - RSI: {{plot('RSI')}}"

#### Step 3: Use Email Bridge
Same as Method 1, Step 2

---

### Method 3: IFTTT (Easiest)

#### Step 1: Create IFTTT Account
1. Go to [ifttt.com](https://ifttt.com)
2. **Sign up** (free)
3. **Create** a new applet

#### Step 2: Set Up TradingView Trigger
1. **Choose trigger**: "Email" → "New email from TradingView"
2. **Set up action**: "Webhooks" → "Make a web request"
3. **URL**: `http://localhost:3000/webhook/tradingview`
4. **Method**: POST
5. **Content Type**: application/json
6. **Body**: 
```json
{
  "symbol": "BTCUSDT",
  "action": "BUY",
  "price": {{Price}},
  "strategy": "IFTTT_Alert",
  "timeframe": "1h",
  "strength": "MEDIUM",
  "confidence": 0.7,
  "timestamp": "{{CreatedAt}}"
}
```

---

## 🎯 Recommended: Method 1 (Email Bridge)

### Complete Setup:

#### 1. Configure Email Bridge
Edit `scripts/email-to-webhook.py`:
```python
config = {
    'email': {
        'provider': 'gmail',
        'email': 'your-email@gmail.com',
        'password': 'your-app-password',  # Gmail app password
    },
    'webhook': {
        'url': 'http://localhost:3000/webhook/tradingview'
    }
}
```

#### 2. Get Gmail App Password
1. Go to [Google Account Settings](https://myaccount.google.com/)
2. **Security** → **2-Step Verification** (enable if not)
3. **App passwords** → **Generate** new password
4. **Use this password** in the script (not your regular password)

#### 3. Start Your Bot
```bash
npm run dev
```

#### 4. Run Email Bridge
```bash
python scripts/email-to-webhook.py
```

#### 5. Create TradingView Alerts
- **BUY Alert**: "Price crosses above $50,000" → "BTC BUY SIGNAL"
- **SELL Alert**: "Price crosses below $45,000" → "BTC SELL SIGNAL"

---

## 📱 Alternative: Mobile App

### TradingView Mobile + Tasker (Android)
1. **Install Tasker** (paid app)
2. **Set up notification listener** for TradingView
3. **Create HTTP request** to your bot
4. **Automate** signal forwarding

### TradingView Mobile + Shortcuts (iOS)
1. **Use iOS Shortcuts** app
2. **Create automation** for TradingView notifications
3. **Send HTTP request** to your bot

---

## 🧪 Testing Your Setup

### Test Email Bridge
```bash
# Start your bot
npm run dev

# In another terminal, run email bridge
python scripts/email-to-webhook.py

# Create a test alert in TradingView
# Watch the logs for signal processing
```

### Test Webhook Directly
```bash
# Test with curl
curl -X POST http://localhost:3000/webhook/tradingview \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "BTCUSDT",
    "action": "BUY",
    "price": 50000,
    "strategy": "Test",
    "timeframe": "1h",
    "strength": "STRONG",
    "confidence": 0.8,
    "timestamp": "2024-01-01T12:00:00Z"
  }'
```

---

## 📊 Monitor Your Setup

### Check Bot Logs
```bash
tail -f logs/trading-bot.log
```

### Check Email Bridge Logs
The email bridge will show:
- ✅ Signal sent to bot: BUY BTCUSDT
- 📧 Processed email: BTC BUY SIGNAL
- ❌ Failed to send signal: HTTP 400

---

## 🔧 Troubleshooting

### Email Bridge Issues
- **"Failed to connect to email"**: Check your email/password
- **"No emails found"**: Make sure TradingView is sending emails
- **"Failed to send signal"**: Check if your bot is running

### Gmail Issues
- **Use app password** (not regular password)
- **Enable 2FA** first
- **Allow less secure apps** (if needed)

### Bot Issues
- **Check if bot is running**: `curl http://localhost:3000/health`
- **Check webhook endpoint**: `curl http://localhost:3000/webhook/tradingview`
- **Check logs**: `tail -f logs/trading-bot.log`

---

## 🎉 Success!

You now have a **completely free** TradingView integration! 

### What You Can Do:
- ✅ Receive TradingView alerts via email
- ✅ Automatically convert to webhook calls
- ✅ Trigger trades in your bot
- ✅ Monitor everything in real-time

### Next Steps:
1. **Test your setup** with a few alerts
2. **Monitor performance** and adjust
3. **Scale up** with more symbols
4. **Optimize** your alert conditions

### Files Created:
- `docs/FREE_TRADINGVIEW_SETUP.md` - Full guide
- `scripts/email-to-webhook.py` - Email bridge
- `scripts/free-tradingview-indicator.pine` - Free indicator
- `QUICK_START_FREE_TRADINGVIEW.md` - This guide

**Your trading bot is now connected to TradingView - completely free! 🚀** 