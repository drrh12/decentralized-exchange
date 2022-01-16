// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.9.0;

contract Token {
    string public name = "FToken";
    string public symbol = "FT";
    uint256 public decimals = 18;
    uint256 public totalSupply;

    //Track balances
    mapping(address => uint256) public balanceOf;
    //Send balances


    constructor() public {
        totalSupply = 1000000 * (10 ** decimals);
        balanceOf[msg.sender] = totalSupply;
    }
}

