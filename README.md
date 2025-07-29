# BingX Futures Trading Bot

A professional-grade automated trading bot for BingX futures that responds to TradingView MFI+RSI signals with advanced risk management and security features.

## 🚀 Features

### Core Trading Features
- **Automated Signal Processing**: Responds to TradingView MFI+RSI webhook signals
- **Percentage-Based Position Sizing**: Risk 2% of account balance per trade (configurable)
- **Dynamic Risk Management**: ATR-based stop-loss and take-profit levels
- **Multiple Take-Profit Levels**: Scale out positions for optimal profit taking
- **Trailing Stops**: Lock in profits as trades move favorably
- **Paper Trading Mode**: Test strategies without real money

### Security & Safety
- **IP Whitelisting**: Restrict webhook access to authorized IPs
- **HMAC Authentication**: Secure webhook verification
- **Rate Limiting**: Prevent abuse and API overload
- **Daily Loss Limits**: Automatic shutdown at maximum loss threshold
- **Position Limits**: Maximum concurrent positions protection
- **Emergency Stop**: Manual override capabilities

### Monitoring & Analytics
- **Comprehensive Logging**: Detailed trade and system logs
- **Real-time Notifications**: Discord, Telegram, and email alerts
- **Performance Tracking**: Win rate, profit/loss, drawdown analysis
- **Health Monitoring**: System status and connectivity checks

## 📊 Trading Strategy

The bot uses the **MFI+RSI** (Money Flow Index + Relative Strength Index) strategy:

- **MFI**: Measures buying and selling pressure using price and volume
- **RSI**: Identifies overbought and oversold conditions
- **Signal Strength**: STRONG, MEDIUM, WEAK based on indicator confluence
- **Entry Conditions**: Oversold conditions (MFI < 30, RSI < 30) for BUY signals
- **Exit Conditions**: Overbought conditions (MFI > 70, RSI > 70) for SELL signals

## 🛠️ Quick Start

### 1. Installation

```bash
git clone <repository-url>
cd crypto
npm install
```

### 2. Configuration

```bash
cp .env.example .env
# Edit .env with your BingX API keys and settings
```

### 3. Start Trading (Paper Mode)

```bash
npm run dev
```

### 4. TradingView Setup

Add the MFI+RSI indicator and configure webhook alerts:

**Webhook URL**: `https://your-server.com/webhook/tradingview`

**Alert Message**:
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
  "secret": "your_webhook_secret"
}
```

## 📋 Configuration

### Essential Settings

| Setting | Description | Default | Recommended |
|---------|-------------|---------|-------------|
| `POSITION_SIZE_PERCENT` | Risk per trade | 2% | 1-3% |
| `MAX_DAILY_LOSS` | Daily loss limit | 5% | 3-10% |
| `STOP_LOSS_PERCENT` | Stop-loss distance | 2% | 1-3% |
| `TAKE_PROFIT_PERCENT` | Take-profit target | 4% | 2-6% |
| `LEVERAGE_MULTIPLIER` | Trading leverage | 10x | 5-20x |
| `PAPER_TRADING` | Test mode | true | true (initially) |

### Risk Management

- **Position Sizing**: 2% of account balance per trade
- **Stop-Loss**: 2% below entry (adjustable)
- **Take-Profit**: 4% above entry (2:1 risk-reward)
- **Daily Limits**: Maximum 5% daily loss
- **Position Limits**: Maximum 3 concurrent positions

## 🔧 API Endpoints

### Health Check
```bash
GET /health
```

### Webhook Status
```bash
GET /webhook/status
```

### TradingView Webhook
```bash
POST /webhook/tradingview
Content-Type: application/json
```

## 📈 Performance Metrics

The bot tracks comprehensive performance metrics:

- **Total Trades**: Number of executed trades
- **Win Rate**: Percentage of profitable trades
- **Profit Factor**: Gross profit / Gross loss
- **Sharpe Ratio**: Risk-adjusted returns
- **Maximum Drawdown**: Largest peak-to-trough decline
- **Average Trade Duration**: Time in position

## 🔒 Security Features

### API Security
- Encrypted API key storage
- IP whitelisting on exchange
- Minimal required permissions
- Regular key rotation recommended

### Webhook Security
- HMAC signature verification
- IP address validation
- Rate limiting protection
- Attack pattern detection

### System Security
- Input sanitization
- SQL injection prevention
- XSS protection
- Command injection blocking

## 📊 Supported Exchanges

Currently supports:
- **BingX Futures** (Primary)

Planned support:
- Binance Futures
- Bybit Futures
- OKX Futures

## 🎯 Supported Symbols

Major cryptocurrency pairs:
- BTC-USDT, ETH-USDT, ADA-USDT
- DOT-USDT, LINK-USDT, SOL-USDT
- MATIC-USDT, AVAX-USDT, DOGE-USDT
- And 20+ more popular pairs

## 📱 Notifications

Get real-time alerts via:

### Discord
```bash
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

### Telegram
```bash
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

### Email (SMTP)
```bash
EMAIL_HOST=smtp.gmail.com
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password
```

## 🧪 Testing

### Paper Trading
```bash
PAPER_TRADING=true npm run dev
```

### Unit Tests
```bash
npm test
```

### Integration Tests
```bash
npm run test:integration
```

### Webhook Testing
```bash
curl -X POST http://localhost:3000/webhook/test \
  -H "Content-Type: application/json" \
  -d '{"test": "message"}'
```

## 📋 Deployment

### Docker
```bash
docker build -t bingx-trading-bot .
docker run -d --env-file .env bingx-trading-bot
```

### PM2 (Production)
```bash
npm run build
pm2 start dist/index.js --name "bingx-bot"
```

### Systemd Service
```bash
sudo cp scripts/bingx-bot.service /etc/systemd/system/
sudo systemctl enable bingx-bot
sudo systemctl start bingx-bot
```

## 📊 Monitoring

### Logs
```bash
# Real-time logs
tail -f logs/trading.log

# Error logs
tail -f logs/trading.error.log

# PM2 logs
pm2 logs bingx-bot
```

### Metrics Dashboard
Access at `http://localhost:3000/metrics` (if enabled)

## 🔧 Troubleshooting

### Common Issues

**Connection Failed**
- Check API keys and permissions
- Verify IP whitelist settings
- Test network connectivity

**Invalid Signals**
- Verify TradingView alert format
- Check webhook secret
- Validate symbol mapping

**Rate Limits**
- Reduce signal frequency
- Check for duplicate alerts
- Monitor API usage

See [SETUP.md](docs/SETUP.md) for detailed troubleshooting.

## 📚 Documentation

- [Setup Guide](docs/SETUP.md) - Complete installation and configuration
- [Architecture](ARCHITECTURE.md) - System design and components
- [Implementation Plan](IMPLEMENTATION_PLAN.md) - Development roadmap
- [API Documentation](docs/API.md) - Endpoint reference

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## ⚠️ Risk Disclaimer

**Important**: Cryptocurrency trading involves substantial risk of loss. This bot is provided for educational and automation purposes only. 

- **Not Financial Advice**: This software does not constitute financial advice
- **Use at Your Own Risk**: Trading decisions are your responsibility
- **Start Small**: Begin with paper trading and small amounts
- **Monitor Closely**: Always supervise automated trading systems

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- TradingView for signal infrastructure
- BingX for futures trading API
- Open source community for tools and libraries

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/bingx-trading-bot/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/bingx-trading-bot/discussions)
- **Email**: support@yourproject.com

---

**⭐ Star this repository if you find it useful!**

**🔔 Watch for updates and new features**

**🍴 Fork to customize for your trading strategy**