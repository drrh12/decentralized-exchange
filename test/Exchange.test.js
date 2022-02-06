import { tokens, EVM_REVERT } from "./helpers";

const Token = artifacts.require("./Token");
const Exchange = artifacts.require("./Exchange");

require("chai").use(require("chai-as-promised")).should();

contract("Exchange", ([deployer, feeAccount, user1]) => {
  let token;
  let exchange;
  const feePercent = 1;

  beforeEach(async () => {
    token = await Token.new();
    exchange = await Exchange.new(feeAccount, feePercent);
  });

  describe("deployment", (deployment) => {
    it("tracks the fee account", async () => {
      const result = await exchange.feeAccount();
      result.should.equal(feeAccount);
    });

    it("tracks the fee percent", async () => {
      const result = await exchange.feePercent();
      result.toString().should.equal(feePercent.toString());
    });
  });

  describe("depositing tokens", (deployment) => {
    beforeEach(async () => {
      await token.approve(exchange.address, tokens(10), { from:  });
    });

    decribe("success", () => {
      it("tracks the token deposit", async () => {});
    });

    decribe("failure", () => {});
  });
});
3;
