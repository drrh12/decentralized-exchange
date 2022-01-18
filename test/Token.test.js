const Token = artifacts.require("./Token");
require("chai").use(require("chai-as-promised")).should();

contract("Token", ([deployer, receiver]) => {
  const name = "FToken";
  const symbol = "FT";
  const decimals = "18";
  const totalSupply = "1000000000000000000000000";
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
      result.toString().should.equal(totalSupply);
    });

    it("it assigns the total supply to the supplier", async () => {
      const result = await token.balanceOf(deployer);
      result.toString().should.equal(totalSupply);
    });
  });

  describe("sending tokens", () => {
    it("transfers token balances", async () => {
      let balanceOf;
      //before transfer
      balanceOf = await token.balanceOf(deployer);
      console.log("deployer balance", balanceOf.toString());
      balanceOf = await token.balanceOf(receiver);
      console.log("receiver balance", balanceOf.toString());

      //transfer
      await token.transfer(receiver, "1000000000000000000000000", {
        from: deployer,
      });
      //after transfer

      balanceOf = await token.balanceOf(deployer);
      console.log("deployer after", balanceOf.toString());
      balanceOf = await token.balanceOf(receiver);
      console.log("receiver after", balanceOf.toString());
    });
  });
});
