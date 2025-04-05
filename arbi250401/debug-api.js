const axios = require("axios");
const logger = require("./src/utils/logger");

async function testBinanceAPI() {
  try {
    logger.info("Testando API pública da Binance...");
    const pair = "BTCUSDT"; // Apenas BTC/USDT

    try {
      logger.info(`Testando símbolo ${pair}...`);
      const url = `https://api.binance.com/api/v3/depth?symbol=${pair}&limit=5`;
      logger.info(`URL: ${url}`);

      const response = await axios.get(url);

      if (response.data && response.data.bids && response.data.asks) {
        const bestBid = parseFloat(response.data.bids[0][0]);
        const bestAsk = parseFloat(response.data.asks[0][0]);

        logger.info(`✅ Dados válidos recebidos para ${pair}`);
        logger.info(`- Melhor bid: ${bestBid}`);
        logger.info(`- Melhor ask: ${bestAsk}`);
        logger.info(`- Spread: ${((bestAsk / bestBid - 1) * 100).toFixed(6)}%`);
      } else {
        logger.error(`❌ Dados inválidos recebidos para ${pair}`);
      }
    } catch (error) {
      logger.error(`❌ Erro ao acessar API para ${pair}:`, error.message);
      if (error.response) {
        logger.error(
          `Status: ${error.response.status}, Dados: ${JSON.stringify(
            error.response.data
          )}`
        );
      }
    }

    logger.info("\nTestando API pública da Bitfinex...");
    const bitfinexPair = "tBTCUSD"; // Apenas BTC/USD

    try {
      logger.info(`Testando símbolo ${bitfinexPair}...`);
      const url = `https://api-pub.bitfinex.com/v2/ticker/${bitfinexPair}`;
      logger.info(`URL: ${url}`);

      const response = await axios.get(url);

      if (
        response.data &&
        Array.isArray(response.data) &&
        response.data.length >= 10
      ) {
        // [BID, BID_SIZE, ASK, ASK_SIZE, DAILY_CHANGE, ...]
        const bestBid = parseFloat(response.data[0]);
        const bestAsk = parseFloat(response.data[2]);

        logger.info(`✅ Dados válidos recebidos para ${bitfinexPair}`);
        logger.info(`- Melhor bid: ${bestBid}`);
        logger.info(`- Melhor ask: ${bestAsk}`);
        logger.info(`- Spread: ${((bestAsk / bestBid - 1) * 100).toFixed(6)}%`);
      } else {
        logger.error(`❌ Dados inválidos recebidos para ${bitfinexPair}`);
      }
    } catch (error) {
      logger.error(
        `❌ Erro ao acessar API para ${bitfinexPair}:`,
        error.message
      );
      if (error.response) {
        logger.error(
          `Status: ${error.response.status}, Dados: ${JSON.stringify(
            error.response.data
          )}`
        );
      }
    }

    logger.info("\nTeste concluído com sucesso!");
  } catch (error) {
    logger.error("Erro geral:", error);
  }
}

// Executar teste
testBinanceAPI()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    logger.error("Erro fatal:", err);
    process.exit(1);
  });
