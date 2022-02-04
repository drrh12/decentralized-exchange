pragma solidity >=0.4.22 <0.9.0;

contract Exchange {
    //vars
    address public feeAccount; // receive exchange fees
    uint256 public feePercent; // the fee percentage

    constructor(address _feeAccount, uint256 _feePercent) public {
        feeAccount = _feeAccount;
        feePercent = _feePercent;
    }
}

// Deposit and Withdraw

// Manage Orders - Make or Cancel

// Handle Trades - Charge fees

// TO DO:
// [] Set the fee account
// [] Deposit Ether
// [] Withdraw Ether
// [] Deposit Tokens
// [] Withdraw Tokens
// [] Check balances
// [] Make order
// [] Cancel order
// [] Fill order
// [] Charge fees