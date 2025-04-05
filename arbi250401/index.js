require("dotenv").config();
const { ArbitrageBot } = require("./src/ArbitrageBot");
const logger = require("./src/utils/logger");

// Initialize the bot with configuration from environment variables
const bot = new ArbitrageBot({
  minSpreadPercentage: parseFloat(process.env.MIN_SPREAD_PERCENTAGE) || 0.8,
  orderSizeUSD: parseFloat(process.env.ORDER_SIZE_USD) || 100,
  checkIntervalMs: parseInt(process.env.CHECK_INTERVAL_MS) || 3000,
  paperTrading: process.env.PAPER_TRADING === "true",
  tradingPairs: (process.env.TRADING_PAIRS || "BTC/USDT,ETH/USDT").split(","),
});

// Handle process termination
process.on("SIGINT", async () => {
  logger.info("Received SIGINT. Shutting down gracefully...");
  await bot.stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("Received SIGTERM. Shutting down gracefully...");
  await bot.stop();
  process.exit(0);
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception:", error);
  process.exit(1);
});

// Start the bot
try {
  logger.info("Starting arbitrage bot...");
  bot.start();
} catch (error) {
  logger.error("Failed to start arbitrage bot:", error);
  process.exit(1);
}
