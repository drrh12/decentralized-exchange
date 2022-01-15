require("babel-register");
require("babel-polyfill");
require("dotenv").config();

module.exports = {
  networks: {
    development: {
      host: "127.0.0.1",
      port: 7545,
      network_id: "*", //match any kind of network id
    },
  },

  contracts_directory: "./src/contracts/",
  contracts_build_directory: "./src/abis/",
  // Set default mocha options here, use special reporters etc.
  mocha: {
    // timeout: 100000
  },

  // Configure your compilers
  compilers: {
    solc: {
      // version: "0.8.11", // Fetch exact version from solc-bin (default: truffle's version)
      optimizer: {
        enabled: true,
        runs: 200,
      },
      //  evmVersion: "byzantium"
    },
  },
};
