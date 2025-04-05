const { API } = require("kucoin-node-sdk");
const logger = require("../utils/logger");
const { formatPair } = require("../utils/pairFormatter");
const WebSocket = require("ws");

class KuCoinConnector {
  constructor(apiKey, apiSecret, apiPassphrase) {
    this.initialized = false;
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.apiPassphrase = apiPassphrase;
    this.name = "KuCoin";
    this.websockets = {};
  }

  /**
   * Initialize the connector
   */
  async init() {
    try {
      API.init({
        baseUrl: "https://api.kucoin.com",
        apiAuth: {
          key: this.apiKey,
          secret: this.apiSecret,
          passphrase: this.apiPassphrase,
        },
        authVersion: 2, // KC-API-KEY-VERSION: 2
      });
      this.initialized = true;
      logger.info("KuCoin connector initialized");
      return true;
    } catch (error) {
      logger.error("Error initializing KuCoin connector:", error);
      return false;
    }
  }

  /**
   * Get current account balances
   */
  async getBalances() {
    try {
      if (!this.initialized) await this.init();

      const response = await API.rest.User.Account.getAccountsList();
      if (!response.data) throw new Error("No data returned from KuCoin API");

      // Filter out assets with zero balance
      const filteredBalances = {};
      for (const account of response.data) {
        const available = parseFloat(account.available);
        const holds = parseFloat(account.holds);

        if (available > 0 || holds > 0) {
          filteredBalances[account.currency] = {
            available,
            onOrder: holds,
          };
        }
      }

      return filteredBalances;
    } catch (error) {
      logger.error("Error getting KuCoin balances:", error);
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
      if (!this.initialized) await this.init();

      const formattedPair = formatPair(pair, "kucoin");
      const response = await API.rest.Market.OrderBook.getLevel2(formattedPair);

      if (!response.data) throw new Error("No data returned from KuCoin API");

      return {
        exchange: this.name,
        pair,
        bids: response.data.bids.slice(0, limit).map((bid) => ({
          price: parseFloat(bid[0]),
          quantity: parseFloat(bid[1]),
        })),
        asks: response.data.asks.slice(0, limit).map((ask) => ({
          price: parseFloat(ask[0]),
          quantity: parseFloat(ask[1]),
        })),
      };
    } catch (error) {
      logger.error(`Error getting KuCoin orderbook for ${pair}:`, error);
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
      if (!this.initialized) await this.init();

      const formattedPair = formatPair(pair, "kucoin");

      const orderParams = {
        symbol: formattedPair,
        side: "buy",
        type: "market",
      };

      if (isQuoteAsset) {
        // Buy using quote asset quantity (USDT amount)
        orderParams.funds = quantity.toString();
      } else {
        // Buy using base asset quantity (BTC amount)
        orderParams.size = quantity.toString();
      }

      const response = await API.rest.Trade.Orders.postOrder(orderParams);

      if (!response.data) throw new Error("No data returned from KuCoin API");

      // Get order details after execution
      const orderId = response.data.orderId;
      const orderDetails = await API.rest.Trade.Orders.getOrderByID(orderId);

      logger.info(
        `KuCoin market buy order executed: ${pair}, quantity: ${quantity}, result:`,
        orderDetails.data
      );

      return {
        success: true,
        orderId: orderId,
        executedQty: parseFloat(orderDetails.data.dealSize || 0),
        price:
          parseFloat(orderDetails.data.dealFunds || 0) /
          parseFloat(orderDetails.data.dealSize || 1),
      };
    } catch (error) {
      logger.error(`Error executing KuCoin market buy for ${pair}:`, error);
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
      if (!this.initialized) await this.init();

      const formattedPair = formatPair(pair, "kucoin");

      const orderParams = {
        symbol: formattedPair,
        side: "sell",
        type: "market",
        size: quantity.toString(),
      };

      const response = await API.rest.Trade.Orders.postOrder(orderParams);

      if (!response.data) throw new Error("No data returned from KuCoin API");

      // Get order details after execution
      const orderId = response.data.orderId;
      const orderDetails = await API.rest.Trade.Orders.getOrderByID(orderId);

      logger.info(
        `KuCoin market sell order executed: ${pair}, quantity: ${quantity}, result:`,
        orderDetails.data
      );

      return {
        success: true,
        orderId: orderId,
        executedQty: parseFloat(orderDetails.data.dealSize || 0),
        price:
          parseFloat(orderDetails.data.dealFunds || 0) /
          parseFloat(orderDetails.data.dealSize || 1),
      };
    } catch (error) {
      logger.error(`Error executing KuCoin market sell for ${pair}:`, error);
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
      if (!this.initialized) await this.init();

      const formattedPair = formatPair(pair, "kucoin");

      // Get websocket endpoint info
      const response = await API.rest.WebSockets.getPublicToken();
      if (!response.data)
        throw new Error("Failed to get KuCoin websocket token");

      const { token, instanceServers } = response.data;
      const wsEndpoint = `${
        instanceServers[0].endpoint
      }?token=${token}&connectId=${Date.now()}`;

      // Create websocket connection
      const ws = new WebSocket(wsEndpoint);

      ws.on("open", () => {
        logger.info(`KuCoin websocket opened for ${pair}`);

        // Subscribe to market depth
        const subscribeMessage = {
          id: Date.now(),
          type: "subscribe",
          topic: `/market/level2:${formattedPair}`,
          privateChannel: false,
          response: true,
        };

        ws.send(JSON.stringify(subscribeMessage));
      });

      ws.on("message", (data) => {
        const message = JSON.parse(data);

        // Handle order book updates
        if (message.type === "message" && message.subject === "level2") {
          const orderBook = {
            exchange: this.name,
            pair,
            bids: message.data.bids.slice(0, 10).map((bid) => ({
              price: parseFloat(bid[0]),
              quantity: parseFloat(bid[1]),
            })),
            asks: message.data.asks.slice(0, 10).map((ask) => ({
              price: parseFloat(ask[0]),
              quantity: parseFloat(ask[1]),
            })),
          };

          callback(orderBook);
        }
      });

      ws.on("error", (error) => {
        logger.error(`KuCoin websocket error for ${pair}:`, error);
      });

      ws.on("close", () => {
        logger.info(`KuCoin websocket closed for ${pair}`);
        delete this.websockets[pair];
      });

      // Store the websocket connection
      this.websockets[pair] = ws;

      // Set up ping interval to keep connection alive
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ id: Date.now(), type: "ping" }));
        } else {
          clearInterval(pingInterval);
        }
      }, 30000);

      return true;
    } catch (error) {
      logger.error(`Error setting up KuCoin websocket for ${pair}:`, error);
      return false;
    }
  }

  /**
   * Close all websocket connections
   */
  closeWebSockets() {
    try {
      Object.values(this.websockets).forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      });

      this.websockets = {};
      logger.info("KuCoin websockets closed");
      return true;
    } catch (error) {
      logger.error("Error closing KuCoin websockets:", error);
      return false;
    }
  }
}

module.exports = { KuCoinConnector };
