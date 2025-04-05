const Binance = require("node-binance-api");
const logger = require("../utils/logger");
const { formatPair } = require("../utils/pairFormatter");

class BinanceConnector {
  constructor(apiKey, apiSecret) {
    this.exchange = new Binance().options({
      APIKEY: apiKey,
      APISECRET: apiSecret,
      useServerTime: true,
      recvWindow: 60000,
    });
    this.name = "Binance";
  }

  /**
   * Initialize the connector
   */
  async init() {
    try {
      await this.exchange.useServerTime();
      logger.info("Binance connector initialized");
      return true;
    } catch (error) {
      logger.error("Error initializing Binance connector:", error);
      return false;
    }
  }

  /**
   * Get current account balances
   */
  async getBalances() {
    try {
      const balances = await this.exchange.balance();
      // Filter out assets with zero balance
      const filteredBalances = {};
      for (const [asset, balance] of Object.entries(balances)) {
        if (
          parseFloat(balance.available) > 0 ||
          parseFloat(balance.onOrder) > 0
        ) {
          filteredBalances[asset] = {
            available: parseFloat(balance.available),
            onOrder: parseFloat(balance.onOrder),
          };
        }
      }
      return filteredBalances;
    } catch (error) {
      logger.error("Error getting Binance balances:", error);
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
      const formattedPair = formatPair(pair, "binance");
      const depth = await this.exchange.depth(formattedPair, { limit });

      return {
        exchange: this.name,
        pair,
        bids: depth.bids.map((bid) => ({
          price: parseFloat(bid[0]),
          quantity: parseFloat(bid[1]),
        })),
        asks: depth.asks.map((ask) => ({
          price: parseFloat(ask[0]),
          quantity: parseFloat(ask[1]),
        })),
      };
    } catch (error) {
      logger.error(`Error getting Binance orderbook for ${pair}:`, error);
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
      const formattedPair = formatPair(pair, "binance");
      let result;

      if (isQuoteAsset) {
        // Buy using quote asset quantity (USDT amount)
        result = await this.exchange.marketBuy(formattedPair, false, {
          quoteOrderQty: quantity,
        });
      } else {
        // Buy using base asset quantity (BTC amount)
        result = await this.exchange.marketBuy(formattedPair, quantity);
      }

      logger.info(
        `Binance market buy order executed: ${pair}, quantity: ${quantity}, result:`,
        result
      );
      return {
        success: true,
        orderId: result.orderId,
        executedQty: parseFloat(result.executedQty),
        price: parseFloat(
          result.fills.reduce(
            (avg, fill) => avg + parseFloat(fill.price) * parseFloat(fill.qty),
            0
          ) /
            result.fills.reduce(
              (total, fill) => total + parseFloat(fill.qty),
              0
            )
        ),
      };
    } catch (error) {
      logger.error(`Error executing Binance market buy for ${pair}:`, error);
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
      const formattedPair = formatPair(pair, "binance");
      const result = await this.exchange.marketSell(formattedPair, quantity);

      logger.info(
        `Binance market sell order executed: ${pair}, quantity: ${quantity}, result:`,
        result
      );
      return {
        success: true,
        orderId: result.orderId,
        executedQty: parseFloat(result.executedQty),
        price: parseFloat(
          result.fills.reduce(
            (avg, fill) => avg + parseFloat(fill.price) * parseFloat(fill.qty),
            0
          ) /
            result.fills.reduce(
              (total, fill) => total + parseFloat(fill.qty),
              0
            )
        ),
      };
    } catch (error) {
      logger.error(`Error executing Binance market sell for ${pair}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Setup websocket connection for orderbook updates
   * @param {string} pair - Trading pair in format BTC/USDT
   * @param {function} callback - Callback function for orderbook updates
   */
  setupOrderBookWebSocket(pair, callback) {
    try {
      const formattedPair = formatPair(pair, "binance").toLowerCase();
      const endpoint = `${formattedPair}@depth10@100ms`;

      this.exchange.websockets.depth(formattedPair, (depth) => {
        const orderBook = {
          exchange: this.name,
          pair,
          bids: depth.bids.map((bid) => ({
            price: parseFloat(bid[0]),
            quantity: parseFloat(bid[1]),
          })),
          asks: depth.asks.map((ask) => ({
            price: parseFloat(ask[0]),
            quantity: parseFloat(ask[1]),
          })),
        };
        callback(orderBook);
      });

      logger.info(`Binance websocket established for ${pair}`);
      return true;
    } catch (error) {
      logger.error(`Error setting up Binance websocket for ${pair}:`, error);
      return false;
    }
  }

  /**
   * Close all websocket connections
   */
  closeWebSockets() {
    try {
      this.exchange.websockets.terminate();
      logger.info("Binance websockets closed");
      return true;
    } catch (error) {
      logger.error("Error closing Binance websockets:", error);
      return false;
    }
  }
}

module.exports = { BinanceConnector };
