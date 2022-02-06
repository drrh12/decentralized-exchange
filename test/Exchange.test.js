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

    let result;
    let amount;

    beforeEach(async () => {
        amount = tokens(10);
        await token.approve(exchange.address, amount), { from: user1 });

        result = await exchange.depositToken(token.address, amount, {from: user1})
    });

    decribe("success", () => {
        it("tracks the token deposit", async () => {});
        //Check exchange token balance
        let balance;
        balance = await token.balanceOf(exchange.address);
        balance.toString().should.equal((amount).toString());
    
      });
    
      decribe("failure", () => {});

});
