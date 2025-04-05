require("dotenv").config();
const { ArbitrageBot } = require("./src/ArbitrageBot");
const logger = require("./src/utils/logger");

async function testArbitrageBot() {
  try {
    logger.info("=== TESTE DO BOT DE ARBITRAGEM BINANCE/BITFINEX ===");

    // Configuração para o teste
    const config = {
      minSpreadPercentage: 0.5, // Usar um valor menor para detectar mais oportunidades
      orderSizeUSD: 100,
      checkIntervalMs: 5000,
      paperTrading: true,
      tradingPairs: ["BTC/USDT"], // Simplificado para usar apenas BTC/USDT
    };

    // Inicializar o bot
    const bot = new ArbitrageBot(config);
    logger.info("Bot inicializado com configuração para BTC/USDT");

    // Iniciar o bot
    const startResult = await bot.start();
    if (!startResult) {
      logger.error("Falha ao iniciar o bot de arbitragem");
      return;
    }

    logger.info("Bot iniciado com sucesso!");

    // Verificar os exchangers configurados
    logger.info(`Número de exchangers configurados: ${bot.exchanges.length}`);
    for (const exchange of bot.exchanges) {
      logger.info(`- ${exchange.name}`);
    }

    // Executar verificação única de oportunidades
    logger.info("\nVerificando oportunidades de arbitragem para BTC/USDT...");
    const opportunities = await bot.checkArbitrageOpportunities();

    if (opportunities.length > 0) {
      logger.info(
        `✅ Encontradas ${opportunities.length} oportunidades de arbitragem!`
      );
      for (const opp of opportunities) {
        logger.info(`- Par: ${opp.pair}`);
        logger.info(`  Comprar em: ${opp.buyExchange} a ${opp.buyPrice}`);
        logger.info(`  Vender em: ${opp.sellExchange} a ${opp.sellPrice}`);
        logger.info(`  Spread: ${opp.spread.toFixed(4)}%`);
      }
    } else {
      logger.info(
        "❌ Nenhuma oportunidade de arbitragem encontrada no momento."
      );
    }

    // Iniciar loop de arbitragem por 30 segundos
    logger.info("\nIniciando loop de arbitragem por 30 segundos...");
    bot.runArbitrageLoop();

    // Aguardar 30 segundos
    await new Promise((resolve) => setTimeout(resolve, 30000));

    // Parar o bot
    await bot.stop();
    logger.info("Bot parado com sucesso!");

    // Exibir estatísticas
    const stats = bot.getPerformanceStats();
    logger.info("\n=== ESTATÍSTICAS DE DESEMPENHO ===");
    logger.info(`Total de verificações: ${bot.opportunities.length}`);
    logger.info(`Total de trades: ${stats.totalTrades}`);
    logger.info(`Trades com sucesso: ${stats.successfulTrades}`);
    logger.info(`Trades falhos: ${stats.failedTrades}`);
    logger.info(`Lucro total: ${stats.totalProfit.toFixed(4)} USDT`);
    logger.info(`Taxa de sucesso: ${stats.successRate}`);

    logger.info("Teste completo! Bot simplificado para apenas BTC/USDT.");
  } catch (error) {
    logger.error("Erro durante o teste do bot:", error);
  }
}

// Executar o teste
testArbitrageBot()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    logger.error("Erro fatal:", err);
    process.exit(1);
  });
