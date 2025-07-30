#!/bin/bash

# Test script for TradingView webhook
# Make sure your bot is running before executing this script

# Configuration
WEBHOOK_URL="http://localhost:3000/webhook/tradingview"
HEALTH_URL="http://localhost:3000/health"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== TradingView Webhook Test Script ===${NC}"
echo ""

# Test 1: Check if bot is running
echo -e "${YELLOW}1. Checking if bot is running...${NC}"
if curl -s "$HEALTH_URL" > /dev/null; then
    echo -e "${GREEN}✅ Bot is running and healthy${NC}"
else
    echo -e "${RED}❌ Bot is not running or not accessible${NC}"
    echo "Please start your bot with: npm run dev"
    exit 1
fi
echo ""

# Test 2: Test BUY signal
echo -e "${YELLOW}2. Testing BUY signal...${NC}"
BUY_PAYLOAD='{
  "symbol": "BTCUSDT",
  "action": "BUY",
  "price": 50000,
  "strategy": "MFI_RSI",
  "timeframe": "1h",
  "signal_strength": "STRONG",
  "mfi_value": 25,
  "rsi_value": 30,
  "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",
  "secret": "your-webhook-secret"
}'

RESPONSE=$(curl -s -w "%{http_code}" -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d "$BUY_PAYLOAD")

HTTP_CODE="${RESPONSE: -3}"
RESPONSE_BODY="${RESPONSE%???}"

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ BUY signal sent successfully${NC}"
    echo "Response: $RESPONSE_BODY"
else
    echo -e "${RED}❌ BUY signal failed (HTTP $HTTP_CODE)${NC}"
    echo "Response: $RESPONSE_BODY"
fi
echo ""

# Test 3: Test SELL signal
echo -e "${YELLOW}3. Testing SELL signal...${NC}"
SELL_PAYLOAD='{
  "symbol": "BTCUSDT",
  "action": "SELL",
  "price": 52000,
  "strategy": "MFI_RSI",
  "timeframe": "1h",
  "signal_strength": "STRONG",
  "mfi_value": 75,
  "rsi_value": 70,
  "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",
  "secret": "your-webhook-secret"
}'

RESPONSE=$(curl -s -w "%{http_code}" -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d "$SELL_PAYLOAD")

HTTP_CODE="${RESPONSE: -3}"
RESPONSE_BODY="${RESPONSE%???}"

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ SELL signal sent successfully${NC}"
    echo "Response: $RESPONSE_BODY"
else
    echo -e "${RED}❌ SELL signal failed (HTTP $HTTP_CODE)${NC}"
    echo "Response: $RESPONSE_BODY"
fi
echo ""

# Test 4: Test CLOSE signal
echo -e "${YELLOW}4. Testing CLOSE signal...${NC}"
CLOSE_PAYLOAD='{
  "symbol": "BTCUSDT",
  "action": "CLOSE",
  "price": 51000,
  "strategy": "MFI_RSI",
  "timeframe": "1h",
  "signal_strength": "MEDIUM",
  "mfi_value": 60,
  "rsi_value": 50,
  "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",
  "secret": "your-webhook-secret"
}'

RESPONSE=$(curl -s -w "%{http_code}" -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d "$CLOSE_PAYLOAD")

HTTP_CODE="${RESPONSE: -3}"
RESPONSE_BODY="${RESPONSE%???}"

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ CLOSE signal sent successfully${NC}"
    echo "Response: $RESPONSE_BODY"
else
    echo -e "${RED}❌ CLOSE signal failed (HTTP $HTTP_CODE)${NC}"
    echo "Response: $RESPONSE_BODY"
fi
echo ""

# Test 5: Test invalid signal
echo -e "${YELLOW}5. Testing invalid signal (should fail)...${NC}"
INVALID_PAYLOAD='{
  "symbol": "BTCUSDT",
  "action": "INVALID_ACTION",
  "price": "invalid_price"
}'

RESPONSE=$(curl -s -w "%{http_code}" -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d "$INVALID_PAYLOAD")

HTTP_CODE="${RESPONSE: -3}"
RESPONSE_BODY="${RESPONSE%???}"

if [ "$HTTP_CODE" != "200" ]; then
    echo -e "${GREEN}✅ Invalid signal correctly rejected (HTTP $HTTP_CODE)${NC}"
    echo "Response: $RESPONSE_BODY"
else
    echo -e "${RED}❌ Invalid signal was accepted (should have been rejected)${NC}"
    echo "Response: $RESPONSE_BODY"
fi
echo ""

# Summary
echo -e "${BLUE}=== Test Summary ===${NC}"
echo "All tests completed. Check your bot logs for detailed information."
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Copy the Pine Script from scripts/tradingview-strategy.pine"
echo "2. Paste it into TradingView Pine Editor"
echo "3. Set your webhook URL in the strategy settings"
echo "4. Apply the strategy to your chart"
echo "5. Create alerts based on the strategy signals"
echo ""
echo -e "${GREEN}Your webhook is ready for TradingView integration! 🎯${NC}" 