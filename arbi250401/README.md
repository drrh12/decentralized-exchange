# Cryptocurrency Arbitrage Bot: Binance & Bitfinex Edition

A Node.js bot that monitors cryptocurrency price differences between Binance and Bitfinex exchanges to identify and execute arbitrage opportunities.

## Features

- Real-time monitoring of orderbook data across Binance and Bitfinex
- Configurable spread threshold for arbitrage detection
- Support for multiple trading pairs
- Paper trading mode for risk-free testing
- Detailed logging and performance tracking
- WebSocket support for low-latency price updates
- Handling for exchange-specific trading pair formats

## Supported Exchanges

- Binance
- Bitfinex

## Supported Trading Pairs

Any trading pair available on both Binance and Bitfinex can be monitored. The bot is pre-configured for:

- BTC/USDT
- ETH/USDT
- SOL/USDT
- MATIC/USDT

## Installation

### Prerequisites

- Node.js (v14+)
- npm or yarn
- API keys for both Binance and Bitfinex

### Setup

1. Clone the repository:

```bash
git clone https://github.com/your-username/crypto-arbitrage-bot.git
cd crypto-arbitrage-bot
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file based on the provided `.env.example`:

```bash
cp .env.example .env
```

4. Edit the `.env` file and add your Binance and Bitfinex API keys and preferred configuration.

## Configuration

The bot can be configured using environment variables in the `.env` file:

```
# Binance API credentials
BINANCE_API_KEY=your_binance_api_key
BINANCE_API_SECRET=your_binance_api_secret

# Bitfinex API credentials
BITFINEX_API_KEY=your_bitfinex_api_key
BITFINEX_API_SECRET=your_bitfinex_api_secret

# Bot Configuration
MIN_SPREAD_PERCENTAGE=0.8
ORDER_SIZE_USD=100
CHECK_INTERVAL_MS=3000
PAPER_TRADING=true

# Trading pairs to monitor (comma-separated)
TRADING_PAIRS=BTC/USDT,ETH/USDT,SOL/USDT,MATIC/USDT

# Logging
LOG_LEVEL=info
```

### Configuration Options

- `MIN_SPREAD_PERCENTAGE`: Minimum spread percentage to execute an arbitrage (e.g., 0.8 means 0.8%)
- `ORDER_SIZE_USD`: Size of each order in USD
- `CHECK_INTERVAL_MS`: How often to check for arbitrage opportunities (in milliseconds)
- `PAPER_TRADING`: Set to true for simulation mode, false for real trading
- `TRADING_PAIRS`: Comma-separated list of trading pairs to monitor
- `LOG_LEVEL`: Logging level (debug, info, warn, error)

## Usage

### Start the Bot

```bash
npm start
```

This will start the bot, which will:

1. Connect to Binance and Bitfinex
2. Begin monitoring orderbook data
3. Identify arbitrage opportunities
4. Execute trades (or simulate them in paper trading mode)

### Run Tests

```bash
npm test
```

This runs a test script that verifies:

- Spread calculation accuracy
- Arbitrage opportunity detection
- Simulated trading functionality

## How it Works

The bot performs the following operations:

1. **Exchange Connection**: Connects to Binance and Bitfinex using API keys.
2. **Data Collection**: Collects orderbook data using REST APIs and WebSockets.
3. **Opportunity Detection**:
   - Compares the best bid (sell) price on one exchange with the best ask (buy) price on the other.
   - Calculates the spread percentage, accounting for trading fees.
   - Identifies opportunities where the spread exceeds the minimum threshold.
4. **Execution**:
   - If an opportunity is found, executes a buy order on the exchange with the lower price.
   - Simultaneously executes a sell order on the exchange with the higher price.
   - In paper trading mode, simulates these operations.
5. **Tracking**: Records all trades and calculates profit.

## Risk Management

The bot implements several risk management features:

- Configurable order size to limit exposure
- Paper trading mode for testing without real funds
- Detailed logging for debugging and analysis
- Consideration of exchange fees in spread calculations
- WebSocket usage to minimize latency

## Disclaimer

This bot is provided for educational and research purposes only. Using this for actual trading comes with significant risks:

1. Cryptocurrency markets are highly volatile.
2. Arbitrage opportunities may close quickly before execution completes.
3. API latency can impact execution timing.
4. Exchange fees and withdrawal costs can reduce or eliminate profitability.
5. Technical issues can lead to unexpected losses.

**Use at your own risk. The authors are not responsible for any financial losses incurred.**

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
