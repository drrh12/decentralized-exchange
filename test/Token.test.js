import { tokens } from "./helpers";

const Token = artifacts.require("./Token");
require("chai").use(require("chai-as-promised")).should();

contract("Token", ([deployer, receiver]) => {
  const name = "FToken";
  const symbol = "FT";
  const decimals = "18";
  const totalSupply = tokens(1000000).toString();
  let token;

  beforeEach(async () => {
    token = await Token.new();
  });

  describe("deployment", (deployment) => {
    it("tracks the name", async () => {
      //Read token name here
      //The token name is flavio
      const result = await token.name();
      result.should.equal(name);
    });

    it("tracks the symbol", async () => {
      const result = await token.symbol();
      result.should.equal(symbol);
    });
    it("tracks the decimals", async () => {
      const result = await token.decimals();
      result.toString().should.equal(decimals);
    });

    it("tracks the total sypply", async () => {
      const result = await token.totalSupply();
      result.toString().should.equal(totalSupply.toString());
    });

    it("it assigns the total supply to the supplier", async () => {
      const result = await token.balanceOf(deployer);
      result.toString().should.equal(totalSupply.toString());
    });
  });

  describe("sending tokens", () => {
    let amount;
    let result;
    beforeEach(async () => {
      amount = tokens(100);
      result = await token.transfer(receiver, amount, {
        from: deployer,
      });
    });

    it("transfers token balances", async () => {
      let balanceOf;
      //after transfer
      balanceOf = await token.balanceOf(deployer);
      balanceOf.toString().should.equal(tokens(999900).toString());
      console.log("deployer after", balanceOf.toString());

      balanceOf = await token.balanceOf(receiver);
      balanceOf.toString().should.equal(tokens(100).toString());

      console.log("receiver after", balanceOf.toString());
    });

    it("emits a transfer event", async () => {
      const log = result.logs[0];
      log.event.should.eq("Transfer");
      const event = log.args;
      event.from.toString().should.equal(deployer, "from is correct");
      event.value.toString().should.equal(amount.toString());
    });
  });
});
