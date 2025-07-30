#!/usr/bin/env python3
"""
TradingView Email to Webhook Bridge
Converts TradingView email alerts to webhook calls for your trading bot
"""

import imaplib
import email
import requests
import re
import time
import json
import os
from datetime import datetime
from email.header import decode_header

class TradingViewEmailBridge:
    def __init__(self, email_config, webhook_url, webhook_secret):
        self.email_config = email_config
        self.webhook_url = webhook_url
        self.webhook_secret = webhook_secret
        self.processed_emails = set()
        
    def connect_email(self):
        """Connect to email server"""
        try:
            if self.email_config['provider'] == 'gmail':
                mail = imaplib.IMAP4_SSL("imap.gmail.com", 993)
            elif self.email_config['provider'] == 'outlook':
                mail = imaplib.IMAP4_SSL("outlook.office365.com", 993)
            else:
                mail = imaplib.IMAP4_SSL(self.email_config['server'], self.email_config['port'])
            
            mail.login(self.email_config['email'], self.email_config['password'])
            return mail
        except Exception as e:
            print(f"Failed to connect to email: {e}")
            return None
    
    def get_email_body(self, email_message):
        """Extract email body content"""
        body = ""
        if email_message.is_multipart():
            for part in email_message.walk():
                if part.get_content_type() == "text/plain":
                    body = part.get_payload(decode=True).decode()
                    break
        else:
            body = email_message.get_payload(decode=True).decode()
        return body
    
    def extract_symbol(self, subject, body):
        """Extract trading symbol from email"""
        # Common patterns for symbols
        patterns = [
            r'(\w+)/(\w+)',  # BTC/USD
            r'(\w+)(USDT|USD|BTC|ETH)',  # BTCUSDT, BTCUSD
            r'(\w+)-(\w+)',  # BTC-USD
        ]
        
        text = f"{subject} {body}"
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                if len(match.groups()) == 2:
                    return f"{match.group(1)}{match.group(2)}"
                else:
                    return match.group(1)
        
        # Default symbols
        if 'BTC' in text.upper():
            return 'BTCUSDT'
        elif 'ETH' in text.upper():
            return 'ETHUSDT'
        else:
            return 'BTCUSDT'  # Default
    
    def extract_price(self, body):
        """Extract price from email body"""
        # Look for price patterns
        price_patterns = [
            r'\$(\d+(?:,\d{3})*(?:\.\d+)?)',  # $50,000.00
            r'(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:USD|USDT)',  # 50000 USD
            r'price[:\s]*(\d+(?:,\d{3})*(?:\.\d+)?)',  # price: 50000
            r'at\s+(\d+(?:,\d{3})*(?:\.\d+)?)',  # at 50000
        ]
        
        for pattern in price_patterns:
            match = re.search(pattern, body, re.IGNORECASE)
            if match:
                price_str = match.group(1).replace(',', '')
                try:
                    return float(price_str)
                except ValueError:
                    continue
        
        return 0.0
    
    def extract_rsi(self, body):
        """Extract RSI value from email body"""
        rsi_patterns = [
            r'RSI[:\s]*(\d+(?:\.\d+)?)',  # RSI: 30.5
            r'RSI\s+(\d+(?:\.\d+)?)',  # RSI 30.5
            r'(\d+(?:\.\d+)?)\s*RSI',  # 30.5 RSI
        ]
        
        for pattern in rsi_patterns:
            match = re.search(pattern, body, re.IGNORECASE)
            if match:
                try:
                    return float(match.group(1))
                except ValueError:
                    continue
        
        # Default RSI values based on action
        if 'BUY' in body.upper():
            return 30.0  # Oversold for buy signals
        elif 'SELL' in body.upper():
            return 70.0  # Overbought for sell signals
        else:
            return 50.0  # Neutral
    
    def extract_mfi(self, body):
        """Extract MFI value from email body"""
        mfi_patterns = [
            r'MFI[:\s]*(\d+(?:\.\d+)?)',  # MFI: 20.5
            r'MFI\s+(\d+(?:\.\d+)?)',  # MFI 20.5
            r'(\d+(?:\.\d+)?)\s*MFI',  # 20.5 MFI
        ]
        
        for pattern in mfi_patterns:
            match = re.search(pattern, body, re.IGNORECASE)
            if match:
                try:
                    return float(match.group(1))
                except ValueError:
                    continue
        
        # Default MFI values based on action
        if 'BUY' in body.upper():
            return 20.0  # Oversold for buy signals
        elif 'SELL' in body.upper():
            return 80.0  # Overbought for sell signals
        else:
            return 50.0  # Neutral
    
    def extract_action(self, subject, body):
        """Extract trading action from email"""
        text = f"{subject} {body}".upper()
        
        if any(word in text for word in ['BUY', 'LONG', 'BUYING']):
            return 'BUY'
        elif any(word in text for word in ['SELL', 'SHORT', 'SELLING']):
            return 'SELL'
        elif any(word in text for word in ['CLOSE', 'EXIT', 'STOP']):
            return 'CLOSE'
        else:
            return 'BUY'  # Default
    
    def parse_alert_email(self, subject, body):
        """Parse TradingView alert email and convert to webhook format"""
        try:
            symbol = self.extract_symbol(subject, body)
            action = self.extract_action(subject, body)
            price = self.extract_price(body)
            rsi_value = self.extract_rsi(body)
            mfi_value = self.extract_mfi(body)
            
            # Determine signal strength based on email content
            strength = 'MEDIUM'  # Default
            if 'STRONG' in body.upper() or 'CONFIRMED' in body.upper():
                strength = 'STRONG'
            elif 'WEAK' in body.upper() or 'POSSIBLE' in body.upper():
                strength = 'WEAK'
            
            # Validate and adjust RSI/MFI values
            if rsi_value < 0 or rsi_value > 100:
                rsi_value = 50.0
            if mfi_value < 0 or mfi_value > 100:
                mfi_value = 50.0
            
            # Ensure price is valid
            if price <= 0:
                price = 50000.0  # Default BTC price
            
            webhook_data = {
                "symbol": symbol,
                "action": action,
                "price": price,
                "strategy": "Email_Alert",
                "timeframe": "1h",
                "signal_strength": strength,
                "mfi_value": mfi_value,
                "rsi_value": rsi_value,
                "timestamp": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
                "secret": self.webhook_secret
            }
            
            return webhook_data
            
        except Exception as e:
            print(f"Error parsing email: {e}")
            return None
    
    def send_to_bot(self, webhook_data):
        """Send webhook data to trading bot"""
        try:
            response = requests.post(
                self.webhook_url,
                json=webhook_data,
                headers={'Content-Type': 'application/json'},
                timeout=10
            )
            
            if response.status_code == 200:
                print(f"✅ Signal sent to bot: {webhook_data['action']} {webhook_data['symbol']} at ${webhook_data['price']}")
                return True
            else:
                print(f"❌ Failed to send signal: HTTP {response.status_code}")
                print(f"Response: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Error sending to bot: {e}")
            return False
    
    def check_emails(self):
        """Check for new TradingView emails and process them"""
        mail = self.connect_email()
        if not mail:
            return
        
        try:
            mail.select("INBOX")
            
            # Search for TradingView emails from the last hour
            search_criteria = 'FROM "noreply@tradingview.com" SINCE "1 hour ago"'
            _, messages = mail.search(None, search_criteria)
            
            for num in messages[0].split():
                email_id = num.decode()
                
                # Skip if already processed
                if email_id in self.processed_emails:
                    continue
                
                _, msg_data = mail.fetch(num, '(RFC822)')
                email_body = msg_data[0][1]
                email_message = email.message_from_bytes(email_body)
                
                # Extract email content
                subject = decode_header(email_message["subject"])[0][0]
                if isinstance(subject, bytes):
                    subject = subject.decode()
                
                body = self.get_email_body(email_message)
                
                # Parse and convert to webhook format
                webhook_data = self.parse_alert_email(subject, body)
                
                if webhook_data:
                    # Send to trading bot
                    if self.send_to_bot(webhook_data):
                        self.processed_emails.add(email_id)
                        print(f"📧 Processed email: {subject}")
                
                # Keep processed emails list manageable
                if len(self.processed_emails) > 1000:
                    self.processed_emails.clear()
            
            mail.close()
            mail.logout()
            
        except Exception as e:
            print(f"Error checking emails: {e}")
    
    def run(self, check_interval=60):
        """Run the email bridge continuously"""
        print(f"🚀 Starting TradingView Email Bridge...")
        print(f"📧 Monitoring: {self.email_config['email']}")
        print(f"🤖 Webhook URL: {self.webhook_url}")
        print(f"🔑 Webhook Secret: {self.webhook_secret[:8]}...")
        print(f"⏰ Check interval: {check_interval} seconds")
        print("=" * 50)
        
        while True:
            try:
                self.check_emails()
                time.sleep(check_interval)
            except KeyboardInterrupt:
                print("\n🛑 Stopping Email Bridge...")
                break
            except Exception as e:
                print(f"❌ Error in main loop: {e}")
                time.sleep(check_interval * 2)  # Wait longer on error

def main():
    """Main function with configuration"""
    
    # Configuration - Update these values
    config = {
        'email': {
            'provider': 'gmail',  # 'gmail', 'outlook', or 'custom'
            'email': 'your-email@gmail.com',
            'password': 'your-app-password',  # Use app password for Gmail
            'server': 'imap.gmail.com',  # Only needed for custom providers
            'port': 993  # Only needed for custom providers
        },
        'webhook': {
            'url': 'http://localhost:3000/webhook/tradingview',
            'secret': 'your-webhook-secret'  # Replace with your actual secret
        },
        'settings': {
            'check_interval': 60  # Check emails every 60 seconds
        }
    }
    
    # Create and run the bridge
    bridge = TradingViewEmailBridge(
        config['email'], 
        config['webhook']['url'],
        config['webhook']['secret']
    )
    bridge.run(config['settings']['check_interval'])

if __name__ == "__main__":
    main() 