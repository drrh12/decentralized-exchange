const { BinanceConnector } = require("./exchanges/BinanceConnector");
const { KuCoinConnector } = require("./exchanges/KuCoinConnector");
const { GateIoConnector } = require("./exchanges/GateIoConnector");
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
      }

      // Initialize KuCoin connector if API keys are provided
      if (
        process.env.KUCOIN_API_KEY &&
        process.env.KUCOIN_API_SECRET &&
        process.env.KUCOIN_API_PASSPHRASE
      ) {
        const kucoin = new KuCoinConnector(
          process.env.KUCOIN_API_KEY,
          process.env.KUCOIN_API_SECRET,
          process.env.KUCOIN_API_PASSPHRASE
        );
        this.exchanges.push(kucoin);
      }

      // Initialize GateIo connector if API keys are provided
      if (process.env.GATEIO_API_KEY && process.env.GATEIO_API_SECRET) {
        const gateio = new GateIoConnector(
          process.env.GATEIO_API_KEY,
          process.env.GATEIO_API_SECRET
        );
        this.exchanges.push(gateio);
      }

      if (this.exchanges.length < 2) {
        logger.warn(
          "Less than 2 exchanges configured. Arbitrage requires at least 2 exchanges."
        );
      }

      logger.info(`Initialized ${this.exchanges.length} exchange connectors`);
    } catch (error) {
      logger.error("Error setting up exchanges:", error);
    }
  }

  /**
   * Start the arbitrage bot
   */
  async start() {
    if (this.running) {
      logger.warn("Arbitrage bot is already running");
      return;
    }

    try {
      logger.info("Starting arbitrage bot...");
      this.running = true;

      // Initialize exchange connections
      for (const exchange of this.exchanges) {
        await exchange.init();
      }

      // Get initial balances
      await this.updateBalances();

      // Setup websockets for orderbook data
      this.setupWebSockets();

      // Start monitoring for arbitrage opportunities
      this.intervalId = setInterval(
        () => this.checkArbitrageOpportunities(),
        this.config.checkIntervalMs
      );

      logger.info(
        `Arbitrage bot started. Monitoring ${this.config.tradingPairs.length} trading pairs across ${this.exchanges.length} exchanges.`
      );
      logger.info(
        `Paper trading mode: ${this.config.paperTrading ? "ON" : "OFF"}`
      );
    } catch (error) {
      this.running = false;
      logger.error("Error starting arbitrage bot:", error);
    }
  }

  /**
   * Stop the arbitrage bot
   */
  async stop() {
    if (!this.running) {
      logger.warn("Arbitrage bot is not running");
      return;
    }

    try {
      logger.info("Stopping arbitrage bot...");
      this.running = false;

      // Stop monitoring interval
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }

      // Close websocket connections
      for (const exchange of this.exchanges) {
        if (typeof exchange.closeWebSockets === "function") {
          await exchange.closeWebSockets();
        }
      }

      logger.info("Arbitrage bot stopped");
    } catch (error) {
      logger.error("Error stopping arbitrage bot:", error);
    }
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
   * Check for arbitrage opportunities
   */
  async checkArbitrageOpportunities() {
    try {
      // For each trading pair
      for (const pair of this.config.tradingPairs) {
        // Fetch latest orderbook data if not using websockets
        for (const exchange of this.exchanges) {
          if (!this.orderbooks[pair] || !this.orderbooks[pair][exchange.name]) {
            const orderbook = await exchange.getOrderBook(pair);
            if (orderbook) {
              this.updateOrderbook(orderbook);
            }
          }
        }

        // Skip if we don't have orderbook data for at least 2 exchanges
        const exchangesWithData = this.orderbooks[pair]
          ? Object.keys(this.orderbooks[pair])
          : [];
        if (exchangesWithData.length < 2) {
          continue;
        }

        // Check all exchange combinations for this pair
        for (let i = 0; i < exchangesWithData.length; i++) {
          for (let j = i + 1; j < exchangesWithData.length; j++) {
            const exchange1 = exchangesWithData[i];
            const exchange2 = exchangesWithData[j];

            // Get best bid (sell) from exchange1 and best ask (buy) from exchange2
            const bestBid1 = this.getBestPrice(pair, exchange1, "bid");
            const bestAsk2 = this.getBestPrice(pair, exchange2, "ask");

            // Calculate potential arbitrage (buy on exchange2, sell on exchange1)
            const spread1 = this.calculateSpread(bestBid1, bestAsk2);

            // Get best bid (sell) from exchange2 and best ask (buy) from exchange1
            const bestBid2 = this.getBestPrice(pair, exchange2, "bid");
            const bestAsk1 = this.getBestPrice(pair, exchange1, "ask");

            // Calculate potential arbitrage (buy on exchange1, sell on exchange2)
            const spread2 = this.calculateSpread(bestBid2, bestAsk1);

            // If first arbitrage opportunity exists
            if (spread1 >= this.config.minSpreadPercentage) {
              const opportunity = {
                pair,
                buyExchange: exchange2,
                sellExchange: exchange1,
                buyPrice: bestAsk2,
                sellPrice: bestBid1,
                spread: spread1,
                timestamp: Date.now(),
              };

              logger.info(
                `Arbitrage opportunity: ${pair} - Buy on ${exchange2} at ${bestAsk2}, Sell on ${exchange1} at ${bestBid1}, Spread: ${spread1.toFixed(
                  4
                )}%`
              );

              this.opportunities.push(opportunity);
              await this.executeArbitrage(opportunity);
            }

            // If second arbitrage opportunity exists
            if (spread2 >= this.config.minSpreadPercentage) {
              const opportunity = {
                pair,
                buyExchange: exchange1,
                sellExchange: exchange2,
                buyPrice: bestAsk1,
                sellPrice: bestBid2,
                spread: spread2,
                timestamp: Date.now(),
              };

              logger.info(
                `Arbitrage opportunity: ${pair} - Buy on ${exchange1} at ${bestAsk1}, Sell on ${exchange2} at ${bestBid2}, Spread: ${spread2.toFixed(
                  4
                )}%`
              );

              this.opportunities.push(opportunity);
              await this.executeArbitrage(opportunity);
            }
          }
        }
      }
    } catch (error) {
      logger.error("Error checking arbitrage opportunities:", error);
    }
  }

  /**
   * Get the best price from an exchange orderbook
   * @param {string} pair - Trading pair
   * @param {string} exchangeName - Exchange name
   * @param {string} type - Price type (bid or ask)
   */
  getBestPrice(pair, exchangeName, type) {
    try {
      if (!this.orderbooks[pair] || !this.orderbooks[pair][exchangeName]) {
        return null;
      }

      const orderbook = this.orderbooks[pair][exchangeName];

      if (type === "bid") {
        // Best bid is the highest price someone is willing to buy at
        return orderbook.bids[0]?.price || null;
      } else if (type === "ask") {
        // Best ask is the lowest price someone is willing to sell at
        return orderbook.asks[0]?.price || null;
      }

      return null;
    } catch (error) {
      logger.error(
        `Error getting best ${type} price for ${pair} on ${exchangeName}:`,
        error
      );
      return null;
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
  getPerformance() {
    return {
      runningTime: this.running ? Date.now() - this.startTime : 0,
      totalTrades: this.performance.totalTrades,
      successfulTrades: this.performance.successfulTrades,
      failedTrades: this.performance.failedTrades,
      totalProfit: this.performance.totalProfit,
      startBalance: this.performance.startBalance,
      currentBalance: this.performance.currentBalance,
    };
  }
}

module.exports = { ArbitrageBot };
