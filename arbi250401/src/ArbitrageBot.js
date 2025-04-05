const { BinanceConnector } = require("./exchanges/BinanceConnector");
const { BitfinexConnector } = require("./exchanges/BitfinexConnector");
const logger = require("./utils/logger");
const Decimal = require("decimal.js");

class ArbitrageBot {
  constructor(config) {
    this.config = {
      minSpreadPercentage: 0.8,
      orderSizeUSD: 100,
      checkIntervalMs: 3000,
      paperTrading: true,
      tradingPairs: ["BTC/USDT", "ETH/USDT"],
      ...config,
    };

    this.exchanges = [];
    this.orderbooks = {};
    this.opportunities = [];
    this.running = false;
    this.intervalId = null;
    this.setupExchanges();

    // Track performance
    this.performance = {
      totalTrades: 0,
      successfulTrades: 0,
      failedTrades: 0,
      totalProfit: 0,
      startBalance: {},
      currentBalance: {},
    };
  }

  /**
   * Set up exchange connectors
   */
  setupExchanges() {
    try {
      // Initialize Binance connector if API keys are provided
      if (process.env.BINANCE_API_KEY && process.env.BINANCE_API_SECRET) {
        const binance = new BinanceConnector(
          process.env.BINANCE_API_KEY,
          process.env.BINANCE_API_SECRET
        );
        this.exchanges.push(binance);
        logger.info("Binance connector added");
      } else {
        logger.warn(
          "Binance API credentials not provided. Binance will not be used."
        );
      }

      // Initialize Bitfinex connector if API keys are provided
      if (process.env.BITFINEX_API_KEY && process.env.BITFINEX_API_SECRET) {
        const bitfinex = new BitfinexConnector(
          process.env.BITFINEX_API_KEY,
          process.env.BITFINEX_API_SECRET
        );
        this.exchanges.push(bitfinex);
        logger.info("Bitfinex connector added");
      } else {
        logger.warn(
          "Bitfinex API credentials not provided. Bitfinex will not be used."
        );
      }

      if (this.exchanges.length < 2) {
        logger.warn(
          "Less than 2 exchanges configured. Arbitrage requires at least 2 exchanges."
        );
      }

      logger.info(
        `Initialized ${this.exchanges.length} exchange connectors for Binance-Bitfinex arbitrage`
      );
    } catch (error) {
      logger.error("Error setting up exchanges:", error);
    }
  }

  /**
   * Start the bot
   */
  async start() {
    try {
      logger.info("Starting arbitrage bot...");

      // Initialize exchanges and websockets
      this.setupExchanges();

      for (const exchange of this.exchanges) {
        await exchange.init();
      }

      // Setup WebSockets for each trading pair and exchange
      this.setupWebSockets();

      // Update initial balances
      await this.updateBalances();

      this.running = true;
      logger.info(
        `Arbitrage bot started. Monitoring ${this.config.tradingPairs.length} trading pairs across ${this.exchanges.length} exchanges.`
      );
      logger.info(
        `Paper trading mode: ${this.config.paperTrading ? "ON" : "OFF"}`
      );

      return true;
    } catch (error) {
      logger.error("Error starting arbitrage bot:", error);
      return false;
    }
  }

  /**
   * Stop the bot
   */
  async stop() {
    try {
      this.running = false;
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }

      // Close all websocket connections
      for (const exchange of this.exchanges) {
        if (typeof exchange.closeWebSockets === "function") {
          await exchange.closeWebSockets();
        }
      }

      logger.info("Arbitrage bot stopped");
      return true;
    } catch (error) {
      logger.error("Error stopping arbitrage bot:", error);
      return false;
    }
  }

  /**
   * Run the arbitrage loop to continuously check for opportunities
   */
  runArbitrageLoop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    this.intervalId = setInterval(async () => {
      if (!this.running) return;

      try {
        // Check for arbitrage opportunities
        const opportunities = await this.checkArbitrageOpportunities();

        // Process any opportunities found
        for (const opportunity of opportunities) {
          logger.info(
            `Arbitrage opportunity: ${opportunity.pair} - Buy on ${
              opportunity.buyExchange
            } at ${opportunity.buyPrice}, Sell on ${
              opportunity.sellExchange
            } at ${opportunity.sellPrice}, Spread: ${opportunity.spread.toFixed(
              4
            )}%`
          );

          this.opportunities.push({
            ...opportunity,
            timestamp: Date.now(),
          });

          // Execute arbitrage if enabled
          await this.executeArbitrage(opportunity);
        }
      } catch (error) {
        logger.error("Error in arbitrage loop:", error);
      }
    }, this.config.checkIntervalMs);

    logger.info(
      `Arbitrage loop started, checking every ${this.config.checkIntervalMs}ms`
    );
  }

  /**
   * Setup websocket connections for orderbook data
   */
  setupWebSockets() {
    try {
      for (const pair of this.config.tradingPairs) {
        for (const exchange of this.exchanges) {
          if (typeof exchange.setupOrderBookWebSocket === "function") {
            exchange.setupOrderBookWebSocket(pair, (orderbook) => {
              this.updateOrderbook(orderbook);
            });
          }
        }
      }
    } catch (error) {
      logger.error("Error setting up websockets:", error);
    }
  }

  /**
   * Update orderbook data
   * @param {Object} orderbook - Orderbook data from exchange
   */
  updateOrderbook(orderbook) {
    try {
      const { exchange, pair } = orderbook;

      if (!this.orderbooks[pair]) {
        this.orderbooks[pair] = {};
      }

      this.orderbooks[pair][exchange] = {
        bids: orderbook.bids,
        asks: orderbook.asks,
        timestamp: Date.now(),
      };
    } catch (error) {
      logger.error("Error updating orderbook:", error);
    }
  }

  /**
   * Update account balances across all exchanges
   */
  async updateBalances() {
    try {
      const balances = {};

      for (const exchange of this.exchanges) {
        const exchangeBalances = await exchange.getBalances();
        balances[exchange.name] = exchangeBalances;
      }

      // Store balances for performance tracking
      if (Object.keys(this.performance.startBalance).length === 0) {
        this.performance.startBalance = JSON.parse(JSON.stringify(balances));
      }

      this.performance.currentBalance = balances;

      return balances;
    } catch (error) {
      logger.error("Error updating balances:", error);
      return {};
    }
  }

  /**
   * Get best price for a given trading pair on a specific exchange
   * @param {string} pair - Trading pair
   * @param {string} exchangeName - Exchange name
   * @param {string} side - 'bid' or 'ask'
   * @returns {number} - Best price
   */
  getBestPrice(pair, exchangeName, side) {
    try {
      const orderbook = this.orderbooks[pair]?.[exchangeName];
      if (!orderbook) {
        logger.warn(`No orderbook data for ${pair} on ${exchangeName}`);
        return null;
      }

      if (side === "bid") {
        // Best bid (highest) - what we can sell for
        return orderbook.bids?.length > 0 ? orderbook.bids[0].price : null;
      } else if (side === "ask") {
        // Best ask (lowest) - what we can buy for
        return orderbook.asks?.length > 0 ? orderbook.asks[0].price : null;
      }
      return null;
    } catch (error) {
      logger.error(
        `Error getting best price for ${pair} on ${exchangeName}:`,
        error
      );
      return null;
    }
  }

  /**
   * Check for arbitrage opportunities across exchanges
   */
  async checkArbitrageOpportunities() {
    try {
      const opportunities = [];

      if (this.exchanges.length < 2) {
        logger.warn(
          "Need at least 2 exchanges to check for arbitrage opportunities"
        );
        return [];
      }

      // Update all orderbooks first
      for (const pair of this.config.tradingPairs) {
        if (!this.orderbooks[pair]) {
          this.orderbooks[pair] = {};
        }

        for (const exchange of this.exchanges) {
          try {
            const orderbook = await exchange.getOrderBook(pair);
            if (orderbook && orderbook.bids && orderbook.asks) {
              this.orderbooks[pair][exchange.name] = orderbook;
            } else {
              logger.warn(
                `Could not get valid orderbook from ${exchange.name} for ${pair}`
              );
            }
          } catch (error) {
            logger.error(
              `Error getting ${exchange.name} orderbook for ${pair}:`,
              error
            );
          }
        }
      }

      // Compare orderbooks and find opportunities
      for (const pair of this.config.tradingPairs) {
        // Skip if we don't have data for this pair
        if (!this.orderbooks[pair]) continue;

        for (let i = 0; i < this.exchanges.length; i++) {
          for (let j = i + 1; j < this.exchanges.length; j++) {
            const exchange1 = this.exchanges[i].name;
            const exchange2 = this.exchanges[j].name;

            // Skip if we don't have data for both exchanges
            if (
              !this.orderbooks[pair][exchange1] ||
              !this.orderbooks[pair][exchange2]
            ) {
              continue;
            }

            // Get best prices
            const bestBid1 = this.getBestPrice(pair, exchange1, "bid");
            const bestAsk2 = this.getBestPrice(pair, exchange2, "ask");
            const bestBid2 = this.getBestPrice(pair, exchange2, "bid");
            const bestAsk1 = this.getBestPrice(pair, exchange1, "ask");

            // Skip if any price is null
            if (!bestBid1 || !bestAsk2 || !bestBid2 || !bestAsk1) {
              continue;
            }

            // Calculate spreads
            const spread1 = this.calculateSpread(bestBid1, bestAsk2);
            const spread2 = this.calculateSpread(bestBid2, bestAsk1);

            // Exchange 1 -> Exchange 2 opportunity
            if (spread1 >= this.config.minSpreadPercentage) {
              opportunities.push({
                pair,
                buyExchange: exchange2,
                sellExchange: exchange1,
                buyPrice: bestAsk2,
                sellPrice: bestBid1,
                spread: spread1,
              });
            }

            // Exchange 2 -> Exchange 1 opportunity
            if (spread2 >= this.config.minSpreadPercentage) {
              opportunities.push({
                pair,
                buyExchange: exchange1,
                sellExchange: exchange2,
                buyPrice: bestAsk1,
                sellPrice: bestBid2,
                spread: spread2,
              });
            }
          }
        }
      }

      return opportunities;
    } catch (error) {
      logger.error("Error checking arbitrage opportunities:", error);
      return [];
    }
  }

  /**
   * Calculate arbitrage spread percentage
   * @param {number} sellPrice - Price to sell at
   * @param {number} buyPrice - Price to buy at
   */
  calculateSpread(sellPrice, buyPrice) {
    if (!sellPrice || !buyPrice || sellPrice <= 0 || buyPrice <= 0) {
      return -100; // Invalid prices
    }

    const sell = new Decimal(sellPrice);
    const buy = new Decimal(buyPrice);

    // Calculate spread percentage with fees
    // Typical fee is 0.1% per trade
    const sellFee = sell.times(0.001);
    const buyFee = buy.times(0.001);

    const sellAfterFee = sell.minus(sellFee);
    const buyAfterFee = buy.plus(buyFee);

    // ((sell_price / buy_price) - 1) * 100
    const spread = sellAfterFee.div(buyAfterFee).minus(1).times(100);

    return spread.toNumber();
  }

  /**
   * Execute arbitrage trade
   * @param {Object} opportunity - Arbitrage opportunity
   */
  async executeArbitrage(opportunity) {
    if (!this.running) return;

    try {
      const { pair, buyExchange, sellExchange, buyPrice, sellPrice, spread } =
        opportunity;

      // Skip if spread is too low after a detailed check
      if (spread < this.config.minSpreadPercentage) {
        logger.debug(
          `Skipping arbitrage: Spread (${spread.toFixed(4)}%) below minimum (${
            this.config.minSpreadPercentage
          }%)`
        );
        return;
      }

      // Log the opportunity
      logger.info(
        `Executing arbitrage: ${pair} - Buy on ${buyExchange} at ${buyPrice}, Sell on ${sellExchange} at ${sellPrice}, Spread: ${spread.toFixed(
          4
        )}%`
      );

      // In paper trading mode, simulate the trade
      if (this.config.paperTrading) {
        return this.simulateArbitrage(opportunity);
      }

      // Find the exchange connectors
      const buyExchangeConnector = this.exchanges.find(
        (e) => e.name === buyExchange
      );
      const sellExchangeConnector = this.exchanges.find(
        (e) => e.name === sellExchange
      );

      if (!buyExchangeConnector || !sellExchangeConnector) {
        logger.error(
          `Could not find exchange connectors for ${buyExchange} or ${sellExchange}`
        );
        return;
      }

      // Calculate the amount to buy based on the configured order size
      const orderSize = this.config.orderSizeUSD;
      const baseAssetAmount = new Decimal(orderSize).div(buyPrice);

      // Execute buy order
      const buyOrder = await buyExchangeConnector.marketBuy(
        pair,
        orderSize,
        true
      );

      if (!buyOrder.success) {
        logger.error(
          `Failed to execute buy order on ${buyExchange}: ${buyOrder.error}`
        );
        this.performance.failedTrades++;
        return;
      }

      // Execute sell order with the amount purchased
      const sellOrder = await sellExchangeConnector.marketSell(
        pair,
        buyOrder.executedQty
      );

      if (!sellOrder.success) {
        logger.error(
          `Failed to execute sell order on ${sellExchange}: ${sellOrder.error}`
        );
        this.performance.failedTrades++;
        return;
      }

      // Calculate profit
      const buyTotal = new Decimal(buyOrder.executedQty).times(buyOrder.price);
      const sellTotal = new Decimal(sellOrder.executedQty).times(
        sellOrder.price
      );
      const profit = sellTotal.minus(buyTotal);

      // Update performance statistics
      this.performance.totalTrades++;
      this.performance.successfulTrades++;
      this.performance.totalProfit = new Decimal(this.performance.totalProfit)
        .plus(profit)
        .toNumber();

      // Update balances
      await this.updateBalances();

      logger.info(`Arbitrage completed: Profit = ${profit.toFixed(4)} USDT`);

      return {
        success: true,
        buyOrder,
        sellOrder,
        profit: profit.toNumber(),
      };
    } catch (error) {
      logger.error("Error executing arbitrage:", error);
      this.performance.failedTrades++;
      return { success: false, error: error.message };
    }
  }

  /**
   * Simulate arbitrage trade for paper trading
   * @param {Object} opportunity - Arbitrage opportunity
   */
  simulateArbitrage(opportunity) {
    try {
      const { pair, buyExchange, sellExchange, buyPrice, sellPrice, spread } =
        opportunity;

      // Calculate the amount to buy based on the configured order size
      const orderSize = this.config.orderSizeUSD;
      const baseAssetAmount = new Decimal(orderSize).div(buyPrice);

      // Calculate profit
      const buyTotal = new Decimal(orderSize);
      const sellTotal = baseAssetAmount.times(sellPrice);
      const profit = sellTotal.minus(buyTotal);

      // Apply trading fees (typically 0.1% per trade)
      const buyFee = buyTotal.times(0.001);
      const sellFee = sellTotal.times(0.001);
      const netProfit = profit.minus(buyFee).minus(sellFee);

      // Update performance statistics
      this.performance.totalTrades++;
      this.performance.successfulTrades++;
      this.performance.totalProfit = new Decimal(this.performance.totalProfit)
        .plus(netProfit)
        .toNumber();

      logger.info(
        `[PAPER TRADING] Arbitrage simulated: ${pair} - Buy on ${buyExchange} (${baseAssetAmount.toFixed(
          8
        )} @ ${buyPrice}), Sell on ${sellExchange} (${baseAssetAmount.toFixed(
          8
        )} @ ${sellPrice})`
      );
      logger.info(
        `[PAPER TRADING] Profit = ${netProfit.toFixed(
          4
        )} USDT (${spread.toFixed(2)}%)`
      );

      return {
        success: true,
        buyOrder: {
          exchange: buyExchange,
          pair,
          price: buyPrice,
          amount: baseAssetAmount.toNumber(),
          total: orderSize,
        },
        sellOrder: {
          exchange: sellExchange,
          pair,
          price: sellPrice,
          amount: baseAssetAmount.toNumber(),
          total: sellTotal.toNumber(),
        },
        profit: netProfit.toNumber(),
      };
    } catch (error) {
      logger.error("Error simulating arbitrage:", error);
      this.performance.failedTrades++;
      return { success: false, error: error.message };
    }
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats() {
    return {
      totalTrades: this.performance.totalTrades,
      successfulTrades: this.performance.successfulTrades,
      failedTrades: this.performance.failedTrades,
      totalProfit: this.performance.totalProfit,
      successRate:
        this.performance.totalTrades > 0
          ? (
              (this.performance.successfulTrades /
                this.performance.totalTrades) *
              100
            ).toFixed(2) + "%"
          : "N/A",
      recentOpportunities: this.opportunities.slice(-5),
    };
  }
}

module.exports = { ArbitrageBot };
