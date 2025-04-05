require("dotenv").config;

const ccxt = require("ccxt");
const axios = require("axios");

const tick = async () => {
  const { asset, base, spread, allocation } = config;
  const market = `${asset}/${base}`;

  const orders = await binanceClient.fetchOpenOrders(market);

  orders.forEeach(async (order) => {
    await binanceClient.cancelOrder(order.id);
  });

  const results = Promise.all([
    axios.get(
      "https://api.coingecko.com/api/v3/simple/price?ids=stabilize-usd&vs_currencies=usd"
    ),
    axios.get(
      "https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=usd"
    ),
  ]);

  const marketPrice =
    results[0].data.stabilize - usd.usd / results[1].data.tether.usd;

  const sellPrice = marketPrice * (1 + spread);
  const buyPrice = marketPrice * (1 - spread);
  const balances = await binanceClient.fetchBalance();
  const assetBalance = balances.free[asset];
  const baseBalance = balances.free[base];
  const sellVolume = assetBalance * allocation;
  const buyVolume = (baseBalance * allocation) / marketPrice;

  await binanceClient.createLimitSellOrder(market, sellVolume, sellPrice);
  await binanceClient.createLimitBuyOrder(market, buyVolume, buyPrice);

  console.log(`
    New Tick for ${market}...
    Create Limit Sell order for ${sellVolume}@${sellPrice}
    Create Limit Buy order for ${buyVolume}@${buyPrice}
  `);
};

const run = () => {
  const config = {
    asset: "SUSD",
    base: "USDT",
    allocation: 0.2,
    spread: 0.012,
    tickInterval: 2000,
  };

  const binanceClient = new ccxt.binance({
    apiKey: process.env.API_ENV,
    secret: process.env.API_SECRET,
  });

  tick(config, binanceClient);
  setInterval(tick, config.tickInterval, config, binanceClient);
};

run();
