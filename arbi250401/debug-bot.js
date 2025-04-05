require("dotenv").config();
const { BitfinexConnector } = require("./src/exchanges/BitfinexConnector");
const logger = require("./src/utils/logger");
const axios = require("axios");

async function testBitfinexFormats() {
  try {
    logger.info("Testando formatos diferentes para símbolos da Bitfinex...");

    const pairs = [
      {
        original: "BTC/USDT",
        formats: ["tBTCUSD", "BTCUSD", "tBTCUSDT", "BTCUSDT"],
      },
      {
        original: "ETH/USDT",
        formats: ["tETHUSD", "ETHUSD", "tETHUSDT", "ETHUSDT"],
      },
    ];

    for (const pair of pairs) {
      logger.info(`Testando formatos para ${pair.original}`);

      for (const format of pair.formats) {
        try {
          // Tentar obter dados diretamente da API pública sem precisar de API keys
          logger.info(`Tentando formato: ${format}`);
          const url = `https://api-pub.bitfinex.com/v2/ticker/${format}`;
          const response = await axios.get(url);

          if (response.data && Array.isArray(response.data)) {
            logger.info(`✅ Formato ${format} funciona! Dados recebidos:`);

            // Extrair dados relevantes
            const bestBid = parseFloat(response.data[0]);
            const bestAsk = parseFloat(response.data[2]);

            logger.info(`   - Melhor bid: ${bestBid}`);
            logger.info(`   - Melhor ask: ${bestAsk}`);
          } else {
            logger.error(`❌ Formato ${format} não retornou dados válidos`);
          }
        } catch (error) {
          logger.error(`❌ Formato ${format} não funciona: ${error.message}`);
        }

        // Pequena pausa entre requisições
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    logger.info("Teste de formatos concluído!");
  } catch (error) {
    logger.error("Erro durante o teste de formatos:", error);
  }
}

async function testBitfinexConnection() {
  try {
    logger.info("Testando conexão com Bitfinex...");

    // Inicializar o conector
    const bitfinex = new BitfinexConnector(
      process.env.BITFINEX_API_KEY,
      process.env.BITFINEX_API_SECRET
    );

    // Testar inicialização
    const initialized = await bitfinex.init();
    if (!initialized) {
      logger.error("Falha na inicialização do Bitfinex");
      return;
    }

    // Testar obtenção de orderbook
    const pairs = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "MATIC/USDT"];

    for (const pair of pairs) {
      logger.info(`Testando formatação de símbolo para ${pair}`);
      const symbol = bitfinex.formatSymbol(pair);
      logger.info(`Símbolo formatado: ${symbol}`);

      logger.info(`Obtendo orderbook para ${pair}`);
      const orderbook = await bitfinex.getOrderBook(pair);

      if (
        orderbook &&
        orderbook.bids &&
        orderbook.asks &&
        orderbook.bids.length > 0 &&
        orderbook.asks.length > 0
      ) {
        logger.info(`✅ Orderbook para ${pair} obtido com sucesso:`);
        logger.info(`- Melhor bid: ${orderbook.bids[0]?.price || "N/A"}`);
        logger.info(`- Melhor ask: ${orderbook.asks[0]?.price || "N/A"}`);
      } else {
        logger.error(`❌ Falha ao obter orderbook para ${pair}`);
      }

      // Pequena pausa entre requisições
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    logger.info("Teste concluído!");
  } catch (error) {
    logger.error("Erro durante o teste:", error);
  }
}

// Executar o teste do conector
testBitfinexConnection().catch((error) => {
  logger.error("Erro fatal:", error);
});
