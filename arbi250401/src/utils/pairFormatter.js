/**
 * Format a trading pair for a specific exchange
 * @param {string} pair - Trading pair in standard format (BTC/USDT)
 * @param {string} exchange - Exchange name (binance, kucoin, gateio)
 * @returns {string} - Formatted pair for the specified exchange
 */
function formatPair(pair, exchange) {
  // Ensure input is valid
  if (!pair || !exchange) {
    throw new Error("Pair and exchange must be provided");
  }

  // Split pair into base and quote currencies
  const [baseCurrency, quoteCurrency] = pair.split("/");

  if (!baseCurrency || !quoteCurrency) {
    throw new Error(`Invalid pair format: ${pair}. Expected format: BTC/USDT`);
  }

  // Format based on exchange requirements
  switch (exchange.toLowerCase()) {
    case "binance":
      // Binance uses no separator: BTCUSDT
      return `${baseCurrency}${quoteCurrency}`;

    case "kucoin":
      // KuCoin uses dash: BTC-USDT
      return `${baseCurrency}-${quoteCurrency}`;

    case "gateio":
      // GateIo uses underscore: BTC_USDT
      return `${baseCurrency}_${quoteCurrency}`;

    default:
      throw new Error(`Unsupported exchange: ${exchange}`);
  }
}

/**
 * Standardize a pair from exchange-specific format to standard format (BTC/USDT)
 * @param {string} formattedPair - Trading pair in exchange-specific format
 * @param {string} exchange - Exchange name (binance, kucoin, gateio)
 * @returns {string} - Standardized pair (BTC/USDT)
 */
function standardizePair(formattedPair, exchange) {
  // Ensure input is valid
  if (!formattedPair || !exchange) {
    throw new Error("Formatted pair and exchange must be provided");
  }

  let baseCurrency, quoteCurrency;

  // Parse based on exchange format
  switch (exchange.toLowerCase()) {
    case "binance":
      // Binance uses no separator: BTCUSDT
      // Attempt to find known quote currencies
      const quoteCurrencies = ["USDT", "BTC", "ETH", "BNB", "BUSD", "USDC"];
      let matchFound = false;

      for (const quote of quoteCurrencies) {
        if (formattedPair.endsWith(quote)) {
          quoteCurrency = quote;
          baseCurrency = formattedPair.slice(0, -quote.length);
          matchFound = true;
          break;
        }
      }

      if (!matchFound) {
        // If no match found, assume last 4-5 characters are quote currency
        if (formattedPair.length > 5) {
          baseCurrency = formattedPair.slice(0, -4);
          quoteCurrency = formattedPair.slice(-4);
        } else {
          baseCurrency = formattedPair.slice(0, -3);
          quoteCurrency = formattedPair.slice(-3);
        }
      }
      break;

    case "kucoin":
      // KuCoin uses dash: BTC-USDT
      [baseCurrency, quoteCurrency] = formattedPair.split("-");
      break;

    case "gateio":
      // GateIo uses underscore: BTC_USDT
      [baseCurrency, quoteCurrency] = formattedPair.split("_");
      break;

    default:
      throw new Error(`Unsupported exchange: ${exchange}`);
  }

  if (!baseCurrency || !quoteCurrency) {
    throw new Error(
      `Failed to parse pair: ${formattedPair} from exchange ${exchange}`
    );
  }

  // Return standardized format
  return `${baseCurrency}/${quoteCurrency}`;
}

module.exports = {
  formatPair,
  standardizePair,
};
