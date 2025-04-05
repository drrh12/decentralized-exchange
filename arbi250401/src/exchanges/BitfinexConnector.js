const { RESTv2, WSv2, Order } = require("bitfinex-api-node");
const logger = require("../utils/logger");
const { formatPair } = require("../utils/pairFormatter");
const WebSocket = require("ws");
const axios = require("axios");

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
      // Extrair a base e a moeda de cotação
      const [baseCurrency, quoteCurrency] = pair.split("/");

      if (!baseCurrency || !quoteCurrency) {
        logger.error(`Invalid pair format: ${pair}`);
        return null;
      }

      // Mapeamento específico para pares comuns
      const knownPairs = {
        "BTC/USDT": "tBTCUSD",
        "ETH/USDT": "tETHUSD",
        "SOL/USDT": "tSOLUSD",
        "MATIC/USDT": "tMATICUSD", // Nota: Este pode não ser suportado pela Bitfinex
      };

      // Verificar se é um par conhecido e retornar o formato específico
      if (knownPairs[pair]) {
        return knownPairs[pair];
      }

      // Para outros pares, formatar seguindo o padrão
      // Bitfinex geralmente usa 'usd' em vez de 'usdt'
      const base = baseCurrency.toUpperCase();
      const quote =
        quoteCurrency === "USDT" ? "USD" : quoteCurrency.toUpperCase();

      // Adicionar o prefixo 't' (requerido para a API da Bitfinex)
      return `t${base}${quote}`;
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

      // Ignorar pares não suportados na Bitfinex
      if (pair === "MATIC/USDT") {
        logger.warn(`Bitfinex não suporta o par ${pair}`);
        return {
          exchange: this.name,
          pair,
          bids: [],
          asks: [],
        };
      }

      // Usar axios para acessar diretamente a API pública
      // Esta abordagem funcionou nos testes
      const url = `https://api-pub.bitfinex.com/v2/ticker/${symbol}`;

      try {
        const response = await axios.get(url);

        if (
          !response.data ||
          !Array.isArray(response.data) ||
          response.data.length < 10
        ) {
          logger.warn(
            `Empty or invalid ticker data from Bitfinex for ${pair} (${symbol})`
          );
          return {
            exchange: this.name,
            pair,
            bids: [],
            asks: [],
          };
        }

        // Bitfinex ticker retorna um array com várias informações:
        // [
        //  0: BID,            1: BID_SIZE,
        //  2: ASK,            3: ASK_SIZE,
        //  4: DAILY_CHANGE,   5: DAILY_CHANGE_RELATIVE,
        //  6: LAST_PRICE,     7: VOLUME,
        //  8: HIGH,           9: LOW
        // ]
        const bestBid = parseFloat(response.data[0]);
        const bestBidSize = parseFloat(response.data[1]);
        const bestAsk = parseFloat(response.data[2]);
        const bestAskSize = parseFloat(response.data[3]);

        logger.info(
          `Bitfinex ticker data for ${pair}: BID=${bestBid}, ASK=${bestAsk}`
        );

        // Criar um orderbook simplificado com o melhor bid e ask
        return {
          exchange: this.name,
          pair,
          bids: [{ price: bestBid, quantity: bestBidSize }],
          asks: [{ price: bestAsk, quantity: bestAskSize }],
        };
      } catch (axiosError) {
        // Capturar especificamente erros do axios
        logger.warn(
          `API call failed for Bitfinex ${pair} (${symbol}): ${axiosError.message}`
        );
        return {
          exchange: this.name,
          pair,
          bids: [],
          asks: [],
        };
      }
    } catch (error) {
      logger.error(`Error getting Bitfinex orderbook for ${pair}:`, error);
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

      // Using the direct WebSocket approach instead of the WSv2 class
      // which seems to be having issues with orderbook data handling
      const wsURL = "wss://api-pub.bitfinex.com/ws/2";

      const ws = new WebSocket(wsURL);

      ws.on("open", () => {
        logger.info(`Bitfinex websocket opened for ${pair}`);

        // Subscribe to orderbook
        const msg = JSON.stringify({
          event: "subscribe",
          channel: "book",
          symbol: symbol,
          prec: "P0",
          freq: "F0",
          len: "25",
        });

        ws.send(msg);
      });

      // Channel ID and orderbook data storage
      let channelId = null;
      const orderbookData = {
        bids: [],
        asks: [],
      };

      ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data);

          // Handle subscription confirmation
          if (msg.event === "subscribed" && msg.channel === "book") {
            channelId = msg.chanId;
            logger.info(
              `Subscribed to Bitfinex orderbook for ${pair}, channel ID: ${channelId}`
            );
            return;
          }

          // Handle orderbook updates
          if (Array.isArray(msg) && msg[0] === channelId) {
            // Snapshot
            if (Array.isArray(msg[1]) && Array.isArray(msg[1][0])) {
              orderbookData.bids = [];
              orderbookData.asks = [];

              msg[1].forEach((item) => {
                const [price, count, amount] = item;
                if (amount > 0) {
                  // Bid
                  orderbookData.bids.push({
                    price: parseFloat(price),
                    quantity: parseFloat(amount),
                  });
                } else if (amount < 0) {
                  // Ask
                  orderbookData.asks.push({
                    price: parseFloat(price),
                    quantity: parseFloat(Math.abs(amount)),
                  });
                }
              });

              // Sort bids (descending) and asks (ascending)
              orderbookData.bids.sort((a, b) => b.price - a.price);
              orderbookData.asks.sort((a, b) => a.price - b.price);

              // Limit to top entries
              orderbookData.bids = orderbookData.bids.slice(0, 10);
              orderbookData.asks = orderbookData.asks.slice(0, 10);

              // Send the orderbook to the callback
              callback({
                exchange: this.name,
                pair,
                bids: orderbookData.bids,
                asks: orderbookData.asks,
              });
            }
            // Update
            else if (Array.isArray(msg[1]) && msg[1].length === 3) {
              const [price, count, amount] = msg[1];

              // Count = 0 means delete the price level
              if (count === 0) {
                if (amount === 1) {
                  // Remove from bids
                  const index = orderbookData.bids.findIndex(
                    (bid) => bid.price === price
                  );
                  if (index !== -1) {
                    orderbookData.bids.splice(index, 1);
                  }
                } else if (amount === -1) {
                  // Remove from asks
                  const index = orderbookData.asks.findIndex(
                    (ask) => ask.price === price
                  );
                  if (index !== -1) {
                    orderbookData.asks.splice(index, 1);
                  }
                }
              } else {
                if (amount > 0) {
                  // Update or add to bids
                  const index = orderbookData.bids.findIndex(
                    (bid) => bid.price === price
                  );
                  if (index !== -1) {
                    orderbookData.bids[index].quantity = amount;
                  } else {
                    orderbookData.bids.push({
                      price: parseFloat(price),
                      quantity: parseFloat(amount),
                    });
                    orderbookData.bids.sort((a, b) => b.price - a.price);
                    orderbookData.bids = orderbookData.bids.slice(0, 10);
                  }
                } else if (amount < 0) {
                  // Update or add to asks
                  const index = orderbookData.asks.findIndex(
                    (ask) => ask.price === price
                  );
                  if (index !== -1) {
                    orderbookData.asks[index].quantity = Math.abs(amount);
                  } else {
                    orderbookData.asks.push({
                      price: parseFloat(price),
                      quantity: parseFloat(Math.abs(amount)),
                    });
                    orderbookData.asks.sort((a, b) => a.price - b.price);
                    orderbookData.asks = orderbookData.asks.slice(0, 10);
                  }
                }
              }

              // Send the updated orderbook to the callback
              callback({
                exchange: this.name,
                pair,
                bids: orderbookData.bids,
                asks: orderbookData.asks,
              });
            }
          }
        } catch (err) {
          logger.error(
            `Error parsing Bitfinex websocket message for ${pair}:`,
            err
          );
        }
      });

      ws.on("error", (error) => {
        logger.error(`Bitfinex websocket error for ${pair}:`, error);
      });

      ws.on("close", () => {
        logger.info(`Bitfinex websocket closed for ${pair}`);
        delete this.websockets[pair];
      });

      // Setup ping to keep connection alive
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ event: "ping" }));
        } else {
          clearInterval(pingInterval);
        }
      }, 30000);

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
          if (ws.readyState === WebSocket.OPEN) {
            ws.close();
            logger.info(`Closed Bitfinex websocket for ${pair}`);
          }
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
