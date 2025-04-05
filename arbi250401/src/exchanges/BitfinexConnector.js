const { RESTv2, WSv2, Order } = require("bitfinex-api-node");
const logger = require("../utils/logger");
const { formatPair } = require("../utils/pairFormatter");
const WebSocket = require("ws");

class BitfinexConnector {
  constructor(apiKey, apiSecret) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.name = "Bitfinex";
    this.rest = new RESTv2({
      apiKey: this.apiKey,
      apiSecret: this.apiSecret,
      transform: true,
    });
    this.websockets = {};
  }

  /**
   * Initialize the connector
   */
  async init() {
    try {
      // Test API connection by getting platform status
      const status = await this.rest.status();
      if (status !== "operative") {
        logger.warn(`Bitfinex platform status is: ${status}`);
      }
      logger.info("Bitfinex connector initialized");
      return true;
    } catch (error) {
      logger.error("Error initializing Bitfinex connector:", error);
      return false;
    }
  }

  /**
   * Format symbol for Bitfinex
   * @param {string} pair - Trading pair
   * @returns {string} - Formatted symbol
   */
  formatSymbol(pair) {
    try {
      // Bitfinex requires a special format: tBTCUSD, tETHUSD, etc.
      const formattedPair = formatPair(pair, "bitfinex");
      return `t${formattedPair}`;
    } catch (error) {
      logger.error(`Error formatting symbol for Bitfinex: ${pair}`, error);
      return null;
    }
  }

  /**
   * Get current account balances
   */
  async getBalances() {
    try {
      // Get wallet balances (exchange wallet)
      const wallets = await this.rest.wallets();

      // Filter out assets with zero balance
      const filteredBalances = {};
      for (const wallet of wallets) {
        if (wallet.type === "exchange") {
          const asset = wallet.currency.toUpperCase();
          const available = parseFloat(wallet.balance);

          if (available > 0) {
            filteredBalances[asset] = {
              available: available,
              onOrder: 0, // Bitfinex doesn't directly expose on-order amounts, we'd need an extra call
            };
          }
        }
      }

      return filteredBalances;
    } catch (error) {
      logger.error("Error getting Bitfinex balances:", error);
      return {};
    }
  }

  /**
   * Get orderbook data for a trading pair
   * @param {string} pair - Trading pair in format BTC/USDT
   * @param {number} limit - Number of orderbook entries to fetch
   */
  async getOrderBook(pair, limit = 5) {
    try {
      const symbol = this.formatSymbol(pair);
      const orderbook = await this.rest.orderBook(symbol, { limit: limit });

      // Bitfinex returns two arrays, bids and asks
      const bids = orderbook
        .filter((entry) => entry.amount > 0)
        .slice(0, limit);
      const asks = orderbook
        .filter((entry) => entry.amount < 0)
        .map((entry) => ({ ...entry, amount: Math.abs(entry.amount) }))
        .slice(0, limit);

      return {
        exchange: this.name,
        pair,
        bids: bids.map((bid) => ({
          price: parseFloat(bid.price),
          quantity: parseFloat(bid.amount),
        })),
        asks: asks.map((ask) => ({
          price: parseFloat(ask.price),
          quantity: parseFloat(ask.amount),
        })),
      };
    } catch (error) {
      logger.error(`Error getting Bitfinex orderbook for ${pair}:`, error);
      return null;
    }
  }

  /**
   * Create a market buy order
   * @param {string} pair - Trading pair in format BTC/USDT
   * @param {number} quantity - Quantity to buy
   * @param {boolean} isQuoteAsset - If true, quantity is in quote asset (USDT), else in base asset (BTC)
   */
  async marketBuy(pair, quantity, isQuoteAsset = true) {
    try {
      const symbol = this.formatSymbol(pair);

      if (isQuoteAsset) {
        // In Bitfinex, we need to convert quote asset amount to base asset amount
        // For market orders with quantity in quote asset, we need to get current price
        const ticker = await this.rest.ticker(symbol);
        const estimatedPrice = parseFloat(ticker[6]); // Last trade price index: 6

        // Calculate base asset amount
        quantity = quantity / estimatedPrice;
      }

      // Execute market buy order (Bitfinex API uses negative amount for sell orders, positive for buy)
      const order = await this.rest.submitOrder({
        symbol: symbol,
        amount: quantity.toString(),
        type: "MARKET",
        price: "0", // Not used for market orders
      });

      logger.info(
        `Bitfinex market buy order executed: ${pair}, quantity: ${quantity}, result:`,
        order
      );

      return {
        success: true,
        orderId: order.id,
        executedQty: parseFloat(order.executed_amount || quantity),
        price: parseFloat(order.avg_execution_price || 0),
      };
    } catch (error) {
      logger.error(`Error executing Bitfinex market buy for ${pair}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create a market sell order
   * @param {string} pair - Trading pair in format BTC/USDT
   * @param {number} quantity - Quantity to sell (in base asset, e.g., BTC)
   */
  async marketSell(pair, quantity) {
    try {
      const symbol = this.formatSymbol(pair);

      // Execute market sell order (Bitfinex API uses negative amount for sell orders)
      const order = await this.rest.submitOrder({
        symbol: symbol,
        amount: (-quantity).toString(), // Negative for sell
        type: "MARKET",
        price: "0", // Not used for market orders
      });

      logger.info(
        `Bitfinex market sell order executed: ${pair}, quantity: ${quantity}, result:`,
        order
      );

      return {
        success: true,
        orderId: order.id,
        executedQty: parseFloat(Math.abs(order.executed_amount) || quantity),
        price: parseFloat(order.avg_execution_price || 0),
      };
    } catch (error) {
      logger.error(`Error executing Bitfinex market sell for ${pair}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Setup websocket connection for orderbook updates
   * @param {string} pair - Trading pair in format BTC/USDT
   * @param {function} callback - Callback function for orderbook updates
   */
  async setupOrderBookWebSocket(pair, callback) {
    try {
      const symbol = this.formatSymbol(pair);

      // Create websocket client
      const ws = new WSv2({
        apiKey: this.apiKey,
        apiSecret: this.apiSecret,
        manageOrderBooks: true,
      });

      // Connect and subscribe to orderbook
      await ws.open();
      logger.info(`Bitfinex websocket opened for ${pair}`);

      await ws.subscribeOrderBook(symbol, "P0", "25");

      ws.onOrderBook({ symbol }, (orderbook) => {
        // Get the first few entries from the orderbook
        const bids = orderbook.bids.slice(0, 10);
        const asks = orderbook.asks.slice(0, 10);

        const formattedOrderbook = {
          exchange: this.name,
          pair,
          bids: bids.map((bid) => ({
            price: parseFloat(bid[0]),
            quantity: parseFloat(bid[2]),
          })),
          asks: asks.map((ask) => ({
            price: parseFloat(ask[0]),
            quantity: parseFloat(Math.abs(ask[2])),
          })),
        };

        callback(formattedOrderbook);
      });

      // Handle errors
      ws.on("error", (error) => {
        logger.error(`Bitfinex websocket error for ${pair}:`, error);
      });

      // Handle close
      ws.on("close", () => {
        logger.info(`Bitfinex websocket closed for ${pair}`);
        delete this.websockets[pair];
      });

      // Store the websocket connection
      this.websockets[pair] = ws;

      return true;
    } catch (error) {
      logger.error(`Error setting up Bitfinex websocket for ${pair}:`, error);
      return false;
    }
  }

  /**
   * Close all websocket connections
   */
  async closeWebSockets() {
    try {
      for (const [pair, ws] of Object.entries(this.websockets)) {
        try {
          await ws.close();
          logger.info(`Closed Bitfinex websocket for ${pair}`);
        } catch (error) {
          logger.error(`Error closing Bitfinex websocket for ${pair}:`, error);
        }
      }

      this.websockets = {};
      logger.info("Bitfinex websockets closed");
      return true;
    } catch (error) {
      logger.error("Error closing Bitfinex websockets:", error);
      return false;
    }
  }
}

module.exports = { BitfinexConnector };
