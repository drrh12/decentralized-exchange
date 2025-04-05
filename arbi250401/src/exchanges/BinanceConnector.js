const Binance = require("node-binance-api");
const axios = require("axios");
const logger = require("../utils/logger");
const { formatPair } = require("../utils/pairFormatter");

class BinanceConnector {
  constructor(apiKey, apiSecret) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.name = "Binance";
    this.binance = new Binance().options({
      APIKEY: this.apiKey,
      APISECRET: this.apiSecret,
      useServerTime: true,
      recvWindow: 60000,
    });
    this.websockets = {};
    this.baseUrl = "https://api.binance.com";
  }

  /**
   * Initialize the connector
   */
  async init() {
    try {
      // Test API connection by getting account info
      await this.binance.useServerTime();
      logger.info("Binance connector initialized");
      return true;
    } catch (error) {
      logger.error("Error initializing Binance connector:", error);
      return false;
    }
  }

  /**
   * Format symbol for Binance
   * @param {string} pair - Trading pair
   * @returns {string} - Formatted symbol
   */
  formatSymbol(pair) {
    try {
      return formatPair(pair, "binance");
    } catch (error) {
      logger.error(`Error formatting symbol for Binance: ${pair}`, error);
      return null;
    }
  }

  /**
   * Get current account balances
   */
  async getBalances() {
    try {
      // Get account info with balances
      const accountInfo = await this.binance.balance();

      // Filter out assets with zero balance
      const filteredBalances = {};
      for (const [asset, balance] of Object.entries(accountInfo)) {
        const available = parseFloat(balance.available);
        const onOrder = parseFloat(balance.onOrder);

        if (available > 0 || onOrder > 0) {
          filteredBalances[asset] = {
            available: available,
            onOrder: onOrder,
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
   * Get orderbook data for a trading pair using direct API call with axios
   * @param {string} pair - Trading pair in format BTC/USDT
   * @param {number} limit - Number of orderbook entries to fetch
   */
  async getOrderBook(pair, limit = 5) {
    try {
      const symbol = this.formatSymbol(pair);

      // Usar diretamente a API REST pública com axios
      const url = `${this.baseUrl}/api/v3/depth?symbol=${symbol}&limit=${limit}`;

      const response = await axios.get(url, { timeout: 10000 });

      // Verificar se os dados são válidos
      if (
        !response.data ||
        !response.data.bids ||
        !response.data.asks ||
        !Array.isArray(response.data.bids) ||
        !Array.isArray(response.data.asks) ||
        response.data.bids.length === 0 ||
        response.data.asks.length === 0
      ) {
        logger.warn(
          `Empty or invalid orderbook data from Binance API for ${pair}`
        );
        return {
          exchange: this.name,
          pair,
          bids: [],
          asks: [],
        };
      }

      // Formatar os dados do orderbook
      return {
        exchange: this.name,
        pair,
        bids: response.data.bids.slice(0, limit).map(([price, quantity]) => ({
          price: parseFloat(price),
          quantity: parseFloat(quantity),
        })),
        asks: response.data.asks.slice(0, limit).map(([price, quantity]) => ({
          price: parseFloat(price),
          quantity: parseFloat(quantity),
        })),
      };
    } catch (error) {
      logger.error(
        `Error getting Binance orderbook for ${pair}:`,
        error.message
      );
      return {
        exchange: this.name,
        pair,
        bids: [],
        asks: [],
      };
    }
  }

  /**
   * Create a market buy order
   * @param {string} pair - Trading pair in format BTC/USDT
   * @param {number} quantity - Quantity to buy
   * @param {boolean} isQuoteAsset - If true, quantity is in quote asset (USDT), else in base asset (BTC)
   */
  async marketBuy(pair, quantity, isQuoteAsset = false) {
    try {
      const symbol = this.formatSymbol(pair);

      let order;
      if (isQuoteAsset) {
        // Buy using USDT (quote asset) quantity
        order = await this.binance.marketBuy(symbol, false, {
          quoteOrderQty: quantity,
        });
      } else {
        // Buy using BTC (base asset) quantity
        order = await this.binance.marketBuy(symbol, quantity);
      }

      logger.info(
        `Binance market buy order executed: ${pair}, quantity: ${quantity}, result:`,
        order
      );

      return {
        success: true,
        orderId: order.orderId,
        executedQty: parseFloat(order.executedQty),
        price: parseFloat(order.fills[0].price),
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
      const symbol = this.formatSymbol(pair);

      // Execute market sell order
      const order = await this.binance.marketSell(symbol, quantity);

      logger.info(
        `Binance market sell order executed: ${pair}, quantity: ${quantity}, result:`,
        order
      );

      return {
        success: true,
        orderId: order.orderId,
        executedQty: parseFloat(order.executedQty),
        price: parseFloat(order.fills[0].price),
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
      // Devido a problemas com a biblioteca node-binance-api,
      // não vamos usar WebSockets neste momento.
      // Em vez disso, retornaremos false para indicar que o WebSocket não foi configurado.

      logger.info(
        `Binance WebSocket not set up for ${pair} (using REST API fallback)`
      );

      // Retornar false para indicar que o WebSocket não foi configurado
      return false;
    } catch (error) {
      logger.error(`Error setting up Binance websocket for ${pair}:`, error);
      return false;
    }
  }

  /**
   * Close all websocket connections
   */
  async closeWebSockets() {
    try {
      // Binance provides a global method to terminate all websockets
      this.binance.websockets.terminate();
      this.websockets = {};
      logger.info("Binance websockets closed");
      return true;
    } catch (error) {
      logger.error("Error closing Binance websockets:", error);
      return false;
    }
  }
}

module.exports = { BinanceConnector };
