require("dotenv").config();
const { BinanceConnector } = require("./src/exchanges/BinanceConnector");
const logger = require("./src/utils/logger");
const axios = require("axios");

// Configurar o conector
const binance = new BinanceConnector(
  process.env.BINANCE_API_KEY,
  process.env.BINANCE_API_SECRET
);

async function testOrderBookImplementation() {
  try {
    logger.info(
      "Testando implementação do getOrderBook usando axios na Binance..."
    );

    // Inicializar o conector
    const initResult = await binance.init();
    logger.info(
      `Inicialização do conector Binance: ${initResult ? "SUCESSO" : "FALHA"}`
    );

    if (!initResult) {
      logger.error("Falha na inicialização, verificar credenciais API");
      return;
    }

    // Testar obtenção de orderbook apenas para BTC/USDT
    const pair = "BTC/USDT";

    try {
      logger.info(`\nTestando obtenção do orderbook para ${pair}...`);
      const symbol = binance.formatSymbol(pair);
      logger.info(`Símbolo formatado para Binance: ${symbol}`);

      // Testar chamada direta à API para comparação
      const url = `https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=5`;
      logger.info(`Testando chamada direta à API: ${url}`);

      const directApiResponse = await axios.get(url);

      if (
        directApiResponse.data &&
        directApiResponse.data.bids &&
        directApiResponse.data.asks
      ) {
        const bestBid = parseFloat(directApiResponse.data.bids[0][0]);
        const bestAsk = parseFloat(directApiResponse.data.asks[0][0]);

        logger.info(`✅ API Direta: Dados válidos para ${pair}`);
        logger.info(`   - Melhor bid: ${bestBid}`);
        logger.info(`   - Melhor ask: ${bestAsk}`);
        logger.info(
          `   - Spread: ${((bestAsk / bestBid - 1) * 100).toFixed(6)}%`
        );

        // Agora testar o método getOrderBook do connector
        logger.info(`\nTestando método getOrderBook para ${pair}...`);
        const orderbook = await binance.getOrderBook(pair);

        if (
          orderbook &&
          orderbook.bids &&
          orderbook.asks &&
          orderbook.bids.length > 0 &&
          orderbook.asks.length > 0
        ) {
          logger.info(`✅ getOrderBook: Dados válidos para ${pair}`);
          logger.info(`   - Melhor bid: ${orderbook.bids[0].price}`);
          logger.info(`   - Melhor ask: ${orderbook.asks[0].price}`);
          logger.info(
            `   - Spread: ${(
              (orderbook.asks[0].price / orderbook.bids[0].price - 1) *
              100
            ).toFixed(6)}%`
          );

          // Verificar se os dados estão consistentes
          if (
            Math.abs(bestBid - orderbook.bids[0].price) < 0.01 &&
            Math.abs(bestAsk - orderbook.asks[0].price) < 0.01
          ) {
            logger.info(
              `✅ Verificação de consistência: PASSOU - Dados da API direta e do método getOrderBook são consistentes`
            );
          } else {
            logger.warn(
              `⚠️ Verificação de consistência: FALHOU - Dados inconsistentes entre API direta e método getOrderBook`
            );
          }
        } else {
          logger.error(
            `❌ getOrderBook: Não retornou dados válidos para ${pair}`
          );
        }
      } else {
        logger.error(`❌ API Direta: Dados inválidos para ${pair}`);
      }
    } catch (error) {
      logger.error(`❌ Erro ao testar ${pair}:`, error.message);
    }

    logger.info("\nTeste concluído!");
    logger.info(
      "Se o teste da API direta passou, mas o getOrderBook falhou, verifique a implementação do método."
    );
  } catch (error) {
    logger.error("Erro durante o teste:", error);
  }
}

// Executar teste
testOrderBookImplementation()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    logger.error("Erro fatal:", err);
    process.exit(1);
  });
