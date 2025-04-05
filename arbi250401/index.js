require("dotenv").config();
const { ArbitrageBot } = require("./src/ArbitrageBot");
const logger = require("./src/utils/logger");

async function startBot() {
  try {
    // Parse trading pairs from environment variable
    const tradingPairs = process.env.TRADING_PAIRS
      ? process.env.TRADING_PAIRS.split(",").map((pair) => pair.trim())
      : ["BTC/USDT", "ETH/USDT"];

    const config = {
      minSpreadPercentage: parseFloat(process.env.MIN_SPREAD_PERCENTAGE || 0.8),
      orderSizeUSD: parseFloat(process.env.ORDER_SIZE_USD || 100),
      checkIntervalMs: parseInt(process.env.CHECK_INTERVAL_MS || 3000),
      paperTrading: process.env.PAPER_TRADING === "true",
      tradingPairs,
    };

    logger.info("Starting arbitrage bot...");
    const bot = new ArbitrageBot(config);

    // Initialize exchanges and start monitoring
    await bot.start();

    // Handle process termination
    process.on("SIGINT", async () => {
      logger.info("Shutting down bot...");
      await bot.stop();
      process.exit(0);
    });

    // Schedule regular opportunity checks
    bot.runArbitrageLoop();

    // Every 5 minutes, log a performance summary
    setInterval(() => {
      const stats = bot.getPerformanceStats();
      logger.info("Performance summary:", stats);
    }, 5 * 60 * 1000);

    return bot;
  } catch (error) {
    logger.error("Error starting arbitrage bot:", error);
    process.exit(1);
  }
}

// Start the bot
startBot().catch((error) => {
  logger.error("Fatal error:", error);
});
