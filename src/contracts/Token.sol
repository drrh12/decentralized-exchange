// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.9.0;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract Token {
    using SafeMath for uint;
    
    //Variables
    string public name = "FToken";
    string public symbol = "FT";
    uint256 public decimals = 18;
    uint256 public totalSupply;

    //Events
    event Transfer(address indexed from, address indexed to, uint256 value);

    //Track balances
    mapping(address => uint256) public balanceOf;
    //Send balances

    constructor() {
        totalSupply = 1000000 * (10 ** decimals);
        balanceOf[msg.sender] = totalSupply;
    }

    function transfer(address _to, uint256 _value) public returns (bool success) {
        balanceOf[msg.sender] = balanceOf[msg.sender].sub(_value);
        balanceOf[_to] = balanceOf[_to].add(_value);
        emit Transfer(msg.sender, _to, _value);
        return true;
    }
}

