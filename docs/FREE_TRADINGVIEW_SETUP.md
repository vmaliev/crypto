# 🆓 Free TradingView Webhook Setup (No Pro Required)

This guide shows you how to connect TradingView to your trading bot without needing a TradingView Pro account.

## 🎯 Alternative Methods

### Method 1: Manual Alert Setup (Recommended)
### Method 2: Third-Party Alert Services
### Method 3: Browser Extension
### Method 4: Mobile App Integration

---

## 📱 Method 1: Manual Alert Setup

### Step 1: Create Basic Alerts
1. **Open TradingView** and navigate to your chart
2. **Right-click** on the chart and select "Create Alert"
3. **Configure the alert:**
   - **Condition**: Choose a simple condition (e.g., "Price crosses above $50,000")
   - **Actions**: Select "Show popup" or "Send email"
   - **Message**: Use a simple message like "BTC BUY SIGNAL"

### Step 2: Use Alert Manager
1. Go to **TradingView Alerts** page
2. Click **"Create Alert"**
3. Set up multiple alerts for different conditions
4. Use **email notifications** to forward to your bot

### Step 3: Email-to-Webhook Bridge
Create a simple email parser that converts TradingView email alerts to webhook calls:

```python
# email_to_webhook.py
import imaplib
import email
import requests
import re
import time

def check_tradingview_emails():
    # Connect to your email
    mail = imaplib.IMAP4_SSL("imap.gmail.com")
    mail.login("your-email@gmail.com", "your-app-password")
    mail.select("INBOX")
    
    # Search for TradingView emails
    _, messages = mail.search(None, 'FROM "noreply@tradingview.com"')
    
    for num in messages[0].split():
        _, msg_data = mail.fetch(num, '(RFC822)')
        email_body = msg_data[0][1]
        email_message = email.message_from_bytes(email_body)
        
        # Parse email content
        subject = email_message["subject"]
        body = get_email_body(email_message)
        
        # Convert to webhook format
        webhook_data = parse_alert_email(subject, body)
        
        if webhook_data:
            # Send to your bot
            requests.post("http://localhost:3000/webhook/tradingview", json=webhook_data)
    
    mail.close()
    mail.logout()

def parse_alert_email(subject, body):
    # Parse TradingView alert email
    if "BUY" in subject.upper():
        return {
            "symbol": extract_symbol(subject),
            "action": "BUY",
            "price": extract_price(body),
            "strategy": "Manual_Alert",
            "timeframe": "1h",
            "strength": "MEDIUM",
            "confidence": 0.7,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ")
        }
    return None
```

---

## 🔧 Method 2: Third-Party Alert Services

### Option A: IFTTT (If This Then That)
1. **Create IFTTT account** (free)
2. **Set up TradingView trigger**:
   - Use TradingView's RSS feed
   - Monitor specific conditions
3. **Create webhook action**:
   - Send HTTP request to your bot
   - Format data as JSON

### Option B: Zapier
1. **Create Zapier account** (free tier available)
2. **Connect TradingView** via RSS or email
3. **Create webhook zap** to your bot

### Option C: Webhook.site
1. **Use webhook.site** as intermediary
2. **Set up email forwarding** to webhook.site
3. **Forward to your bot** with proper formatting

---

## 🌐 Method 3: Browser Extension

### Create a Chrome Extension
```javascript
// manifest.json
{
  "manifest_version": 3,
  "name": "TradingView to Bot",
  "version": "1.0",
  "permissions": ["activeTab", "storage"],
  "content_scripts": [{
    "matches": ["*://*.tradingview.com/*"],
    "js": ["content.js"]
  }]
}

// content.js
function sendToBot(signal) {
  fetch('http://localhost:3000/webhook/tradingview', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(signal)
  });
}

// Listen for TradingView alerts
document.addEventListener('DOMContentLoaded', function() {
  // Monitor for alert popups
  const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      if (mutation.type === 'childList') {
        // Check for alert elements
        const alerts = document.querySelectorAll('.alert-popup');
        alerts.forEach(alert => {
          const signal = parseAlert(alert);
          if (signal) sendToBot(signal);
        });
      }
    });
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
});
```

---

## 📱 Method 4: Mobile App Integration

### Use TradingView Mobile App
1. **Enable push notifications** in TradingView mobile app
2. **Create simple alerts** on mobile
3. **Use notification forwarding** service

### Android: Tasker
1. **Install Tasker** (paid app, but powerful)
2. **Set up notification listener** for TradingView
3. **Create HTTP request** to your bot

### iOS: Shortcuts
1. **Use iOS Shortcuts** app
2. **Create automation** for TradingView notifications
3. **Send HTTP request** to your bot

---

## 🛠️ Method 5: Custom Pine Script with Manual Triggers

### Create a Simple Indicator
```pinescript
//@version=5
indicator("Free Alert Indicator", overlay=true)

// Simple conditions
rsi = ta.rsi(close, 14)
mfi = ta.mfi(close, 14)

// Plot signals
plotshape(rsi < 30 and mfi < 20, title="BUY Signal", location=location.belowbar, color=color.green, style=shape.triangleup, size=size.small)
plotshape(rsi > 70 and mfi > 80, title="SELL Signal", location=location.abovebar, color=color.red, style=shape.triangledown, size=size.small)

// Add text labels
if rsi < 30 and mfi < 20
    label.new(bar_index, low, "BUY\nRSI: " + str.tostring(rsi, "#.##") + "\nMFI: " + str.tostring(mfi, "#.##"), color=color.green, textcolor=color.white, style=label.style_label_up)

if rsi > 70 and mfi > 80
    label.new(bar_index, high, "SELL\nRSI: " + str.tostring(rsi, "#.##") + "\nMFI: " + str.tostring(mfi, "#.##"), color=color.red, textcolor=color.white, style=label.style_label_down)
```

### Manual Alert Creation
1. **Apply the indicator** to your chart
2. **Create alerts** when you see BUY/SELL signals
3. **Use simple conditions** like "Price crosses above/below level"

---

## 🔄 Method 6: Web Scraping (Advanced)

### Python Script for Monitoring
```python
import requests
from bs4 import BeautifulSoup
import time
import json

def monitor_tradingview_signals():
    # Monitor TradingView public signals
    url = "https://www.tradingview.com/symbols/BTCUSD/signals/"
    
    while True:
        try:
            response = requests.get(url)
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Parse signals (adjust selectors based on actual page structure)
            signals = soup.find_all('div', class_='signal-item')
            
            for signal in signals:
                # Extract signal data
                signal_data = parse_signal_element(signal)
                
                if signal_data:
                    # Send to your bot
                    send_to_bot(signal_data)
            
            time.sleep(60)  # Check every minute
            
        except Exception as e:
            print(f"Error: {e}")
            time.sleep(300)  # Wait 5 minutes on error

def send_to_bot(signal_data):
    webhook_url = "http://localhost:3000/webhook/tradingview"
    
    payload = {
        "symbol": signal_data.get("symbol", "BTCUSDT"),
        "action": signal_data.get("action", "BUY"),
        "price": signal_data.get("price", 0),
        "strategy": "Scraped_Signal",
        "timeframe": "1h",
        "strength": "MEDIUM",
        "confidence": 0.6,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ")
    }
    
    requests.post(webhook_url, json=payload)
```

---

## 🎯 Recommended Setup for Free Users

### Quick Start (No Pro Required):

1. **Use Method 1 (Manual Alerts)**:
   - Create simple price-based alerts
   - Use email notifications
   - Set up email-to-webhook bridge

2. **Combine with Method 5 (Custom Indicator)**:
   - Use the free Pine Script indicator
   - Create manual alerts based on visual signals
   - Forward alerts to your bot

3. **Alternative: Use IFTTT**:
   - Free and reliable
   - Easy to set up
   - Supports webhook actions

---

## 📋 Setup Checklist

### For Manual Alerts:
- [ ] Create TradingView account (free)
- [ ] Set up email notifications
- [ ] Create price-based alerts
- [ ] Set up email parser script
- [ ] Test webhook connection

### For IFTTT:
- [ ] Create IFTTT account
- [ ] Set up TradingView trigger
- [ ] Create webhook action
- [ ] Test integration

### For Browser Extension:
- [ ] Create Chrome extension
- [ ] Install on browser
- [ ] Test signal detection
- [ ] Verify webhook sending

---

## 🚨 Important Notes

### Limitations of Free Methods:
- **Manual alerts** require more setup
- **Email parsing** may have delays
- **Browser extensions** need maintenance
- **Third-party services** may have rate limits

### Best Practices:
- **Start simple** with manual alerts
- **Test thoroughly** before live trading
- **Monitor reliability** of chosen method
- **Have backup methods** ready

### Security Considerations:
- **Use HTTPS** for webhook URLs
- **Validate incoming data** in your bot
- **Rate limit** incoming requests
- **Monitor for spam** or invalid signals

---

## 🎉 Success!

You can now connect TradingView to your trading bot without a Pro account! Choose the method that works best for your setup and start receiving automated trading signals.

**Next Steps:**
1. Choose your preferred method
2. Follow the setup instructions
3. Test the integration
4. Start trading with automated signals!

Your trading bot is ready to receive signals from TradingView, even without a Pro account! 🚀 