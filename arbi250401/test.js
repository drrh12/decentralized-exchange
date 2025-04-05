require("dotenv").config();
const { ArbitrageBot } = require("./src/ArbitrageBot");
const logger = require("./src/utils/logger");

// Mock orderbook data for testing
const mockOrderbooks = {
  "BTC/USDT": {
    Binance: {
      bids: [{ price: 30150.5, quantity: 1.5 }],
      asks: [{ price: 30155.8, quantity: 2.0 }],
      timestamp: Date.now(),
    },
    Bitfinex: {
      bids: [{ price: 30140.2, quantity: 1.0 }],
      asks: [{ price: 30165.3, quantity: 2.2 }],
      timestamp: Date.now(),
    },
  },
  "ETH/USDT": {
    Binance: {
      bids: [{ price: 2050.5, quantity: 10.5 }],
      asks: [{ price: 2052.3, quantity: 12.0 }],
      timestamp: Date.now(),
    },
    Bitfinex: {
      bids: [{ price: 2048.6, quantity: 11.0 }],
      asks: [{ price: 2053.8, quantity: 10.2 }],
      timestamp: Date.now(),
    },
  },
};

// Create a test bot with modified behavior for testing
class TestArbitrageBot extends ArbitrageBot {
  constructor(config) {
    super(config);
    this.mockOrderbooks = mockOrderbooks;
  }

  // Override exchange setup to create mock exchanges
  setupExchanges() {
    this.exchanges = [
      { name: "Binance", closeWebSockets: () => {} },
      { name: "Bitfinex", closeWebSockets: () => {} },
    ];
    logger.info(
      `Initialized ${this.exchanges.length} mock exchange connectors for Binance-Bitfinex arbitrage`
    );
  }

  // Override websocket setup to inject mock data
  setupWebSockets() {
    logger.info("Mocking websocket data");
    // Inject mock orderbook data
    this.orderbooks = JSON.parse(JSON.stringify(this.mockOrderbooks));
  }

  // Override to avoid making real API calls
  async updateBalances() {
    return {};
  }

  // Create a method to test spread calculation
  testSpreadCalculation() {
    const testCases = [
      { sellPrice: 30150.5, buyPrice: 30100.2, expectedSpread: 0.16 },
      { sellPrice: 2055.4, buyPrice: 2052.3, expectedSpread: 0.14 },
      { sellPrice: 100, buyPrice: 101, expectedSpread: -1.01 }, // Negative spread
    ];

    logger.info("Testing spread calculation...");

    for (const testCase of testCases) {
      const { sellPrice, buyPrice, expectedSpread } = testCase;
      const calculatedSpread = this.calculateSpread(sellPrice, buyPrice);

      const roundedCalculated = Math.round(calculatedSpread * 100) / 100;
      const isClose = Math.abs(roundedCalculated - expectedSpread) < 0.02;

      if (isClose) {
        logger.info(
          `✅ Spread calculation correct: Sell=${sellPrice}, Buy=${buyPrice}, Expected=${expectedSpread.toFixed(
            2
          )}%, Got=${roundedCalculated.toFixed(2)}%`
        );
      } else {
        logger.error(
          `❌ Spread calculation incorrect: Sell=${sellPrice}, Buy=${buyPrice}, Expected=${expectedSpread.toFixed(
            2
          )}%, Got=${roundedCalculated.toFixed(2)}%`
        );
      }
    }
  }

  // Test for arbitrage detection
  testArbitrageDetection() {
    logger.info("Testing arbitrage detection...");

    // Create another set of orderbooks with clear arbitrage opportunities
    const arbitrageOrderbooks = {
      "BTC/USDT": {
        Binance: {
          bids: [{ price: 30200.0, quantity: 1.5 }], // High sell price
          asks: [{ price: 30150.0, quantity: 2.0 }],
          timestamp: Date.now(),
        },
        Bitfinex: {
          bids: [{ price: 30120.0, quantity: 1.2 }],
          asks: [{ price: 30100.0, quantity: 1.8 }], // Low buy price
          timestamp: Date.now(),
        },
      },
    };

    // Save current orderbooks and use the test ones
    const originalOrderbooks = this.orderbooks;
    this.orderbooks = arbitrageOrderbooks;

    // Run a check for opportunities
    const opportunities = [];

    // Call the internal methods directly
    const pair = "BTC/USDT";
    const exchange1 = "Binance";
    const exchange2 = "Bitfinex";

    // Get best prices
    const bestBid1 = this.getBestPrice(pair, exchange1, "bid");
    const bestAsk2 = this.getBestPrice(pair, exchange2, "ask");
    const bestBid2 = this.getBestPrice(pair, exchange2, "bid");
    const bestAsk1 = this.getBestPrice(pair, exchange1, "ask");

    // Calculate spreads
    const spread1 = this.calculateSpread(bestBid1, bestAsk2);
    const spread2 = this.calculateSpread(bestBid2, bestAsk1);

    logger.info(
      `Arbitrage opportunity test: ${pair} - Buy on ${exchange2} at ${bestAsk2}, Sell on ${exchange1} at ${bestBid1}, Spread: ${spread1.toFixed(
        4
      )}%`
    );

    if (spread1 >= this.config.minSpreadPercentage) {
      logger.info(
        `✅ Detected arbitrage opportunity 1 with spread ${spread1.toFixed(2)}%`
      );
      opportunities.push({
        pair,
        buyExchange: exchange2,
        sellExchange: exchange1,
        buyPrice: bestAsk2,
        sellPrice: bestBid1,
        spread: spread1,
      });
    } else {
      logger.error(
        `❌ Failed to detect arbitrage opportunity 1 with spread ${spread1.toFixed(
          2
        )}%`
      );
    }

    logger.info(
      `Arbitrage opportunity test: ${pair} - Buy on ${exchange1} at ${bestAsk1}, Sell on ${exchange2} at ${bestBid2}, Spread: ${spread2.toFixed(
        4
      )}%`
    );

    if (spread2 >= this.config.minSpreadPercentage) {
      logger.info(
        `✅ Detected arbitrage opportunity 2 with spread ${spread2.toFixed(2)}%`
      );
      opportunities.push({
        pair,
        buyExchange: exchange1,
        sellExchange: exchange2,
        buyPrice: bestAsk1,
        sellPrice: bestBid2,
        spread: spread2,
      });
    } else {
      logger.info(
        `No arbitrage opportunity 2 with spread ${spread2.toFixed(
          2
        )}% (below threshold)`
      );
    }

    // Restore original orderbooks
    this.orderbooks = originalOrderbooks;

    return opportunities;
  }

  // Test simulated trading
  async testSimulatedTrading(opportunity) {
    logger.info("Testing simulated trading...");

    if (!opportunity) {
      logger.error("No opportunity provided for testing simulated trading");
      return;
    }

    // Force paper trading mode
    const originalPaperTrading = this.config.paperTrading;
    this.config.paperTrading = true;

    // Execute the arbitrage
    const result = await this.simulateArbitrage(opportunity);

    if (result && result.success) {
      logger.info(
        `✅ Simulated trading successful: Profit=${result.profit.toFixed(
          4
        )} USDT`
      );
    } else {
      logger.error(
        "❌ Simulated trading failed:",
        result?.error || "Unknown error"
      );
    }

    // Restore original setting
    this.config.paperTrading = originalPaperTrading;

    return result;
  }
}

// Run the tests
async function runTests() {
  logger.info("Starting Binance-Bitfinex arbitrage bot tests...");

  // Create test bot
  const testBot = new TestArbitrageBot({
    minSpreadPercentage: 0.5, // Lower threshold for testing
    orderSizeUSD: 1000,
    checkIntervalMs: 3000,
    paperTrading: true,
    tradingPairs: ["BTC/USDT", "ETH/USDT"],
  });

  // Test spread calculation
  testBot.testSpreadCalculation();

  // Test arbitrage detection
  const opportunities = testBot.testArbitrageDetection();

  // If opportunities were found, test simulated trading
  if (opportunities && opportunities.length > 0) {
    await testBot.testSimulatedTrading(opportunities[0]);
  }

  logger.info("Binance-Bitfinex arbitrage bot tests completed");
}

// Run tests
runTests().catch((error) => {
  logger.error("Error running tests:", error);
});
