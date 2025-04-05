const { ApiClient, SpotApi, Configuration } = require("gate-api");
const WebSocket = require("ws");
const crypto = require("crypto");
const logger = require("../utils/logger");
const { formatPair } = require("../utils/pairFormatter");

class GateIoConnector {
  constructor(apiKey, apiSecret) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.name = "GateIo";
    this.websockets = {};

    // Configure API client
    const config = new Configuration({
      apiKey: this.apiKey,
      secretKey: this.apiSecret,
    });

    this.client = new ApiClient(config);
    this.spotApi = new SpotApi(this.client);
  }

  /**
   * Initialize the connector
   */
  async init() {
    try {
      // Test API connection by getting server time
      await this.spotApi.getServerTime();
      logger.info("GateIo connector initialized");
      return true;
    } catch (error) {
      logger.error("Error initializing GateIo connector:", error);
      return false;
    }
  }

  /**
   * Get current account balances
   */
  async getBalances() {
    try {
      const response = await this.spotApi.listSpotAccounts({});

      // Filter out assets with zero balance
      const filteredBalances = {};
      for (const account of response) {
        const available = parseFloat(account.available);
        const locked = parseFloat(account.locked);

        if (available > 0 || locked > 0) {
          filteredBalances[account.currency] = {
            available,
            onOrder: locked,
          };
        }
      }

      return filteredBalances;
    } catch (error) {
      logger.error("Error getting GateIo balances:", error);
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
      const formattedPair = formatPair(pair, "gateio");
      const response = await this.spotApi.getOrderBook(formattedPair, {
        limit,
      });

      return {
        exchange: this.name,
        pair,
        bids: response.bids
          .slice(0, limit)
          .map((bid) => ({
            price: parseFloat(bid[0]),
            quantity: parseFloat(bid[1]),
          })),
        asks: response.asks
          .slice(0, limit)
          .map((ask) => ({
            price: parseFloat(ask[0]),
            quantity: parseFloat(ask[1]),
          })),
      };
    } catch (error) {
      logger.error(`Error getting GateIo orderbook for ${pair}:`, error);
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
      const formattedPair = formatPair(pair, "gateio");
      const [baseCurrency, quoteCurrency] = pair.split("/");

      const order = {
        currency_pair: formattedPair,
        side: "buy",
        time_in_force: "ioc", // Immediate or cancel
      };

      if (isQuoteAsset) {
        // Buy using quote asset quantity (USDT amount)
        order.type = "market";
        order.amount = "0.0001"; // Small amount required by the API
        order.price = "0"; // Not used for market orders

        // Calculate how much we expect to buy with our quote asset quantity
        const orderbook = await this.getOrderBook(pair);
        if (!orderbook)
          throw new Error("Failed to fetch orderbook for calculation");

        let totalBaseAsset = 0;
        let remainingQuoteAsset = quantity;

        for (const ask of orderbook.asks) {
          const askTotal = ask.price * ask.quantity;
          if (remainingQuoteAsset >= askTotal) {
            totalBaseAsset += ask.quantity;
            remainingQuoteAsset -= askTotal;
          } else {
            totalBaseAsset += remainingQuoteAsset / ask.price;
            break;
          }
        }

        // Set actual amount to buy
        order.amount = totalBaseAsset.toFixed(8);
      } else {
        // Buy using base asset quantity (BTC amount)
        order.type = "market";
        order.amount = quantity.toString();
        order.price = "0";
      }

      const response = await this.spotApi.createOrder(order);

      logger.info(
        `GateIo market buy order executed: ${pair}, quantity: ${quantity}, result:`,
        response
      );

      return {
        success: true,
        orderId: response.id,
        executedQty: parseFloat(response.amount || 0),
        price: parseFloat(response.price || 0),
      };
    } catch (error) {
      logger.error(`Error executing GateIo market buy for ${pair}:`, error);
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
      const formattedPair = formatPair(pair, "gateio");

      const order = {
        currency_pair: formattedPair,
        type: "market",
        side: "sell",
        amount: quantity.toString(),
        price: "0", // Not used for market orders
        time_in_force: "ioc", // Immediate or cancel
      };

      const response = await this.spotApi.createOrder(order);

      logger.info(
        `GateIo market sell order executed: ${pair}, quantity: ${quantity}, result:`,
        response
      );

      return {
        success: true,
        orderId: response.id,
        executedQty: parseFloat(response.amount || 0),
        price: parseFloat(response.price || 0),
      };
    } catch (error) {
      logger.error(`Error executing GateIo market sell for ${pair}:`, error);
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
      const formattedPair = formatPair(pair, "gateio");

      // Create websocket connection
      const ws = new WebSocket("wss://api.gateio.ws/ws/v4/");

      ws.on("open", () => {
        logger.info(`GateIo websocket opened for ${pair}`);

        // Subscribe to order book channel
        const subscribeMessage = {
          time: Math.floor(Date.now() / 1000),
          channel: "spot.order_book",
          event: "subscribe",
          payload: [formattedPair, "100ms", "5"],
        };

        ws.send(JSON.stringify(subscribeMessage));
      });

      ws.on("message", (data) => {
        const message = JSON.parse(data.toString());

        // Handle order book updates
        if (
          message.channel === "spot.order_book" &&
          message.event === "update"
        ) {
          const payload = message.result;

          const orderBook = {
            exchange: this.name,
            pair,
            bids: payload.bids.map((bid) => ({
              price: parseFloat(bid[0]),
              quantity: parseFloat(bid[1]),
            })),
            asks: payload.asks.map((ask) => ({
              price: parseFloat(ask[0]),
              quantity: parseFloat(ask[1]),
            })),
          };

          callback(orderBook);
        }
      });

      ws.on("error", (error) => {
        logger.error(`GateIo websocket error for ${pair}:`, error);
      });

      ws.on("close", () => {
        logger.info(`GateIo websocket closed for ${pair}`);
        delete this.websockets[pair];
      });

      // Store the websocket connection
      this.websockets[pair] = ws;

      // Set up ping interval to keep connection alive
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              time: Math.floor(Date.now() / 1000),
              channel: "",
              event: "ping",
            })
          );
        } else {
          clearInterval(pingInterval);
        }
      }, 30000);

      return true;
    } catch (error) {
      logger.error(`Error setting up GateIo websocket for ${pair}:`, error);
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
      logger.info("GateIo websockets closed");
      return true;
    } catch (error) {
      logger.error("Error closing GateIo websockets:", error);
      return false;
    }
  }
}

module.exports = { GateIoConnector };
