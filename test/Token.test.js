const Token = artifacts.require("./Token");
require("chai").use(require("chai-as-promised")).should();

contract("Token", (accounts) => {
  describe("deployment", (deployment) => {
    it("tracks the name", async () => {
      //Read token name here
      //The token name is flavio
      const token = await Token.new();
      const result = await token.name();
      result.should.equal("flavio");
    });
  });
});
